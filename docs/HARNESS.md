# Tom harness v2

The product target is Windows 11 x64, Intel 8th generation or newer, with at least 8 GB installed RAM. This is a qualification target, not a completed physical hardware certification. E4B, 12B and other configured models use the same controller; their memory requirements and quality must be tested separately.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/engine.mjs` | Lifecycle, budgets, approvals, recovery, one action at a time |
| `src/harness/protocol.mjs` | Capability catalog, model instructions, grammar, strict decoder |
| `src/harness/state.mjs` | Current request, sequential jobs, version references, evidence pointers |
| `src/harness/context.mjs` | Token-counted working view over durable records |
| `src/harness/generation.mjs` | Focused file/calculation/example generation and unpublished draft continuation |
| `src/harness/prerequisites.mjs` | Bounded reads of known artifact inputs, separately audited as controller actions |
| `src/harness/data-input.mjs` | Shared input parsing for the prompt and calculation executor |
| `src/harness/interface.mjs` | Conservative function-signature recognition and named test arguments |
| `src/harness/tools.mjs` | File, program, search, recall and planning adapters |
| `src/harness/checks.mjs` | Version-bound checks and completion conditions |
| `src/harness/browser.mjs` | Lazy Playwright session, fresh element references and interaction |
| `src/harness/function-test.mjs` | Bounded CommonJS examples, dependency hashes and mutation checks |
| `src/harness/data-transform.mjs` | Bounded calculations over parsed local JSON, CSV and text |
| `src/store.mjs` | SQLite transactions, task isolation and recovery |
| `src/runtime.mjs` | Qualified GGUF profile, actual tokenizer/template, native CPU worker |

The old dispatch adapter remains available for historical development scripts. The user-facing application runs v2. First-run and larger-model tool-format probes use v2. The older context compactor is retained only for historical regression comparisons; it is not the v2 working-memory path.

## Operation cycle

1. Restore the exact latest request and saved work record; refresh stale versions and read known artifact inputs through the ordinary read adapter.
2. Assemble relevant capabilities, current job, recent source excerpts and unmet checks.
3. Count the actual formatted prompt; reserve output and image headroom.
4. Sample one complete grammar-constrained operation, or generate content for an already selected file/calculation step. Incomplete tool envelopes never execute. File content is staged separately until it has a complete boundary.
5. Resolve references and validate arguments; obtain review when required.
6. Execute, inspect the result, and atomically save the action result and task state.
7. Rebuild the next working view. Completion is checked again against current bytes.

Capability hints are heuristic convenience routing. The model can request another capability with `use`; hints do not grant permissions. The controller reads at most 16 known artifact inputs once per run, with a 250-line/16,000-character view. These reads retain the same file guards and journal, are labeled as controller actions, and consume no model turn. Failures remain visible; discovery and further inspection stay with the model. Remaining unread sources constrain its next action to discovery/reading. A final answer is excluded from the grammar while required evidence is missing. The completion checker also rejects unsupported answers independently of grammar.

An explicit `use` opens the requested capability for the next decision, including native programs when a specialized adapter is unsuitable. A successful native command can record unchanged declared input versions and generated output files. The declaration is visible in the audit; it is not proof that every input was semantically understood. After the required mechanical checks pass, the working interface returns to answer/use/blocker and a short check summary; full saved file bodies are omitted from that final step. The model can reopen tools if it finds more work to do.

`compose` selects a destination for a separate content turn. Small new code files and local HTML requests can select this path directly after required source reads. The model writes ordinary complete code, including its export or HTML wrapper, without JSON escaping. Calculation generation produces a CommonJS function over the exact parsed input object shown in the prompt. Example generation is a separate focused test-operation step with its own small schema. Generated content is converted into a normal validated write/test/calculation action; this does not bypass file preconditions or execution review.

## Context and long tasks

A new greeting uses only the core answer/use/blocker interface. File and browser instructions are not included unless selected. Context uses the exact current request, a small conversational tail, recent evidence, references, current job, saved code previews and latest feedback. Full history is not repeatedly appended. Large results remain accessible with task-scoped journal search and pagination; text files can be read by line range. A read records its version and explicitly reports truncation; it does not prove the model inspected every line. No separate embedding model is loaded.

Truncation markers remain attached to source excerpts. Automatic whole-file generation pauses on known partial source views; explicit inspection and composition remain available. A complete reread replaces older excerpts of that file version.

Related artifact follow-ups retain earlier user requirements, with the latest instruction taking precedence. A new unrelated request starts a new objective. Pre-repair tasks rebuild this intent from user history on resume while retaining completed actions, checks and budget usage. Hardware/capability questions receive observed local machine and runtime facts instead of relying on the model's training-time identity.

An unfinished content response stays in the task record, never in the destination file. Subsequent content turns continue the draft. A closed code fence or complete HTML boundary can establish a completed content payload even if the output limit is reached; ordinary structured tool calls still require a fully completed response. Interrupted content streams retain received text privately. Drafts are bounded to 256 KiB and four chunks before requiring a smaller file or a larger allowance. Continuation remains fallible, and large files can be expensive on a CPU.

Failed operations retain their attempted arguments in the next working view. Function-test failures include the actual input, expected output, observed result and an explicit missing-return error. Metadata paths are shortened where possible without rewriting source text or user data.

The exact current request follows the evidence and the instructions for the current step. Image questions follow their images. This keeps the user's task prominent while preserving the full request; it is not an artificial limit on the model's overall context capacity.

Jobs are sequential and explicitly advanced after output checks. Completed jobs, versions and notes survive pause/restart. Model planning remains fallible: an acceptance sentence in a plan is not an executable specification. The original user request remains authoritative. There is no guarantee of arbitrary-length reasoning or complete automatic verification.

The initial profile retains 4,096 context tokens. Context size is a runtime profile setting, not hard-coded to E2B. Input is measured using the actual model tokenizer. Output allowance fits the remaining task budget and context. Token exhaustion saves the task. Each explicit **Extend budget** adds a bounded allowance while retaining spent tokens, steps and saved jobs; it can be renewed without the former cumulative 80-step/one-hour ceiling. A request can contain up to 64 planned jobs. Repeated identical actions and repeated failures stop rather than looping indefinitely.

The E2B/E4B 512-token sliding window is local attention within a hybrid architecture that also has global attention. It is not their total context limit. The [official model card](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/blob/675cff42a74c774d6cb76f76d8eacb49b48c9b93/README.md) lists 128K model context for those sizes; Tom's current 4,096-token profile is a separate tested runtime choice. Small focused prompts reduce CPU work and task complexity without pretending the model forgets everything beyond 512 tokens.

## Tools and checks

- File reads return a short reference tied to exact bytes. Existing destinations require an observed reference; stale references fail before mutation. Exact edits preserve untouched bytes and existing snapshot/hash safeguards.
- Program execution uses an executable and literal argument array. `node` resolves to Tom's bundled Node runtime. Commands retain timeouts, cancellation and streamed bounded output.
- JSON syntax and JS/CJS/MJS syntax checks run after writes. Syntax checking does not execute source code.
- For an explicitly requested single CommonJS function, a focused content turn writes the complete module. A separate turn produces small input/output examples. Business logic is never supplied from benchmark answers. Typed `test` examples avoid asking a small model to construct a shell command. Tests detect missing exports, incorrect example outputs and unexpected mutation, including relative-module dependencies. The former `implement` wrapper remains only as a compatibility adapter; it is hidden from the active file-generation interface. Async functions and arbitrary repositories use the general program adapter.
- Simple explicit exported signatures are recognized without executing the code and tied to the saved file hash. A one-argument test uses `input`; a multi-argument test uses `arguments` with the actual parameter names. The host builds the positional argument array. Complex signatures fall back to `args`. The example-generation prompt contains the saved function and original user specification; the original buggy source is omitted so it does not set the expected behavior. These are still fallible model-written tests.
- Generated examples are constrained to two or three cases. A failed function test gets a focused review against the user specification. The model chooses whether code or examples need revision and records its reason; neither actual nor expected output is automatically authoritative. Two repairs per file are allowed, and earlier failed checks remain in the audit trail.
- Focused review includes mutation flags and top-level test errors. Its explanation is constrained to 200 characters during sampling, with a separate bounded response allowance.
- Other code outputs require a recorded test command with named input files, unless execution was excluded. Inputs are fingerprinted before and after the command. Model-selected examples and commands can miss bugs or use mistaken expectations. Passing them is recorded with that limited scope, not as independent correctness.
- HTML writes trigger a browser inspection unless opening was excluded. This checks loading, page errors and desktop overflow; it does not establish every UI behavior. A resumed older HTML write without that check receives the browser operation as its next check.
- `contains` and `equals` compare exact output against a supplied value. These are not independent oracles. `transform` runs a model-written calculation against the actual parsed input files and saves its returned result through the normal write/version checks. CSV cells remain strings; JSON is already parsed. Numerical JSON tasks with recognized sources require this calculation evidence. A successful calculation establishes reproducibility, not that the chosen formula is correct.
- Browser search and reading retain provider/source records. Interactive controls use fresh inspected element references; changed elements and navigations invalidate references. Browser state is in memory during an active task. After pause/restart, reopen and inspect before acting.

For recognized calculation sources, the controller supplies the filenames and shows the exact parsed argument shape used by the executor. The model supplies only the destination and calculation. The explicit program route can record equivalent calculation evidence with unchanged declared source hashes. Native commands can publish multiple named outputs, each with its own file card. Cards say **Saved**; the separate check scope describes what was tested. Downloads reject changed versions. The browser download limit is 64 MiB; larger files remain in the work folder.

File hashing streams bytes instead of loading whole files into the supervisor. Text reads and automatic text checks have an 8 MiB limit; calculations have 1 MiB per input and 12,000 serialized output characters; the function adapter has 256 KiB per module and 20 modules. Larger binary artifacts can still be produced by a native program. Automatic checks for oversized text outputs require splitting those outputs. These limits are deliberate memory bounds, not a promise to process every file format or size.

## Permissions and audit

The work folder is a starting location, not a sandbox. Tools run with the launching account's access. Ordinary commands follow the existing review/automatic setting. Accepted identical command scopes are remembered within the request and tied to declared input versions. Interactive browser permission is scoped to the current origin and request; the review UI displays that scope. New user requests reset grants.

The two bundled calculation/testing helpers also follow execution review. They limit memory, source size, execution time and available imports, and use a separate JavaScript context as defense in depth. This is not an operating-system sandbox. General CLI execution retains the launching account's permissions.

The journal records supplied model messages, selected tools, runtime configuration, action arguments, results, checks and budgets. Optional diagnostics add the exact rendered template and tokenizer IDs. Activity → Save task record exports this private record as JSON. It can contain sensitive user inputs and should be shared deliberately. Generated private reasoning is not stored.

The selected tool schemas are recorded with each model input. Rereading a restored file version makes that version current again while retaining its original byte-bound reference.

Read-only interruptions can be retried. A write/command/browser interaction interrupted during execution is uncertain and blocks automatic replay. A timed-out command can have partial effects; timeout does not imply nothing happened. In this build, inspect an uncertain action in a new conversation; the original task remains locked against replay. Ordinary pauses outside an uncertain side effect resume their saved jobs.

## Validation and practical limits

Run `runtime/node.exe scripts/check.mjs` for the complete deterministic suite. `scripts/harness-live-check.mjs` exercises real E2B with frozen synthetic cases and independent saved-output checks. `scripts/harness-browser-check.mjs` checks actual Playwright interaction on a local fixture. Development trial outputs live under `.state/harness-live` and retain source snapshots.

These development trials permit version-bound native self-tests. The original comparative suite did not; a changed score is therefore not a controlled attribution of uplift to one component. The original 64-trial report and evidence remain unchanged. Follow-up peer benchmarks need a fixed protocol, held-out tasks, both seeds and equivalent execution permissions across harnesses.

Physical 8 GB testing, 12B runs, broad real-world website coverage and long repository tasks remain separate qualification work. E4B application reproductions and E2B package trials are recorded in the repair report. Text adapters do not parse every binary document format. The browser currently uses installed Chromium-family browsers and a desktop viewport; it does not provide universal native GUI automation, OCR or cross-frame interaction. Application CLIs provide the general native-program path.

See [development validation and readiness](HARNESS-VALIDATION.md) for measured outcomes, failures and the limits on marketing claims.

The subsequent repair and GGUF comparison is recorded in [the repair report](HARNESS-REPAIR.md). GGUF is the file format. The bundled E2B package is QAT-trained and quantized to Q4_0. The optional E2B Q8 package has a separately pinned source and matching projector; it must pass its local trial and memory screen before activation.

Candidate qualification is retained per model and computer fingerprint. Trying another package no longer replaces the only record supporting the currently selected model. Existing single-result installations migrate their saved result automatically; moving to another computer still requires qualification there.
