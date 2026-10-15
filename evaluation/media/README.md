# Media evaluation

This experiment asks whether Clef can identify specific visible defects and
stylistic clichés well enough to give useful feedback. Provenance is metadata,
not a label or a public score. The milestone plan is in
[issue #17](https://github.com/zeke/slop.how/issues/17).

## Protocol

1. Select independent source groups before scoring. Related images, video clips,
   generated variations, and extracted frames belong to one group and split.
2. Label each applicable factor `present`, `absent`, or `unassessable`, with a
   reason. No visible text or body generally means the corresponding factor is
   absent; unclear detail means unassessable. Model scores must not decide labels.
3. Use development samples to revise questions. Freeze question version,
   preprocessing, models, and thresholds before opening held-out results.
4. Evaluate per factor, model, and modality. Report TP/FN/FP/TN, excluded labels,
   failed calls, source-group counts, latency, and cost. Recall is undefined when
   no positives exist. Do not treat correlated variants as independent evidence.
5. Before any public launch, get human-reviewed held-out labels. The pilot gate
   is recall >=80% and false-positive rate <=10%, using at least 20 positive and
   20 negative independent source groups per factor. Use one prespecified sample
   per group for the gate; resolution variants are diagnostic only. Report
   uncertainty intervals and the actual counts. The runner does not declare
   launch readiness from its sample-level metrics.

Initial candidates: garbled lettering, unnatural photographic material sheen,
structural anatomy errors, generic promotional stock composition, and (video
only) inconsistent temporal morphing. Questions live in
`script/media-eval/core.ts`, independent of the production text factors.

## Run

Requires Node matching `.node-version`, `script/bootstrap`, FFmpeg (`ffprobe`),
and an authenticated `cf` CLI. The runner uses the locally installed CLI through
`npx --no-install`. No new packages, tokens, or Worker deployments are needed.

```sh
script/evaluate-media evaluation/media/pilot.json evaluation/media/.local/pilot-run
script/evaluate-media evaluation/media/pilot.json evaluation/media/.local/pilot-run run
```

The default is a free preflight: validate Zod manifest, duplicate IDs, split
leakage, source hashes, decoded dimensions/codecs, duration and byte limits.
Files are resolved relative to the manifest. Assets and live-run directories
under `.local/` are ignored by Git. Restore source files at the paths in the
manifest and verify their hashes before repeating a run. Some sources live in
Zeke's other repos and are not distributed here. Source paths identify them;
public blog images also have URLs. The committed result snapshot allows offline
inspection without those files.

The runner limits each output directory to $1 in estimated inference charges.
Each attempt reserves the model's full-context input cost before dispatch.
Success replaces that reservation with token-based cost; failed or interrupted
attempts retain it. This assumes the verified catalog prices and context caps.
It is a local guard, not an account-wide billing limit. Track spend across output
directories manually. Generating source media is outside this budget.

Calls run sequentially to bound spend and simplify interruption recovery. Raw
responses, question/config snapshots, a ledger, and a summary are saved. Media
payloads are temporary and removed after each call. Latency includes CLI startup,
encoding and the request; it is not pure model latency.

Rerunning an unchanged manifest/output pair skips all attempted calls, including
failures. Nothing retries automatically. If a killed process leaves `.lock`,
inspect `ledger.json`, preserve pending reservations, then remove only the lock.
Changes to prompts, labels, assets or model metadata invalidate that run's
fingerprint. Preserve old results and budget for a separate experiment. Label
corrections can be assessed offline with `summarize`; they do not require new
inference. Recheck current provider prices before each new evaluation session.

## Human label review

Prepare a local review page without inference:

```sh
script/review-media prepare evaluation/media/pilot.json evaluation/media/.local/pilot-review
open evaluation/media/.local/pilot-review/index.html
```

The page shows the original media and current rubric. It hides source paths,
provenance, assistant labels, and model scores. This reduces anchoring, but a
reviewer may recognize the media or have already seen the pilot results.
Source bytes are hash-checked and copied into the review folder without resizing.
Keep that folder local; it contains the source media.

Enter your name, a judgment, and a reason for each applicable factor. Watch
videos at normal speed and include defect timestamps in the reasons. Drafts
stay in browser storage; export completed samples to retain a file. Incomplete
samples are omitted from the export. No answer is selected by default.

Apply the downloaded review to a new manifest:

```sh
script/review-media apply evaluation/media/pilot.json ~/Downloads/media-review.json evaluation/media/.local/pilot-reviewed.json
```

The importer checks manifest identity, question version, sample hashes, and
complete labels before marking a sample human-reviewed. It preserves unreviewed
samples, records the reviewer's name and reasons, and rebases asset paths.
It refuses to overwrite an existing output. Keep the exported review alongside
the new manifest. The frozen inference results and original manifest stay intact;
use the existing `summarize` function with reviewed samples and recorded results
to recompute metrics without inference. Human review does not turn development
samples into held-out evidence.

## Pilot limitations

`pilot.json` is a development corpus. Its labels were assigned by an assistant
before inference and need human review. It is mostly a difficult-negative probe:
there is only one provisional positive for each of sheen and stock composition,
and no positive lettering or anatomy examples. Videos are deliberately unlabeled
and excluded from accuracy metrics pending full temporal review.

The two generated videos share a reference image, as do the cannon stills; they
are one source group. Other groups are conservative collections of related work.
Some old blog JPEGs produce decoder warnings; original bytes were retained and
the warnings are noted in the manifest. The run tests source images without
resizing. Do not infer preprocessing quality or broad accuracy from it.

The next dataset needs clear factor positives, independently reviewed negatives,
more source groups, modern generated examples without defects, polished human
commercial photography, and full-rate video review. Add controlled 480p/720p
comparisons within development groups, then collect untouched held-out groups.
