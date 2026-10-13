import { describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { models } from "../src/clef.ts";
import exampleResponse from "../src/example-response.json" with {
	type: "json",
};
import { factorIds, factors } from "../src/factors.ts";
import { AnalyzeResponse } from "../src/schema.ts";
import { fakeAi } from "./helpers.ts";

const get = (url: string) => app.request(url, {}, { AI: fakeAi() });

describe("GET / (website)", () => {
	it("serves a minimal HTML page", async () => {
		const res = await get("https://slop.how/");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/^text\/html/);
		const html = await res.text();
		expect(html).toMatch(/^<!doctype html>/i);
		expect(html).toContain("<title>slop.how</title>");
		expect(html).toContain(
			'<p class="tagline">A fast and free API for analyzing sloppy writing.</p>',
		);
		expect(html).toContain(
			'<meta name="description" content="A fast and free API for analyzing sloppy writing.">',
		);
	});

	it("includes a copy-paste agent prompt that names slop.how", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toContain("Use slop.how to review this text:");
		expect(html).toContain("In today's fast-paced digital landscape");
		expect(html).toContain('<a href="https://api.slop.how">api.slop.how</a>');
	});

	it("lets agents find llms.txt from the homepage", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toContain(
			'<link rel="alternate" type="text/markdown" href="/llms.txt"',
		);
		expect(html).toContain('<a class="path" href="/llms.txt">/llms.txt</a>');
	});

	it("points the prompt and API link at the serving host on previews", async () => {
		const origin = "https://pr-12-clef-slop-detector.ziki.workers.dev";
		const html = await (await get(`${origin}/`)).text();
		expect(html).toContain(`Use ${origin} to review this text:`);
		expect(html).toContain(
			`<a href="${origin}">pr-12-clef-slop-detector.ziki.workers.dev</a>`,
		);
		expect(html).not.toContain("Use slop.how");
	});

	it("puts the copy button inside the prompt block", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toMatch(
			/<div class="box">\s*<button[^>]*>copy<\/button>\s*<pre id="prompt">/,
		);
	});

	it("uses a drippy display font for the heading", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toContain("family=Creepster");
		expect(html).toMatch(/h1 \{[^}]*Creepster/);
	});

	it("oozes the wordmark with a drifting SVG displacement filter", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toMatch(/h1 span \{[^}]*filter: url\(#ooze\)/);
		expect(html).toContain('<filter id="ooze"');
		expect(html).toContain('<span class="dot">.</span>');
		expect(html).toContain('<filter id="ooze-dot"');
		expect(html).toContain('<feTurbulence id="ooze-noise"');
		expect(html).toContain("prefers-reduced-motion: reduce");
	});

	it("has an example API response that matches the response schema", () => {
		const parsed = AnalyzeResponse.parse(exampleResponse);
		expect(parsed.factors.canned_opening.probability).toBeGreaterThan(0.7);
	});

	it("shows every factor's example score as a bar, highest first", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toMatch(
			/<a href="https:\/\/api\.slop\.how">api\.slop\.how<\/a> responds with:/,
		);
		const list = html.match(
			/<ul class="scores" id="response">([\s\S]*?)<\/ul>/,
		)?.[1];
		const ids = [...(list ?? "").matchAll(/<a href="#(\w+)">/g)].map(
			(m) => m[1],
		);
		expect(ids).toEqual(Object.keys(exampleResponse.factors));
		expect(list).toContain(
			'<li class="score hot"><a href="#canned_opening">canned_opening</a><span class="bar"><span style="width: 95%"></span></span><span class="value">0.95</span></li>',
		);
		expect(list).toMatch(/<li class="score"><a href="#hype_adjectives">/);
	});

	it("lists every model with its price", async () => {
		const html = await (await get("https://slop.how/")).text();
		for (const [id, model] of Object.entries(models)) {
			expect(html).toContain(`<code class="name">${id}</code>`);
			expect(html).toContain(
				`$${model.pricePerMillionInputTokens} per million input tokens`,
			);
		}
	});

	it("lists every factor as a deep-linkable label and instruction", async () => {
		const html = await (await get("https://slop.how/")).text();
		for (const id of factorIds) {
			const item = html.match(
				new RegExp(`<li class="row" id="${id}">(.*?)</li>`),
			)?.[1];
			expect(item).toContain(
				`<a class="name" href="#${id}">${factors[id].label.replace("&", "&amp;")}</a>`,
			);
		}
		expect(html).toContain(
			"Negation reframe</a><p>Does the text set up a contrast",
		);
	});

	it("links to the GitHub repo with an Octocat icon", async () => {
		const html = await (await get("https://slop.how/")).text();
		expect(html).toMatch(
			/<a [^>]*href="https:\/\/github\.com\/zeke\/slop\.how"[^>]*>\s*<svg/,
		);
	});

	it("redirects the API host to the OpenAPI document", async () => {
		const res = await get("https://api.slop.how/");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/openapi.json");
	});

	it("is served on local dev hosts", async () => {
		const res = await get("http://localhost:5190/");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/^text\/html/);
	});
});

describe("GET /llms.txt host handling", () => {
	it("points slop.how readers at the API host", async () => {
		const body = await (await get("https://slop.how/llms.txt")).text();
		expect(body).toContain("POST https://api.slop.how/v1/analyze");
		expect(body).not.toContain("https://slop.how/v1/");
	});

	it("uses the request origin elsewhere", async () => {
		const body = await (await get("http://localhost:5174/llms.txt")).text();
		expect(body).toContain("POST http://localhost:5174/v1/analyze");
	});
});
