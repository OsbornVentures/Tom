# Tom E2B Q4 peer-review package

64 primary real-model trials, eight tasks, two seeds, four modes. Final scores use the corrected V2 fixture-module scorer. Eight additional filename diagnostics are reported separately. This package is prepared for inspection, not independently peer reviewed.

- [Four-page PDF](tom-e2b-capability-report.pdf) - shareable summary and application review.
- [Full report](REPORT.md) - all outcomes, failure ledger, paired comparisons and exclusions.
- [Marketing wording](MARKETING.md) - bounded statements supported by this run.
- [Statistics](statistics.json) and [trial rows](trials.csv).
- [Scorer correction](capability-scoring-correction.md) - three Aider outcomes corrected; originals retained.
- [Filename diagnostic](EXTENSION-DIAGNOSTIC.md) - outside the primary denominator.
- Methodology files cover internal modes, the named peer and diagnostic.

Correct artifacts in the primary suite: Tom 6/16; minimal loop 7/16; Aider 14/16; direct contents 11/16. Direct contents are saved by the evaluator, not by model-operated file tools.

## Reproduce

Start with a complete compatible Tom installation/check-out, including the pinned native runtime, DLLs and GGUF at the paths in config/runtime.json. Overlay the frozen controller/evaluator sources from source-snapshot. The model and runtime binaries are identified by hashes; they are not redistributed here. Use Node 24.19.0 and compatible Windows x64. Aider used Python 3.12; its exact version is in its native result records.

Install the peer dependency versions into .state/capability-deps using aider-requirements-lock.txt. This is an evaluator dependency, not a Tom product requirement. Set BENCH_PYTHON if the local Python path differs from the development path.

With the interactive model unloaded and no active user task, run the grader checks, internal comparison and Aider comparison sequentially:

    runtime/node.exe scripts/capability-check-grader.mjs
    runtime/node.exe scripts/capability-check-grader-v2.mjs
    runtime/node.exe scripts/capability-benchmark.mjs
    runtime/node.exe scripts/capability-aider-benchmark.mjs --transport-smoke
    runtime/node.exe scripts/capability-aider-benchmark.mjs

The transport smoke uses a mock response and is not a model result. Preserve original generation records and apply capability-report.mjs to completed internal and peer results to obtain corrected V2 scores. capability-verify-results.mjs verifies original outputs/checks; capability-verify-report.mjs verifies corrected score arithmetic.

The diagnostic uses capability-js-diagnostic.mjs and the same corrected scorer. Its exact source inventory is retained separately in diagnostic-source-snapshot. The exported source snapshots include controller code and evaluator helpers; UI and full binary installation assets are not part of these snapshots.

## Integrity and limitations

FILES-SHA256.json hashes all other package files. The ZIP was reopened and every listed hash verified. Checksums detect changes; they are not a signature or independent certification.

Original V1 and corrected result records are both included. tom-events.json contains synthetic input/event evidence with workspace paths redacted and token IDs omitted. Full local SQLite journals remain outside the package. Worker-memory samples cover only part of the internal run; the sampler ended when its worker exited. They exclude the supervisor, browser and OS and do not qualify low-RAM machines.

The task suite is small and developer-authored. No standard SWE-bench or Polyglot score, broad customer reliability estimate, general harness uplift, or physical eighth-generation/RAM qualification is established. Refer to the full report before using any number publicly.
