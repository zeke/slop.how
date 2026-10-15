import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { Manifest } from "./core.ts";
import { applyReview, reviewData } from "./review.ts";

const [mode, manifestArg, inputArg, outputArg] = process.argv.slice(2);
if (
	!manifestArg ||
	!inputArg ||
	!["prepare", "apply"].includes(mode ?? "") ||
	(mode === "apply" && !outputArg)
)
	throw new Error(
		"Usage: script/review-media prepare <manifest.json> <new-output-dir> | apply <manifest.json> <review.json> <new-manifest.json>",
	);
const manifestPath = resolve(manifestArg);
const manifest = Manifest.parse(
	JSON.parse(await readFile(manifestPath, "utf8")),
);
if (mode === "prepare") {
	const output = resolve(inputArg);
	const data = reviewData(manifest);
	await mkdir(output); // Refuse to overwrite an existing review and its browser drafts.
	await mkdir(join(output, "media"));
	for (const [index, sample] of manifest.samples.entries()) {
		const bytes = await readFile(resolve(dirname(manifestPath), sample.file));
		if (createHash("sha256").update(bytes).digest("hex") !== sample.sha256)
			throw new Error(`${sample.id}: asset hash changed`);
		const target = data.samples[index];
		if (!target) throw new Error("Missing review sample");
		await writeFile(join(output, target.media), bytes, { flag: "wx" });
	}
	const template = await readFile(
		new URL("./review.html", import.meta.url),
		"utf8",
	);
	await writeFile(
		join(output, "index.html"),
		template.replace('"__REVIEW_DATA__"', () =>
			JSON.stringify(data).replaceAll("<", "\\u003c"),
		),
		{ flag: "wx" },
	);
	console.log(
		`${manifest.samples.length} samples ready: ${join(output, "index.html")}`,
	);
} else if (outputArg) {
	const reviewed = applyReview(
		manifest,
		JSON.parse(await readFile(inputArg, "utf8")),
	);
	const output = resolve(outputArg);
	for (const sample of reviewed.samples)
		sample.file = relative(
			dirname(output),
			resolve(dirname(manifestPath), sample.file),
		);
	await writeFile(output, `${JSON.stringify(reviewed, null, 2)}\n`, {
		flag: "wx",
	});
	console.log(
		`Saved reviewed labels to ${output}; original manifest and inference results preserved.`,
	);
}
