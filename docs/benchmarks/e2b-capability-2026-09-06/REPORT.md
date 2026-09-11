# Tom E2B Q4: measured local capability comparison

**Tom passed 6/16 (37.5%) artifact checks.** The internal minimal loop passed 7/16 (43.8%), Aider 0.86.2 whole-file mode passed 14/16 (87.5%), and direct model contents passed 11/16 (68.8%). These are eight developer-authored tasks repeated twice per mode, not independent customer reliability estimates or SWE-bench scores.

## Scope and configuration

64 real-model trials; eight unique tasks; seeds 42 and 43; four modes. Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; Windows 10.0.26100; CPU only, two inference and batch threads, 4,096 context, Q8_0 KV, Gemma 4 E2B Q4_0. Model SHA256: `fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634`. Backend b10809 / 5266f24da. Full source snapshot and machine-readable records accompany this report. The existing deterministic suite passed 63/63 separately.

## Primary results

These are corrected V2 scores. A documented evaluator correction permits valid imports of supplied fixture modules. It applies to all modes; original scores are retained.

| Mode | Correct artifacts | Correct and completed | Completed with incorrect artifact |
|---|---:|---:|---:|
| direct | 11/16 (68.8%) | 11/16 | 5 |
| minimal | 7/16 (43.8%) | 7/16 | 7 |
| tom | 6/16 (37.5%) | 6/16 | 10 |
| aider | 14/16 (87.5%) | 14/16 | 2 |

Direct output was saved verbatim by the evaluator, with fixture contents already in its prompt; it is a content baseline, not autonomous file execution. Minimal is an internal grammar/tool loop, not a named external product. Aider uses its native whole-file editor with read-only source context and scoped writes. “Completed with incorrect artifact” describes observed state versus checks; it is not a claim that every final response explicitly asserted success.

| Category | Direct | Minimal | Tom | Aider |
|---|---:|---:|---:|---:|
| software-repair | 5/8 (62.5%) | 3/8 (37.5%) | 0/8 (0.0%) | 6/8 (75.0%) |
| data-transform | 4/4 (100.0%) | 2/4 (50.0%) | 2/4 (50.0%) | 4/4 (100.0%) |
| file-integrity | 2/4 (50.0%) | 2/4 (50.0%) | 4/4 (100.0%) | 4/4 (100.0%) |

| Task | Direct | Minimal | Tom | Aider |
|---|---:|---:|---:|---:|
| sum-money | 2/2 | 0/2 | 0/2 | 2/2 |
| merge-ranges | 0/2 | 0/2 | 0/2 | 0/2 |
| stable-unique | 1/2 | 2/2 | 0/2 | 2/2 |
| paginate | 2/2 | 1/2 | 0/2 | 2/2 |
| csv-ledger | 2/2 | 2/2 | 2/2 | 2/2 |
| join-stock | 2/2 | 0/2 | 0/2 | 2/2 |
| exact-copy | 0/2 | 0/2 | 2/2 | 2/2 |
| quoted-instruction | 2/2 | 2/2 | 2/2 | 2/2 |

## Paired interpretation

| Comparison | Artifact-rate difference | Wins / losses / ties | Exploratory 95% task-cluster bootstrap |
|---|---:|---:|---:|
| Tom minus minimal | -6.25 pp | 2 / 3 / 11 | -43.75 to 31.25 pp |
| Tom minus direct | -31.25 pp | 2 / 7 / 7 | -75.00 to 18.75 pp |
| Tom minus aider | -50.00 pp | 0 / 8 / 8 | -87.50 to -12.50 pp |

The bootstrap resamples eight task IDs, retaining both seeds; 20,000 replicates. This illustrates within-suite uncertainty, not representativeness of real-world tasks. Repeats are correlated. The suite overrepresents short CommonJS repairs; all four exercise the same unsupported-extension weakness. Do not advertise the aggregate as a general coding or customer success rate.

## Failure ledger

| Task | Seed | Mode | End state | Independent failure |
|---|---:|---|---|---|
| sum-money | 42 | minimal | complete | wrong result or input mutation |
| sum-money | 42 | tom | complete | target.exports is not a function |
| merge-ranges | 42 | minimal | complete | wrong result or input mutation |
| merge-ranges | 42 | tom | complete | No output delivered |
| merge-ranges | 42 | direct | complete | wrong result or input mutation |
| stable-unique | 42 | tom | complete | target.exports is not a function |
| paginate | 42 | tom | complete | target.exports is not a function |
| join-stock | 42 | tom | complete | Expected ',' or ']' after array element in JSON at position 62 (line 1 column 63) |
| join-stock | 42 | minimal | budget | No output delivered |
| exact-copy | 42 | direct | complete | Wrong data or bytes |
| exact-copy | 42 | minimal | error | No output delivered |
| sum-money | 43 | minimal | complete | wrong result or input mutation |
| sum-money | 43 | tom | complete | target.exports is not a function |
| merge-ranges | 43 | tom | complete | No output delivered |
| merge-ranges | 43 | direct | complete | wrong result or input mutation |
| merge-ranges | 43 | minimal | complete | wrong result or input mutation |
| stable-unique | 43 | direct | complete | wrong result or input mutation |
| stable-unique | 43 | tom | complete | target.exports is not a function |
| paginate | 43 | minimal | complete | wrong result or input mutation |
| paginate | 43 | tom | complete | No output delivered |
| join-stock | 43 | minimal | complete | Expected ',' or ']' after array element in JSON at position 62 (line 1 column 63) |
| join-stock | 43 | tom | complete | Expected ',' or ']' after array element in JSON at position 62 (line 1 column 63) |
| exact-copy | 43 | minimal | complete | Wrong data or bytes |
| exact-copy | 43 | direct | complete | Wrong data or bytes |
| merge-ranges | 42 | aider | complete | target.exports is not a function |
| merge-ranges | 43 | aider | complete | target.exports is not a function |

