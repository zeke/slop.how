export const SITE_HOST = "slop.how";
export const API_ORIGIN = "https://api.slop.how";
export const REPO_URL = "https://github.com/zeke/slop.how";

import { models } from "./clef.ts";
// A real response for the sample text below, captured from production.
// Tests validate it against AnalyzeResponse so it can't drift from the schema.
import exampleResponse from "./example-response.json" with { type: "json" };
import { factorIds, factors } from "./factors.ts";

const escapeHtml = (s: string) =>
	s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Each factor is deep-linkable at #<factor id>, matching the API's keys.
const factorList = factorIds
	.map(
		(id) =>
			`<li class="row" id="${id}"><a class="name" href="#${id}">${escapeHtml(factors[id].label)}</a><p>${escapeHtml(factors[id].instructions)}</p></li>`,
	)
	.join("\n");

// The example response as bars, highest probability first (the API's order).
// Factors under 0.5 are dimmed, matching the llms.txt review threshold.
// Each row toggles open the factor's question and how to fix it.
const scoreList = Object.entries(exampleResponse.factors)
	.map(([id, { probability }]) => {
		const hot = probability >= 0.5 ? " hot" : "";
		const factor = factors[id as keyof typeof factors];
		return `<li class="score${hot}"><details><summary><span class="id">${id}</span><span class="bar"><span style="width: ${Math.round(probability * 100)}%"></span></span><span class="value">${probability.toFixed(2)}</span></summary><div class="detail"><p>${escapeHtml(factor.instructions)}</p><p><span class="fix">Fix:</span> ${escapeHtml(factor.advice)}</p></div></details></li>`;
	})
	.join("\n");

const modelList = Object.entries(models)
	.map(
		([id, model]) =>
			`<li class="row"><code class="name">${id}</code><div><p>${escapeHtml(model.description)}</p><p class="price">$${model.pricePerMillionInputTokens} per million input tokens</p></div></li>`,
	)
	.join("\n");

/** Origin to advertise for API calls. The website host defers to the API host. */
export function apiOrigin(requestUrl: string): string {
	const url = new URL(requestUrl);
	return url.hostname === SITE_HOST ? API_ORIGIN : url.origin;
}

/**
 * What the prompt tells agents to use. On slop.how it's the bare host, which
 * agents resolve to the homepage and then to /llms.txt. Previews and local dev
 * use their full origin so agents don't guess the wrong scheme.
 */
function promptTarget(requestUrl: string): string {
	const url = new URL(requestUrl);
	return url.hostname === SITE_HOST ? SITE_HOST : url.origin;
}

const prompt = (target: string) => `Use ${target} to review this text:

In today's fast-paced digital landscape, remote work isn't just a trend. It's a revolution. By leveraging cutting-edge collaboration tools, teams can unlock unprecedented productivity and foster a culture of innovation. The result? A seamless, empowered workforce. Let's dive in.`;

