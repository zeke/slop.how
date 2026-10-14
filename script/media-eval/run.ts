import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
	charged,
	Manifest,
	Model,
	models,
	parseResponse,
	questions,
	Result,
	STATE,
	summarize,
	VERSION,
} from "./core.ts";

const exec = promisify(execFile);
const [manifestArg, outputArg, mode = "plan"] = process.argv.slice(2);
if (!manifestArg || !outputArg || !["plan", "run"].includes(mode))
	throw new Error(
		"Usage: script/evaluate-media <manifest.json> <output-directory> [plan|run]",
	);
const manifestPath = resolve(manifestArg);
const output = resolve(outputArg);
const manifest = Manifest.parse(
	JSON.parse(await readFile(manifestPath, "utf8")),
);
const budgetUsd = 1;
const sha = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");
const fingerprint = sha(
	JSON.stringify({
		manifest,
		VERSION,
		STATE,
		questions: [questions("image"), questions("video")],
		models,
	}),
);
const jobs = manifest.samples.flatMap((sample) =>
	(sample.modality === "video" ? [Model.enum["clef-omni"]] : Model.options).map(
		(model) => ({
			sample,
			model,
			reservedUsd: (models[model].context * models[model].price) / 1e6,
		}),
	),
);
// Inspect every asset before spending anything. Metadata comes from the decoder, not filenames.
for (const sample of manifest.samples) {
	const file = resolve(dirname(manifestPath), sample.file);
	const size = (await stat(file)).size;
	const cap = (sample.modality === "image" ? 4 : 16) * 1024 * 1024;
	if (size > cap) throw new Error(`${sample.id}: exceeds ${cap} bytes`);
	if (sha(await readFile(file)) !== sample.sha256)
		throw new Error(`${sample.id}: asset hash changed`);
	const { stdout } = await exec(
		"ffprobe",
		[
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,codec_name,width,height:format=duration",
			"-of",
			"json",
			file,
		],
		{ timeout: 30_000 },
	);
	const metadata = z
		.object({
			streams: z.array(
				z.object({
					codec_type: z.string(),
					codec_name: z.string(),
					width: z.number().optional(),
					height: z.number().optional(),
				}),
			),
			format: z.object({ duration: z.string().optional() }),
		})
		.parse(JSON.parse(stdout));
	const visual = metadata.streams.find((s) => s.codec_type === "video");
	if (
		!visual ||
		visual.width !== sample.width ||
		visual.height !== sample.height
	)
		throw new Error(`${sample.id}: dimension mismatch`);
	if (
		sample.modality === "image" &&
		(sample.width * sample.height > 16_000_000 ||
			!["mjpeg", "png", "webp"].includes(visual.codec_name))
	)
		throw new Error(`${sample.id}: unsupported image`);
	if (
		sample.modality === "video" &&
		(visual.codec_name !== "h264" ||
			!metadata.format.duration ||
			!Number.isFinite(Number(metadata.format.duration)) ||
			Number(metadata.format.duration) <= 0 ||
			Number(metadata.format.duration) > 60 ||
			Math.abs(
				Number(metadata.format.duration) - (sample.durationSeconds ?? 0),
			) > 0.05)
	)
		throw new Error(`${sample.id}: unsupported video codec or duration`);
}
const maxCost = jobs.reduce((sum, job) => sum + job.reservedUsd, 0);
console.log(
	`${manifest.samples.length} samples, ${jobs.length} calls; conservative full-context reservation $${maxCost.toFixed(4)} / $${budgetUsd}`,
);
if (mode === "plan") process.exit(0);
await mkdir(output, { recursive: true });
const lock = join(output, ".lock");
await mkdir(lock); // An interrupted run requires inspecting its ledger before removing the lock.
try {
	const ledgerPath = join(output, "ledger.json");
	const Ledger = z.object({
		fingerprint: z.string(),
		results: z.array(Result),
	});
	let ledger: z.infer<typeof Ledger> = { fingerprint, results: [] };
	try {
		ledger = Ledger.parse(JSON.parse(await readFile(ledgerPath, "utf8")));
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error;
	}
	if (ledger.fingerprint !== fingerprint)
		throw new Error(
			"Inputs, labels, prompts, or model metadata changed. Use a new output directory and account for prior spend.",
		);
	const save = async () => {
		await writeFile(
			join(output, "ledger.tmp"),
			JSON.stringify(ledger, null, 2),
		);
		await rename(join(output, "ledger.tmp"), ledgerPath);
	};
	await writeFile(
		join(output, "config.json"),
		JSON.stringify(
			{
				version: VERSION,
				manifest,
				models,
				state: STATE,
				imageQuestions: questions("image"),
				videoQuestions: questions("video"),
				budgetUsd,
			},
			null,
			2,
		),
	);
	for (const { sample, model, reservedUsd } of jobs) {
		if (
			ledger.results.some((r) => r.sampleId === sample.id && r.model === model)
		)
			continue;
		if (
			ledger.results.reduce((sum, r) => sum + charged(r), 0) + reservedUsd >
			budgetUsd
		)
			throw new Error("Budget exhausted; no call made");
		const row: Result = {
			sampleId: sample.id,
			model,
			status: "pending",
			reservedUsd,
		};
		ledger.results.push(row);
		await save(); // Reserve before dispatch, including calls interrupted after the provider charges.
		const bodyPath = join(output, "request.json");
		const rawPath = join(output, `${sample.id}-${model}.json`);
		const started = performance.now();
		try {
			const file = resolve(dirname(manifestPath), sample.file);
			const mime: Record<string, string> = {
				".jpg": "image/jpeg",
				".jpeg": "image/jpeg",
				".png": "image/png",
				".webp": "image/webp",
				".mp4": "video/mp4",
			};
			const contentType = mime[extname(file).toLowerCase()];
			if (!contentType) throw new Error("Unsupported file extension");
			const encoded = (await readFile(file)).toString("base64");
			await writeFile(
				bodyPath,
				JSON.stringify({
					model,
					state: STATE,
					questions: questions(sample.modality),
					[sample.modality === "image" ? "images" : "videos"]: [
						{ content_type: contentType, base64: encoded },
					],
				}),
				{ mode: 0o600 },
			);
			const { stdout } = await exec(
				"npx",
				[
					"--no-install",
					"cf",
					"ai",
					"run",
					`@cf/cloudflare/${model}`,
					"--body",
					`@${bodyPath}`,
				],
				{ timeout: 90_000, maxBuffer: 4 * 1024 * 1024 },
			);
			await writeFile(rawPath, stdout);
			const parsed = parseResponse(JSON.parse(stdout), sample.modality);
			Object.assign(row, {
				status: "succeeded",
				...parsed,
				costUsd: (parsed.inputTokens * models[model].price) / 1e6,
			});
		} catch (error) {
			row.status = "failed";
			row.error =
				error instanceof Error ? error.message : "Unknown inference failure";
		} finally {
			row.latencyMs = performance.now() - started;
			await rm(bodyPath, { force: true });
			await save();
		}
		console.log(
			`${sample.id} ${model}: ${row.status} (${Math.round(row.latencyMs ?? 0)} ms)`,
		);
	}
	const summary = {
		version: VERSION,
		threshold: 0.5,
		provisionalLabels: manifest.samples.some(
			(s) => s.labeler !== "human-reviewed",
		),
		spentOrReservedUsd: ledger.results.reduce((sum, r) => sum + charged(r), 0),
		successfulCalls: ledger.results.filter((r) => r.status === "succeeded")
			.length,
		failedOrInterruptedCalls: ledger.results.filter(
			(r) => r.status !== "succeeded",
		).length,
		metrics: summarize(manifest.samples, ledger.results),
	};
	await writeFile(
		join(output, "summary.json"),
		JSON.stringify(summary, null, 2),
	);
	console.log(
		JSON.stringify({
			successfulCalls: summary.successfulCalls,
			failedOrInterruptedCalls: summary.failedOrInterruptedCalls,
			spentOrReservedUsd: summary.spentOrReservedUsd,
		}),
	);
	if (summary.failedOrInterruptedCalls) process.exitCode = 1;
} finally {
	await rm(lock, { recursive: true });
}