All failed trials are retained; none are silently replaced by retries. See the raw records for output bodies, attempted actions, token use and exact checks. 0 journal-recall actions were observed; an isolated-journal recall defect is discussed in the review.

## What this supports

The evidence supports reporting these task-specific results on this host and configuration. It does not establish that Tom generally improves the underlying model, outperforms Aider across coding workloads, or works on every old PC. Tom's source-defined evidence gates miss several software-file extensions, and verified writes do not establish correct code or valid JSON. Review the task categories rather than selecting only favorable outcomes.

Official product target supplied by the owner: eighth-generation Intel with Windows 11. Unofficial sixth-generation-or-newer compatibility remains a hypothesis beyond the observed Skylake Xeon. No physical eighth-generation or reduced-RAM machine was evaluated in this run. Worker-memory samples cover part of the internal run and exclude the browser, supervisor and OS; they cannot substantiate a minimum-RAM claim.

## Skips and exclusions

| Evaluation | Status | Reason |
|---|---|---|
| SWE-bench Lite / Verified / full | Not run; no score | No Docker command available in this environment. The official test process uses repository-specific container environments; substituting these functions would not be a valid score. |
| Aider Polyglot | Not run; no score | Its complete multi-language exercise/test environment is not provisioned. The Aider harness itself was measured here on the frozen local suite. |
| Eldon | Not run; no score | Published setup specifies E4B Q8 and GPU-oriented configuration; an E2B Q4 CPU configuration was not validated here. This is no evidence of model failure or inability to run on CPU. |
| Live internet search | Outside this local comparison | User requested emphasis on local capabilities; historical search findings are not mixed into these scores. |
| Long-context recall / full repositories | Not measured by this short suite | Requires a working isolated journal-recall path and independently validated repository environments. |
| Vision and audio | Outside this text/file suite | A projector/model modality check would need a separately scored modality suite. |
| Physical 8th-gen / 8 GB / 4 GB matrix | Not run | Those physical configurations were not available; lowering a thread count is not hardware or RAM emulation. |
| Mock Aider transport check | Excluded | Connection and editing plumbing only; no real-model capability was tested. |

A skip is not a measured zero and is excluded from all denominators. No task was skipped simply because a small model was expected to fail. The optional larger suites are not represented as completed. [SWE-bench evaluation protocol](https://www.swebench.com/SWE-bench/guides/evaluation/), [Aider benchmark](https://github.com/Aider-AI/aider/blob/main/benchmark/README.md), [Eldon setup](https://github.com/OsbornVentures/Eldon/blob/main/SETUP.md).

## Reproduction and review

Read [internal methodology](capability-methodology.md), [Aider configuration](capability-peer-methodology.md), and [application review](capability-application-review.md). The source snapshot preserves the evaluated controller and evaluator. Install matching model/runtime artifacts using the recorded hashes; these large binary artifacts are not redistributed in this evidence package. Run the grader self-check, internal benchmark and named peer benchmark in sequence with the interactive model unloaded.

The public evidence is synthetic and workspace paths are redacted. Exact token-ID snapshots remain in the local journal; the exported event file omits token IDs because paths were redacted. The pre-inference protocol contains only synthetic case definitions and configuration. This is prepared for peer inspection; it has not yet undergone independent peer review.

## Scorer correction and retained originals

The primary tables use **tom-capability-scorer-v2-fixture-commonjs**. V1 incorrectly rejected a valid import of a supplied fixture module. V2 supports those imports without exposing host filesystem or process APIs and is applied to all saved outputs, without changing prompts, expected answers or model outputs. 3 trial outcome(s) changed: aider/paginate/42 false → true; aider/sum-money/43 false → true; aider/paginate/43 false → true. The original V1 records remain in the package. Read [the correction note](capability-scoring-correction.md).

## Separately scored filename diagnostic

Eight additional post-hoc Tom trials changed .cjs filenames to .js. Nonempty delivery was 5/8 with .cjs and 8/8 with .js; functional success was 0/8 and 0/8 respectively. These attempts are excluded from the primary comparison. [Diagnostic results and limitations](EXTENSION-DIAGNOSTIC.md).
