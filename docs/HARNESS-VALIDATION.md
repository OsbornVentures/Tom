# Harness v2 development validation

**This is development evidence, not a capability-marketing qualification.** The latest frozen run completed 2 of 8 file tasks correctly. 3 saved outputs passed the independent checks. The greeting is a separate smoke check and is excluded from these rates.

**Changes after that model run:** `src/harness/state.mjs`. The restored-file-version reference fix has a reproducing regression test and is included in the complete passing suite. The model scores below remain attached to the earlier frozen snapshot; they were not rerun after this fix.

The original 64-trial comparison and its corrected scorer remain unchanged. These trials add native self-tests and calculation helpers and were used during development. They cannot establish a controlled capability uplift over the original Tom, direct-model, minimal-harness or Aider runs.

## Latest frozen source

| Task | Controller status | Output passes independent checks | Completed correctly | Seconds |
| --- | --- | --- | --- | ---: |
| csv-ledger | blocked | No | No | 181 |
| join-stock | blocked | No | No | 215 |
| quoted-instruction | complete | Yes | Yes | 72 |
| exact-copy | complete | Yes | Yes | 86 |
| sum-money | blocked | Yes | No | 260 |
| stable-unique | blocked | No | No | 270 |
| paginate | blocked | No | No | 352 |
| merge-ranges | blocked | No | No | 365 |

Software functions: **0/4** completed correctly. Data transformations: **0/2**. Exact editing and extraction: **2/2**.

The greeting passed with **192 measured text input tokens**. That is one short-prompt measurement, not a maximum context size or a claim about every request.

## Checks and conditions

- 88 deterministic regression tests passed in the recorded complete suite. These test the harness, not the language model’s general competence.
- Actual Playwright interaction passed on a local fixture: open, type, select, click, changed/stale references and session reuse. The UI transport check covered review, task-record export, narrow layout and reduced motion.
- Live web adapter check: passed; 6 search results and a read of the [official model card](https://ai.google.dev/gemma/docs/core/model_card_4). This did not test model-led research quality.
- Restarted application: tom-harness-v2; audit export tom-audit-v2. Startup checks passed (decode, tool-format, recall-4096, vision). This local application check used 4 threads and 4096 context tokens; the comparative development trials below used two threads. The app runs with normal desktop permissions.
- CPU: Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz. Installed/visible system memory: 31.92 GiB. Windows (Node platform win32); 2 inference threads, no GPU offload.
- Model: Gemma 4 E2B Q4_0 GGUF. Model SHA-256: `fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634`.
- Runtime: b10809 / 5266f24da. Context: 4096 tokens. Seed: 42. Sampling defaults: temperature 0.2, top-p 0.95, top-k 64; reasoning disabled.
- Per case: 24 model calls/steps, 12,288 generated-token allowance, 10 active minutes and at most 2,048 generated tokens per response. Interrupted or unparsable responses can consume their reserved allowance conservatively.
- Prompts were written to protocol.json before inference. All src files were copied and hashed before each run; each listed run finished with those sources unchanged.
- Each case has its own folder and task record. Checks run outside the model. Source fixtures were compared with their original bytes; the extraction task also forbids extra files.
- The trial reviewer permits the bundled calculation/function-test helpers and a restricted set of local Node assertion commands. It denies web use and unrestricted commands in these file trials. This is narrower than the application’s user-reviewed CLI capability.
- Timings include model and tool work on this development computer. They are observations, not isolated speed comparisons.

## Completed development iterations

| Frozen run directory | Correct task completions | Correct saved outputs |
| --- | ---: | ---: |
| `.state/harness-live/2026-09-06T21-33-43-082Z` | 1/8 | 3/8 |
| `.state/harness-live/2026-09-06T22-16-21-610Z` | 2/8 | 2/8 |
| `.state/harness-live/2026-09-06T22-47-57-644Z` | 2/8 | 3/8 |

Earlier short pilots and interrupted attempts remain under .state/harness-live. They were exploratory, sometimes had source changes during execution, and are not pooled with these frozen sets. No run is promoted to an independent or held-out benchmark merely because it passed.

## Interpretation and work not qualified

The redesign establishes modular tools, smaller working views, durable jobs, renewable budgets, version-bound checks, bounded helpers and inspectable records. The live failures show that tool-contract following, program generation and model-written tests still need work. A saved file and a completed, correct task are deliberately reported separately. Independent output checks can also fail after the model’s own checks pass.

Concrete examples from the latest trace: both data tasks repeatedly supplied a function declaration where the calculation adapter required an executed body returning a result. The money function passed independent checks, but the model supplied test inputs that did not match the requested row format and then repeated reads. Other software cases produced incorrect logic, a duplicate parameter declaration or a missing return. The controller stopped these loops and retained the work; it did not repair them successfully. These are model–interface and recovery failures, not evidence that the model alone is the limiting factor.

Do not market these results as improved SWE capability or universal task reliability. These are small synthetic function/file cases, not SWE-bench or repository-level software engineering. The prompts were visible during tuning, and only one seed was used.

| Not run / not established | Reason |
| --- | --- |
| Physical 8th-generation Intel / 8 GB system qualification | This host is the 32 GB Skylake Xeon development system. A memory estimate is not a physical-machine result. |
| E4B and 12B quality/memory qualification | Only the installed E2B Q4 profile was exercised. Larger profiles need their own tests and sufficient RAM. |
| Official SWE-bench and long repository tasks | This validation uses bounded synthetic local functions and files; no qualifying repository benchmark environment was established. |
| General native GUI, OCR, cross-frame web automation and arbitrary file sizes | The implemented paths are local files, installed CLIs and the documented Playwright adapter, with explicit memory/format limits. |
| Long-horizon model competence | Pause/restart across twelve jobs is covered by a scripted controller test. It is not evidence that E2B can independently plan and complete arbitrary long projects. |

The official product target remains Windows 11 x64, 8th-generation Intel or newer, 8 GB RAM for the base configuration. Larger models have separate requirements. The shared harness does not make every model fit in 8 GB.

## Evidence and reproduction

[Machine-readable outcomes, output bytes, action traces and source hashes](benchmarks/harness-v2-validation-2026-09-06/validation.json). [Architecture and operating limits](HARNESS.md). Raw synthetic journals, runtime logs and source snapshots stay in the listed local run directories.

Run `runtime/node.exe scripts/check.mjs` for regression checks. Run `runtime/node.exe scripts/harness-live-check.mjs --cases hello,csv-ledger,join-stock,quoted-instruction,exact-copy,sum-money,stable-unique,paginate,merge-ranges` with the interactive app idle for another development trial. Regrade completed frozen runs with `scripts/harness-validation-report.mjs` and their run directories.

A follow-up comparative study needs a new frozen protocol, held-out tasks, both seeds, identical tool permissions and comparable budgets across the candidate harnesses. It must retain failures and separate output correctness, completion, resource use and verification scope.
