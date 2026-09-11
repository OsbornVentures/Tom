# Harness repair and GGUF comparison

**Provisional grading correction:** the earlier game rows below record only page-load and first-click smoke checks. Review found that the later game stops after that click. Those rows must not be cited as functional game passes; stronger path-to-ending checks and an assisted repair are pending.

GGUF is a storage format; QAT describes training. Tom’s bundled E2B is Google’s QAT Q4_0 GGUF. Its SHA-256 matches the [official pinned package](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/blob/675cff42a74c774d6cb76f76d8eacb49b48c9b93/gemma-4-E2B_q4_0-it.gguf). The additional Q4_0 and Q8_0 files come from the same pinned [ggml-org instruction-tuned conversion](https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/tree/b4243c156154b6dca9324415f8c7ccc098b4aed1). Comparing that Q4/Q8 pair is a precision comparison; comparing either with the bundled QAT package also changes the checkpoint/training path.

## What failed and what changed

The reported game request exposed missing task continuity, content that exceeded a single structured response, and a false claim of cloud hosting. The repaired path preserves related user instructions, supplies observed local hardware facts, generates complete files separately from tool-call JSON, stages unfinished content, and applies the usual write/version/review checks when content is complete. Calculation prompts show the exact parsed argument shape used by execution. Function implementations and example generation use separate focused steps.

New HTML files receive a browser load check immediately after saving. The closing reply sees a concise artifact/check summary instead of the full source and tool catalog. Function tests use hash-bound parameter names so array arguments are not accidentally nested. Generated examples are limited to two or three. After a failed function test, the model receives the specification, current code and failed examples in a focused review; it can revise the code or its examples, at most twice per file. All failed checks and repair reasons stay in the journal. A model-written test is never an independent correctness oracle.

The complete deterministic suite passes 100 tests; build checks also pass. Real-model outcomes below remain the measure of model behavior.

## Recorded results

### Application reproductions and exploratory pilots

These runs tested different development snapshots or case sets. They are reported separately and are not additional samples for the package comparison.

| Package | CPU threads | Cases | Correct completions | Correct outputs | Seconds | Source snapshot |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Gemma 4 E4B | 2 | 3 | 2 | 3 | 912 | `6716558cc1ad` |
| Gemma 4 E4B | 2 | 1 | 1 | 1 | 453 | `6cc6681c275f` |
| Gemma 4 E2B | 4 | 1 | 0 | 1 | 216 | `c4feb73b36e3` |

### Gemma 4 E4B — .state/harness-repair/2026-09-07T00-34-08-157Z

| Case | Controller | Correct output | Correct completion | Seconds |
| --- | --- | --- | --- | ---: |
| hardware | complete | Yes | Yes | 58 |
| game-followup | budget | Yes | No | 602 |
| join-stock | complete | Yes | Yes | 252 |

### Gemma 4 E4B — .state/harness-repair/2026-09-07T00-52-08-800Z

| Case | Controller | Correct output | Correct completion | Seconds |
| --- | --- | --- | --- | ---: |
| game-followup | complete | Yes | Yes | 453 |

### Gemma 4 E2B — .state/harness-repair/2026-09-07T01-20-49-879Z

| Case | Controller | Correct output | Correct completion | Seconds |
| --- | --- | --- | --- | ---: |
| paginate | blocked | Yes | No | 216 |

## Conditions and limits

- Each run records its case requests, model hash, inference settings, script/scorer hashes and a copy/hash of every application source file before inference. Each listed run completed without source edits. Output bytes and source fixtures were checked again for this report.
- All runs use the listed CPU-only runtime and one model at a time. Seeds, budgets, context and threads are in each protocol. Independent outcome checks are not supplied to the model. Model-written tests have their own limited scope.
- Original synthetic cases were already visible during development. The additional transfer cases are development tests, not a blind evaluation set. Small counts and a single seed do not establish a general accuracy rate or statistical superiority.
- The game check opens the saved page, checks for page errors and verifies that a choice changes visible text. It does not prove every game branch. Hardware checks verify grounding in the local CPU description.
- The host has 32 GB RAM. Minimum free system memory is recorded, but it is not per-process peak memory and does not qualify a physical 8 GB Windows system. GGUF disk size alone is not a RAM requirement.
- Only matched case sets with identical source snapshots and settings can be compared directly. Keep earlier exploratory pilots separate. An earlier package comparison was interrupted after a correct pagination implementation exposed malformed self-tests; its partial results remain in the evidence and are excluded from completed-run totals. The original 64-trial harness comparison is unchanged.
- SWE-bench, large repositories, other processors and 12B model quality were not run. This work targets the reproduced application failures and bounded local tasks.
- Source changes after the last model run: `src\engine.mjs`, `src\harness\generation.mjs`, `src\harness\protocol.mjs`, `src\harness\tools.mjs`. Model results apply to the saved snapshots.

## Product assessment

Tom now separates file generation, action selection and checking into smaller steps while keeping a durable local record. Version checks, saved drafts, bounded subprocesses and explicit verification scopes are useful foundations for a lightweight CPU application.

The remaining weaknesses are model judgment during repair, heuristic recognition of task intent, and CPU cost when a task needs many model turns. Passing model-written examples does not establish correctness; independent acceptance tests remain valuable. Browser coverage is limited to supported installed browsers, and native applications need a usable CLI. Interrupted operations with uncertain effects still require inspection in a new conversation. Physical 8 GB qualification, larger models and long repository tasks remain unproven.

Marketing should describe the specific local workflows and publish these small development results with their conditions. It should not claim a general SWE score, universal compatibility, statistically proven Q8 superiority, or readiness on all 8 GB machines.

[Machine-readable evidence, generated outputs and action records](benchmarks/harness-repair-2026-09-07/results.json). [Harness architecture](HARNESS.md).

Reproduce with `runtime/node.exe scripts/harness-repair-live.mjs --config CONFIG --cases CASES --seed 42 --threads 2` while Tom is idle and its model is unloaded. The selected config and exact case list are recorded per run. Rebuild this report by passing completed run directories to `scripts/harness-repair-report.mjs`.
