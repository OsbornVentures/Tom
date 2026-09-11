# Tom 0.5.0 — capability and portability review

Scope: the working application snapshot evaluated on 6 September 2026. This is a source review plus the linked measured trials, not a penetration test, clean-machine installation certification, or independent peer review. No production repair is folded into the benchmark run.

## Product fit

Tom's strongest architectural fit is a local Windows assistant for short, explicit file and data tasks. The small browser interface, Node supervisor, SQLite journal and native CPU inference avoid an Electron bundle and a Python installation in the product. This is a credible direction for extending useful AI to older PCs. Disk footprint is still dominated by the model and optional image projector, and a small supervisor does not make model memory requirements disappear.

The owner's **official target is eighth-generation Intel systems with Windows 11 installed**. Sixth-generation or newer Intel is an unofficial compatibility hypothesis. The measured host is a Skylake Xeon E3-1245 v5 with approximately 32 GB RAM. Two inference threads are selected for this evaluation; Windows and the harness can use other logical processors. Passing on this machine does not validate every Skylake machine, a physical low-memory computer, or the official target fleet.

Microsoft lists eighth-generation Core families among Windows 11-supported Intel processors; OS eligibility and Tom's application testing are separate questions. Consult the exact machine's CPU, TPM and other requirements rather than treating generation alone as certification. [Microsoft processor list](https://learn.microsoft.com/en-us/windows-hardware/design/minimum/supported/windows-11-supported-intel-processors).

## Strengths supported by implementation and deterministic tests

- The native backend verifies hashes and grammar enforcement before allowing tools. A valid dispatch envelope is required; truncated tool output is not guessed into an executable action.
- Writes use expected hashes, create-only semantics, snapshots and byte verification. This helps contain stale edits and preserve user files.
- SQLite preserves task budgets, events and interrupted-action state. Compaction can preserve evidence and continuation context instead of silently resetting the task.
- Shell, write and familiar local programs offer broad reach without a large tool vocabulary. This can reduce the tool-selection burden on a small model.
- The default command-review path exposes intended actions. Loopback credentials and Host/Origin validation protect the local UI boundary, although they do not isolate native commands.
- The model runs with zero GPU layers. CPU thread controls and memory-headroom checks support the intended older-desktop use case.

The existing deterministic suite passed 63/63 before inference. Many tests use controlled or mocked responses. That count verifies implementation behavior under those inputs, not 63 successful model tasks.

## Capability weaknesses and concrete evidence

**High priority — incomplete recognition of requested files.** `src/evidence.mjs` recognizes output names with a short extension list. `.cjs`, `.mjs`, `.py` and many other ordinary software files are absent; the source-read list also omits `.js`. Such requests can be classified as ordinary conversation with an answer allowed before a source read or output write. The measured coding trials exercise this weakness. Extend request tracking to general user-named paths, including spaces and nested paths, and test both missing-deliverable and skipped-read cases. Do not fix the regex during a scored run and silently replace the old result.

**High priority — file verification does not prove functional correctness.** A hashed saved file can have a missing export, mutate caller input, or implement the wrong rule. The first money-sum trial saved an unexported function and completed; independent execution rejected it. Software support needs visible test results and test-aware completion criteria. A statement such as “all code is verified” would exceed the evidence.

**High priority for broad operation — native tools are not sandboxed.** Commands and writes inherit the launching user's permissions; the selected work folder is only a starting directory. The benchmark restricts approved operations to its fixtures, so its injection result cannot be used to claim containment under unrestricted shell access. Scope filesystem access and process execution before advertising safe autonomous operation on arbitrary user data.

**Important evaluation limitation — isolated journal recall.** `src/recall.mjs` opens the fixed product `.state/tom.sqlite`, while both benchmark runners create separate journals. A benchmark task that uses `tom-recall` would not retrieve its own isolated actions. Treat that as an evaluator integration defect, not proof that production recall fails. Long-context tests need a journal-location injection mechanism or an isolated complete installation. Check traces for recall use before interpreting results.

**Small-context cost.** The shipped default is 4,096 tokens. Tool schema, system instructions, evidence, source content and output share that space. Compaction can preserve selected facts but cannot guarantee arbitrary repository understanding. The simple baseline deliberately has no compaction; any resulting comparison measures the whole controller bundle. This short suite does not establish long-task memory reliability.

**Qualification policy and positioning differ.** The first-run/upgraded-model gates include throughput and first-token thresholds even when a user values successful slow completion. That is a useful responsiveness preference, but capability qualification should also be reported separately from speed thresholds. A slow machine should not be described as incapable merely for falling below a speed gate.

## Memory, package and support boundaries

The pinned text model is 3,349,516,256 bytes and the projector 986,833,664 bytes. Those are disk sizes. The loader requires at least 3.25 GiB currently available for text and 4.5 GiB for images. Neither these guards nor a worker working-set sample qualifies a 4 GB or 8 GB PC; OS, browser, cache, other applications and paging matter. Physical low-memory endurance testing is outstanding.

The README still describes Windows 10-or-later components and Windows 11 testing; that is broader platform wording than the owner's official target. Harmonize release documentation around Windows 11/eighth-generation Intel as the intended support target, while retaining Skylake as specifically observed development compatibility. The native instruction-set build, installed browser and .NET/runtime components are part of the portability envelope. ARM64, 32-bit Windows, macOS and Linux are not qualified by this package.

The unsigned development installer, clean-machine matrix, repair/uninstall/update rollback, accessibility coverage and redistribution review remain product-release work. These are separate from model capability; a coding score cannot close them.

## Practical next steps

1. Fix general path/evidence recognition and add held-out unsupported-extension tests. Keep current measured failures as the baseline.
2. Add an explicit software workflow that runs approved project tests, records exit codes and distinguishes “saved” from “tests passed.”
3. Make recall work with an injected journal location, then test long context and revisions in isolated installations.
4. Repeat a frozen, broader suite with independently authored tasks and named peer harnesses using this exact quantization and budgets.
5. Qualify physical eighth-generation Windows 11 machines at the RAM levels actually advertised; separately explore sixth-generation compatibility. Measure successful completion, memory pressure and recovery before optimizing speed.

The defensible product promise is bounded local assistance on modest Windows hardware. The current evidence should determine which task categories can be advertised, rather than treating CPU compatibility as proof of broad software-engineering competence.
