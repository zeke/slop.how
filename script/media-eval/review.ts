import { createHash } from "node:crypto";
import { extname } from "node:path";
import { z } from "zod";
import { FactorId, factorIds, factors, Manifest, VERSION } from "./core.ts";

export const Review = z.object({
	manifestHash: z.string(),
	questionVersion: z.literal(VERSION),
	reviewer: z.string().trim().min(1),
	samples: z
		.array(
			z.object({
				id: z.string(),
				sha256: z.string(),
				labels: z.partialRecord(
					FactorId,
					z.object({
						label: z.enum(["present", "absent", "unassessable"]),
						reason: z.string().trim().min(1),
					}),
				),
			}),
		)
		.min(1),
});

export function manifestHash(manifest: z.infer<typeof Manifest>) {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

// Only this projection enters the browser. Sources, prior labels and scores stay out.
export function reviewData(manifest: z.infer<typeof Manifest>) {
	return {
		manifestHash: manifestHash(manifest),
		questionVersion: VERSION,
		factors,
		samples: manifest.samples.map((sample, index) => ({
			id: `sample-${index + 1}`,
			sha256: sample.sha256,
			modality: sample.modality,
			media: `media/${index}${extname(sample.file).toLowerCase()}`,
			factors: factorIds(sample.modality),
		})),
	};
}

export function applyReview(
	manifest: z.infer<typeof Manifest>,
	input: unknown,
) {
	const review = Review.parse(input);
	if (review.manifestHash !== manifestHash(manifest))
		throw new Error("Review belongs to a different manifest");
	const samples = new Map(
		manifest.samples.map((sample, index) => [`sample-${index + 1}`, sample]),
	);
	const reviewed = new Map<
		string,
		z.infer<typeof Manifest>["samples"][number]
	>();
	for (const row of review.samples) {
		const sample = samples.get(row.id);
		if (!sample || sample.sha256 !== row.sha256)
			throw new Error(`Unknown or changed sample: ${row.id}`);
		if (reviewed.has(sample.id)) throw new Error(`Duplicate review: ${row.id}`);
		const ids = factorIds(sample.modality);
		if (Object.keys(row.labels).some((id) => !ids.includes(FactorId.parse(id))))
			throw new Error(`Inapplicable factor: ${row.id}`);
		const labels = { ...sample.labels };
		const reasons = [];
		for (const id of ids) {
			const judgment = row.labels[id];
			if (!judgment) throw new Error(`Incomplete review: ${row.id}/${id}`);
			labels[id] = judgment.label;
			reasons.push(`${id}: ${judgment.label}. ${judgment.reason}`);
		}
		reviewed.set(sample.id, {
			...sample,
			labels,
			labeler: "human-reviewed",
			notes: `${sample.notes}\nHuman review by ${review.reviewer} (${VERSION}):\n${reasons.join("\n")}`,
		});
	}
	return Manifest.parse({
		version: `${manifest.version}-reviewed`,
		samples: manifest.samples.map(
			(sample) => reviewed.get(sample.id) ?? sample,
		),
	});
}