// GitHub's mark-github octicon (16px).
const octocat = (size: number) =>
	`<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

// Cloudflare's cloud glyph, from the "cloudflare" symbol in https://www.cloudflare.com/icons.svg.
const cloudflareLogo = `<svg viewBox="0 0 341 156" width="66" height="30" aria-hidden="true"><g fill="currentColor"><path d="M275.125 68.25C311.507 68.25 341 97.9335 341 134.55C341 141.077 340.063 147.385 338.317 153.343C337.848 154.943 336.363 156 334.706 156H243.056C241.697 156 240.76 154.628 241.247 153.351L242.999 148.76C248.595 134.03 264.56 121.963 279.331 121.256L307.33 119.813C308.826 119.736 310 118.492 310 116.985C310 115.485 308.838 114.245 307.351 114.157L281.059 112.601C266.924 111.877 260.018 99.2932 263.82 86.179L268.195 71.0866C268.64 69.5514 269.971 68.4343 271.557 68.3476C272.738 68.2831 273.928 68.25 275.125 68.25Z"/><path d="M184.062 0C222 0 253.868 26.1297 262.882 61.4824C263.26 62.967 263.142 64.5333 262.601 65.9662L255.383 85.0897C249.787 99.8196 235.406 112.593 219.134 112.593L93.7928 114.043C92.2801 114.061 91.063 115.3 91.0625 116.823C91.0625 118.344 92.2776 119.585 93.789 119.605L217.365 121.248C231.531 121.248 238.406 134.556 234.606 147.671L233.011 153.189C232.53 154.855 231.014 156 229.291 156H3.90889C1.98075 156 0.330745 154.574 0.17634 152.64C0.0594555 151.175 0 149.695 0 148.2C0 119.723 21.6617 96.3403 49.306 93.8266C48.7387 91.2419 48.4375 88.5564 48.4375 85.8C48.4375 65.3379 64.919 48.75 85.25 48.75C93.3413 48.75 100.822 51.3789 106.897 55.8321C117.716 23.3806 148.176 0 184.062 0Z"/></g></svg>`;

const tagline = "A fast and free API for analyzing sloppy writing.";

/** The homepage, with links pointed at the host serving it. */
export function siteHtml(requestUrl: string): string {
	const api = apiOrigin(requestUrl);
	const apiHost = new URL(api).host;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>slop.how</title>
<meta name="description" content="${tagline}">
<link rel="alternate" type="text/markdown" href="/llms.txt" title="Instructions for agents">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Creepster&text=slop.how&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root { color-scheme: dark; --bg: #0e0f11; --ink: #f4f1ea; --prose: #b9bcc3; --muted: #8a8f98; --dim: #6b6f76; --pink: #ff3d8b; --rule: #2a2d33; --box: #15171a; --track: #1c1e22; --cold: #3a3d44; --mono: "JetBrains Mono", ui-monospace, monospace; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 18px/28px Inter, system-ui, sans-serif; }
main { container-type: inline-size; max-width: 1440px; margin: 0 auto; padding: 48px 72px 96px; }
a { color: inherit; text-decoration: none; }
a:hover { color: var(--pink); }
p, ul, h1, h2 { margin: 0; }
ul { padding: 0; list-style: none; }
code, .mono { font-family: var(--mono); }
.nowrap { white-space: nowrap; }
.label { font: 15px/20px var(--mono); letter-spacing: 0.08em; color: var(--pink); }
.label a { text-decoration: underline; text-underline-offset: 3px; }
nav { display: flex; justify-content: space-between; align-items: center; gap: 24px; font: 17px/24px var(--mono); color: var(--muted); }
nav div { display: flex; align-items: center; gap: 28px; }
nav .gh { color: var(--ink); display: inline-flex; }
.hero { padding: 96px 0 80px; text-align: center; }
h1 { font: 400 29.9cqi/0.93 Creepster, system-ui, sans-serif; letter-spacing: -0.01em; color: var(--pink); }
h1 span { filter: url(#ooze); }
h1 .dot { filter: url(#ooze-dot); }
.tagline { padding-top: 24px; font-weight: 600; font-size: clamp(28px, 3.4cqi, 44px); line-height: 1.2; letter-spacing: -0.02em; text-wrap: balance; }
.split { display: grid; grid-template-columns: 600fr 648fr; gap: 48px; }
.readout { column-gap: 96px; padding-top: 48px; border-top: 1px solid var(--rule); align-items: start; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.box { position: relative; padding: 22px 24px; border: 1px solid var(--rule); border-radius: 6px; background: var(--box); }
pre { margin: 0; font: 19px/30px var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
#copy { position: absolute; top: 12px; right: 12px; padding: 3px 10px; font: 600 14px/20px var(--mono); color: var(--bg); background: var(--pink); border: 0; border-radius: 4px; cursor: pointer; }
#copy:hover { filter: brightness(1.15); }
.scores { display: flex; flex-direction: column; gap: 14px; font: 19px/26px var(--mono); color: var(--dim); }
.score summary { display: flex; align-items: center; gap: 16px; cursor: pointer; list-style: none; }
.score summary::-webkit-details-marker { display: none; }
.score summary:hover .id, .score [open] .id { color: var(--pink); }
.score .id { width: 230px; flex-shrink: 0; overflow-wrap: anywhere; }
.detail { margin: 12px 0 8px; padding: 14px 18px; border-left: 2px solid var(--pink); background: var(--box); font: 17px/26px Inter, system-ui, sans-serif; color: var(--prose); }
.detail p + p { margin-top: 8px; }
.detail .fix { font-weight: 600; color: var(--ink); }
.bar { flex: 1; height: 10px; border-radius: 2px; background: var(--track); }
.bar span { display: block; height: 100%; border-radius: 2px; background: var(--cold); }
.value { width: 56px; flex-shrink: 0; text-align: right; }
.score.hot { color: var(--ink); }
.score.hot .bar span { background: var(--pink); }
.score.hot .value { color: var(--pink); }
section { display: flex; flex-direction: column; gap: 48px; padding-top: 120px; }
section header { display: flex; flex-direction: column; gap: 20px; }
h2 { max-width: 900px; font-weight: 600; font-size: clamp(30px, 3.4cqi, 44px); line-height: 1.18; letter-spacing: -0.02em; text-wrap: balance; }
.note { font: 17px/24px var(--mono); color: var(--muted); }
.rows { display: flex; flex-direction: column; }
.row { display: grid; grid-template-columns: 600fr 648fr; gap: 48px; padding: 32px 0; border-top: 1px solid var(--rule); scroll-margin-top: 24px; }
.row p { color: var(--prose); }
.row p + p { margin-top: 16px; }
.row .name { font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
.row .num { margin-right: 20px; font: 15px/20px var(--mono); color: var(--pink); }
.row:target { background: linear-gradient(90deg, color-mix(in srgb, var(--pink) 12%, transparent), transparent); }
.compact .row { padding: 24px 0; }
.compact .name, .compact code.name { font: 19px/30px var(--mono); }
.method { display: inline-block; width: 64px; color: var(--pink); }
.row .price { margin-top: 8px; font: 17px/24px var(--mono); color: var(--pink); }
footer { display: flex; justify-content: center; align-items: center; gap: 32px; margin-top: 120px; padding-top: 48px; border-top: 1px solid var(--rule); font: 19px/30px var(--mono); }
footer a { display: inline-flex; align-items: center; gap: 14px; }
@media (max-width: 900px) {
	body { font-size: 17px; line-height: 28px; }
	main { padding: 24px 20px 64px; }
	nav div { gap: 16px; }
	nav .path { display: none; }
	.hero { padding: 56px 0 48px; }
	.split, .row { grid-template-columns: minmax(0, 1fr); gap: 16px; }
	.readout { gap: 48px; }
	pre { font-size: 15px; line-height: 24px; }
	.box:has(#copy) { padding-top: 48px; }
	.scores { gap: 10px; font-size: 13px; line-height: 20px; }
	.score summary { gap: 10px; }
	.score .id { width: 165px; }
	.detail { font-size: 15px; line-height: 24px; }
	.value { width: 40px; }
	section { padding-top: 80px; }
	.row .name { font-size: 22px; line-height: 28px; }
}
</style>
</head>
<body>
<svg width="0" height="0" style="position: absolute" aria-hidden="true">
<filter id="ooze" x="-6%" y="-12%" width="112%" height="135%">
<feTurbulence id="ooze-noise" type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="1" seed="3"/>
<feDisplacementMap id="ooze-map" in="SourceGraphic" scale="48" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="ooze-dot" x="-50%" y="-50%" width="200%" height="200%">
<feTurbulence id="ooze-dot-noise" type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="1" seed="3"/>
<feDisplacementMap id="ooze-dot-map" in="SourceGraphic" scale="12" xChannelSelector="R" yChannelSelector="G"/>
</filter>
</svg>
<main>
<nav>
<a href="${api}">${apiHost}</a>
<div>
<a class="path" href="/llms.txt">/llms.txt</a>
<a class="path" href="${api}/v1/factors">/v1/factors</a>
<a class="path" href="${api}/openapi.json">/openapi.json</a>
<a class="gh" href="${REPO_URL}" aria-label="Open Source on GitHub">${octocat(28)}</a>
</div>
</nav>
<div class="hero">
<h1><span>slop</span><span class="dot">.</span><span>how</span></h1>
<p class="tagline">${tagline}</p>
</div>
<div class="split readout">
<div class="stack">
<p class="label">Paste this into your agent:</p>
<div class="box">
<button type="button" id="copy">copy</button>
<pre id="prompt">${prompt(promptTarget(requestUrl))}</pre>
</div>
</div>
<div class="stack">
<p class="label"><a href="${api}">${apiHost}</a> responds with:</p>
<ul class="scores" id="response">
${scoreList}
</ul>
</div>
</div>
<section id="how-it-works">
<header>
<p class="label">HOW IT WORKS</p>
<h2>It asks a decision model <span class="nowrap">yes-or-no</span> questions about your text.</h2>
</header>
<ul class="rows">
<li class="row"><p class="name"><span class="num">01</span>Decision models</p><div><p>Most AI models people use today are large language models. You give them a prompt and they write text back, one token at a time. That's slow and expensive when all you want is the answer to a yes-or-no question.</p><p><a href="https://developers.cloudflare.com/workers-ai/models/clef/">Clef</a> is a decision model. It takes some input plus a list of typed questions and returns a probability for every allowed answer. It reads the input once and answers all the questions in parallel, so there's no output to wait for and nothing to parse.</p></div></li>
<li class="row"><p class="name"><span class="num">02</span>Factors</p><div><p>A factor is one specific habit that shows up a lot in AI-generated writing: opening with "In today's fast-paced world," setting up "it's not X, it's Y," answering your own question for drama ("The result?"), or leaning on words like "leverage" and "seamless."</p><p>Each one is a yes-or-no question for Clef, with a note on how to fix it.</p></div></li>
<li class="row"><p class="name"><span class="num">03</span>Scores</p><div><p>Your text and all the questions go to Clef in a single call. A 0.95 means Clef is confident the habit is there, and 0.05 means it's confident it isn't. Long text is split into chunks, and each factor keeps its highest score.</p><p>There's no single "slop score," because any weighting would be a made-up number.</p></div></li>
<li class="row"><p class="name"><span class="num">04</span>Speed and cost</p><div><p>A 580-word blog post comes back in about a second. Clef charges $${models.clef.pricePerMillionInputTokens} per million input tokens and nothing for output, so a 500-word page costs about $0.0005, or about 1,800 checks for a dollar.</p></div></li>
<li class="row"><p class="name"><span class="num">05</span>Not an AI detector</p><div><p>It doesn't tell you whether a human or an AI wrote something. Clef is good at spotting the clichés but not at judging authorship: polished AI writing scored as human, and stiff human writing scored as AI. So the API reports the factors and leaves authorship alone.</p></div></li>
</ul>
</section>
<section id="factors">
<header>
<p class="label">THE FACTORS</p>
<h2>The habits it looks for, and the question it asks about each.</h2>
</header>
<ul class="rows">
${factorList}
</ul>
</section>
<section id="api">
<header>
<p class="label">THE API</p>
<h2>Send it text, get back a probability for each factor.</h2>
<p class="note">Base URL ${api} · no auth for now</p>
</header>
<ul class="rows compact">
<li class="row"><code class="name"><span class="method">POST</span>/v1/analyze</code><p>Score text against every factor. Takes <code>{ text, model? }</code>. Text can be up to 500,000 characters.</p></li>
<li class="row"><code class="name"><span class="method">GET</span><a href="${api}/v1/factors">/v1/factors</a></code><p>List the factors, the question asked about each, and how to fix it.</p></li>
<li class="row"><code class="name"><span class="method">GET</span><a href="${api}/openapi.json">/openapi.json</a></code><p>The full request and response contract.</p></li>
<li class="row"><code class="name"><span class="method">GET</span><a href="/llms.txt">/llms.txt</a></code><p>Instructions for agents, including how to turn scores into feedback.</p></li>
</ul>
<div class="stack">
<p class="label">MODELS</p>
<ul class="rows compact">
${modelList}
</ul>
</div>
</section>
<footer>
<a href="${REPO_URL}" aria-label="Open Source on GitHub">${octocat(32)}<span>github.com/zeke/slop.how</span></a>
<a href="${REPO_URL}#cloudflare" aria-label="Sponsored by Cloudflare" title="Sponsored by Cloudflare">${cloudflareLogo}</a>
</footer>
</main>
<script>
// Ooze the wordmark. The filter values are tuned for a 1296px-wide heading,
// so scale them to its real width. baseFrequency drifts along sine waves whose
// periods (seconds) never line up, so the goo never visibly repeats or rewinds.
// With reduced motion it stays melted but still.
const heading = document.querySelector("h1");
const noise = document.getElementById("ooze-noise");
const map = document.getElementById("ooze-map");
// The period is too small to survive full displacement, so it gets a quarter of it.
const dotNoise = document.getElementById("ooze-dot-noise");
const dotMap = document.getElementById("ooze-dot-map");
const wave = (t, a, b, pa, pb) => 0.6 * Math.sin((2 * Math.PI * t) / a + pa) + 0.4 * Math.sin((2 * Math.PI * t) / b + pb);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function ooze(ms) {
	const t = ms / 1000;
	const k = 1296 / heading.clientWidth;
	const fx = (0.008 + 0.002 * wave(t, 5.3, 8.9, 0, 1.3)) * k;
	const fy = (0.014 + 0.004 * wave(t, 6.1, 11.7, 2.1, 0.4)) * k;
	noise.setAttribute("baseFrequency", fx.toFixed(5) + " " + fy.toFixed(5));
	map.setAttribute("scale", (48 / k).toFixed(1));
	dotNoise.setAttribute("baseFrequency", fx.toFixed(5) + " " + fy.toFixed(5));
	dotMap.setAttribute("scale", (12 / k).toFixed(1));
	if (!still) requestAnimationFrame(ooze);
}
requestAnimationFrame(ooze);
if (still) addEventListener("resize", () => requestAnimationFrame(ooze));

const copy = document.getElementById("copy");
copy.addEventListener("click", async () => {
	await navigator.clipboard.writeText(document.getElementById("prompt").textContent);
	copy.textContent = "copied";
	setTimeout(() => { copy.textContent = "copy"; }, 1500);
});
</script>
</body>
</html>
`;
}
