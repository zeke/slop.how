import { describe, expect, it } from "vitest";
import {
	charged,
	Manifest,
	parseResponse,
	questions,
	Result,
	type Sample,
	summarize,
} from "../script/media-eval/core.ts";

const sample: Sample = {
	id: "one",
	group: "scene",
	split: "development",
	modality: "image",
	file: "one.jpg",
	sha256: "a".repeat(64),
	source: "fixture",
	provenance: "unknown",
	width: 100,
	height: 100,
	labeler: "assistant-provisional",
	notes: "fixture",
	labels: {
		garbled_text: "present",
		plastic_sheen: "absent",
		anatomy_errors: "unassessable",
		stock_cliche: "absent",
	},
};
const result: Result = {
	sampleId: "one",
	model: "clef",
	status: "succeeded",
	reservedUsd: 0.02,
	costUsd: 0.001,
	probabilities: {
		garbled_text: 0.8,
		plastic_sheen: 0.7,
		anatomy_errors: 0.9,
		stock_cliche: 0.2,
	},
};
describe("media evaluation", () => {
	it("rejects source-group leakage and duplicate identifiers", () => {
		expect(() =>
			Manifest.parse({
				version: "1",
				samples: [sample, { ...sample, id: "two", split: "heldout" }],
			}),
		).toThrow(/leaks/);
		expect(() =>
			Manifest.parse({ version: "1", samples: [sample, sample] }),
		).toThrow(/Duplicate id/);
	});
	it("rejects a duplicate asset disguised as an independent group", () => {
		expect(() =>
			Manifest.parse({
				version: "1",
				samples: [sample, { ...sample, id: "two", group: "other" }],
			}),
		).toThrow(/different source groups/);
	});
	it("requires labels and video duration", () => {
		expect(() =>
			Manifest.parse({ version: "1", samples: [{ ...sample, labels: {} }] }),
		).toThrow(/Missing label/);
		expect(() =>
			Manifest.parse({
				version: "1",
				samples: [{ ...sample, modality: "video" }],
			}),
		).toThrow(/duration/);
	});
	it("asks temporal questions only for video", () => {
		expect(questions("image")).not.toHaveProperty("temporal_morphing");
		expect(questions("video")).toHaveProperty("temporal_morphing");
	});
	it("rejects missing answers and out-of-range probabilities", () => {
		expect(() =>
			parseResponse({ answers: {}, usage: { input_tokens: 10 } }, "image"),
		).toThrow(/Missing model answer/);
		expect(() =>
			parseResponse(
				{
					answers: { garbled_text: { type: "noul", noul: 1.2 } },
					usage: { input_tokens: 10 },
				},
				"image",
			),
		).toThrow();
	});
	it("separates false positives, missing calls and unassessable labels", () => {
		const rows = summarize([sample], [result]);
		expect(rows.find((r) => r.factor === "garbled_text")).toMatchObject({
			tp: 1,
			fn: 0,
			recall: 1,
		});
		expect(rows.find((r) => r.factor === "plastic_sheen")).toMatchObject({
			fp: 1,
			tn: 0,
			falsePositiveRate: 1,
			recall: null,
		});
		expect(rows.find((r) => r.factor === "anatomy_errors")).toMatchObject({
			tp: 0,
			fp: 0,
			unassessable: 1,
			falsePositiveRate: null,
		});
		expect(
			summarize([sample], [{ ...result, status: "failed" }])[0],
		).toMatchObject({ missing: 1, falsePositiveRate: null, recall: null });
	});
	it("reports source groups separately from correlated sample counts", () => {
		const rows = summarize(
			[sample, { ...sample, id: "two" }],
			[result, { ...result, sampleId: "two" }],
		);
		expect(rows.find((r) => r.factor === "garbled_text")).toMatchObject({
			tp: 2,
			groups: 1,
			positiveGroups: 1,
		});
	});
	it("keeps interrupted and failed calls charged at their reserved ceiling", () => {
		expect(charged(result)).toBe(0.001);
		expect(charged({ ...result, status: "pending" })).toBe(0.02);
		expect(charged({ ...result, status: "failed" })).toBe(0.02);
	});
});

import pilot from "../evaluation/media/results/pilot.json" with {
	type: "json",
};
import resolution from "../evaluation/media/results/resolution.json" with {
	type: "json",
};

it("validates the recorded pilot and recomputes its reported confusion counts", () => {
	for (const snapshot of [pilot, resolution]) {
		const manifest = Manifest.parse(snapshot.config.manifest);
		const results = snapshot.ledger.results.map((row) => Result.parse(row));
		expect(summarize(manifest.samples, results)).toEqual(
			snapshot.summary.metrics,
		);
		for (const row of results) {
			const sample = manifest.samples.find((s) => s.id === row.sampleId);
			if (!sample) throw new Error("Unknown sample");
			const responses: Record<string, unknown> = snapshot.responses;
			const parsed = parseResponse(
				responses[`${row.sampleId}-${row.model}`],
				sample.modality,
			);
			expect(parsed.probabilities).toEqual(row.probabilities);
			expect(parsed.inputTokens).toEqual(row.inputTokens);
		}
	}
});
