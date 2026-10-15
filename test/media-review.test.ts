import { describe, expect, it } from "vitest";
import pilot from "../evaluation/media/pilot.json" with { type: "json" };
import { factorIds, Manifest, VERSION } from "../script/media-eval/core.ts";
import {
	applyReview,
	manifestHash,
	reviewData,
} from "../script/media-eval/review.ts";

const manifest = Manifest.parse(pilot);
const sample = manifest.samples[0];
if (!sample) throw new Error("Missing pilot sample");
const review = {
	manifestHash: manifestHash(manifest),
	questionVersion: VERSION,
	reviewer: "Test reviewer",
	samples: [
		{
			id: "sample-1",
			sha256: sample.sha256,
			labels: Object.fromEntries(
				factorIds(sample.modality).map((id) => [
					id,
					{ label: "absent", reason: "Test judgment" },
				]),
			),
		},
	],
};

describe("blind media review", () => {
	it("omits provenance, source, notes, prior labels and source filenames", () => {
		const data = reviewData(manifest);
		for (const row of data.samples) {
			expect(Object.keys(row).sort()).toEqual([
				"factors",
				"id",
				"media",
				"modality",
				"sha256",
			]);
		}
		const json = JSON.stringify(data);
		expect(json).not.toContain("assistant-provisional");
		expect(json).not.toContain(sample.source);
		for (const sample of manifest.samples)
			expect(json).not.toContain(`"${sample.id}"`);
		expect(json).not.toContain(sample.notes);
		expect(
			data.samples.find((s) => s.modality === "image")?.factors,
		).not.toContain("temporal_morphing");
		expect(data.samples.find((s) => s.modality === "video")?.factors).toContain(
			"temporal_morphing",
		);
	});
	it("promotes only complete reviewed samples and preserves the source manifest", () => {
		const original = JSON.stringify(manifest);
		const result = applyReview(manifest, review);
		expect(result.samples[0]?.labeler).toBe("human-reviewed");
		expect(result.samples[0]?.notes).toContain("Test reviewer");
		expect(result.samples[0]?.notes).toContain(
			"garbled_text: absent. Test judgment",
		);
		expect(result.samples.slice(1)).toEqual(manifest.samples.slice(1));
		expect(JSON.stringify(manifest)).toBe(original);
	});
	it("rejects incomplete, blank, duplicate, unknown and changed reviews", () => {
		const row = review.samples[0];
		if (!row) throw new Error("Missing test review");
		for (const invalid of [
			{ ...review, reviewer: " " },
			{ ...review, samples: [] },
			{ ...review, manifestHash: "changed" },
			{ ...review, questionVersion: "stale" },
			{ ...review, samples: [row, row] },
			{ ...review, samples: [{ ...row, id: "unknown" }] },
			{ ...review, samples: [{ ...row, sha256: "changed" }] },
			{ ...review, samples: [{ ...row, labels: {} }] },
			{
				...review,
				samples: [
					{
						...row,
						labels: {
							...row.labels,
							garbled_text: { label: "absent", reason: " " },
						},
					},
				],
			},
			{
				...review,
				samples: [
					{
						...row,
						labels: {
							...row.labels,
							temporal_morphing: { label: "absent", reason: "Not applicable" },
						},
					},
				],
			},
		])
			expect(() => applyReview(manifest, invalid)).toThrow();
	});
});
