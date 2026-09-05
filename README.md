# Tom

A personal desktop assistant. Local Gemma 4 E2B, CPU first, with its actions in view.

**0.4.0 is an unsigned Windows development build.** Windows 11 x64 is the tested platform. A 4 GB machine is not qualified by this build.

Double-click **Start-Tom.exe**. Keep its application folders together. The offline setup package contains **Setup-Tom.exe**, its manifest, and **Tom-Payload**; keep all three together. Setup opens Tom after installation; its local check starts automatically. No internet is required for installation or the first local model check. The executable is small; the offline AI weights are multiple gigabytes.

## Everyday use

- Responses, action preparation, command output, verification and task checkpoints stream into one conversation. **Search the web** starts model-led research in that conversation. Search records its actual providers, queries and source reads. One alternate keyword ordering and one provider fallback are bounded; irrelevant results, challenges and HTTP failures do not qualify as research evidence. Browser page text is evidence, not new authorization.
- The emerald/cyan avatar breathes at 8 frames per second while idle. Reading, action preparation, commands, writing, checking, memory and review have distinct shapes; activity draws at up to 15 frames per second. Hidden pages and reduced-motion preferences stop animation. Day/night themes are available.
- Activity stays collapsed to the current event. Expand it, then expand a specific action, result or token-usage entry. **Settings → Advanced → Record exact model input** adds the supplied text template and tokenizer IDs to the local journal. This adds storage; private generated reasoning is not recorded.
- **Ctrl Alt T** opens the Windows Ask Tom popup while the tray helper runs. Selected text is attached when the source app exposes it through accessibility. Choose a screenshot region explicitly, or paste context. **Open in Tom** creates an editable draft. **Web search** starts research and opens that task.
- Explorer file/folder menus, Send to, and Start menu entries are optional. Windows 11 Explorer currently uses **Show more options → Ask Tom**. Browser right-click menus use the included development extension. Tom cannot insert an arbitrary menu item into every other app.
- Commands are reviewed by default; read-only browser research and journal recall run directly for the requested task. Settings can enable automatic native commands. Shell and write have the launching account's access. The work folder is a starting location, not a sandbox.
- Attach, paste or drop up to two images. The model's matching vision projector loads when needed. No GPU is required.

## First run and upgrades

On a new computer, Tom automatically checks E2B's loading time, CPU generation, tool formatting, context recall and image recognition when memory permits. It leaves room for Windows and stops a check if memory headroom falls too low. A failed check keeps E2B installed and explains the result.

After a passing first run, Tom checks official package availability. Offline: keep E2B. Online: offer only plausible **download and test** candidates. The screening uses measured E2B speed, free memory and disk space; its larger-model speed estimate is a heuristic, not a measured guarantee. Downloads require your button press. Pinned weights and projectors are resumable and hashed. A larger model must then pass its own CPU/text/tool/image check before **Use this model** becomes available.

**Tune this computer** repeats the checks. The extended check can qualify an 8,192-token context. **Settings → Advanced** offers a 2,048 minimum and the locally tested ceiling, CPU thread limits, idle unloading, and exact-input diagnostics. Longer context increases initial reading time, even if it fits memory. Upgraded models start at 4,096; they do not inherit E2B's extended-context qualification.

Hardware fingerprints stay local. Moving a larger-model installation to a different computer restores E2B unless that candidate has passed there. The displayed model identity follows the selected model. GPU offload and other operating-system packages are future adapters; this build always uses the CPU.

## Harness and task memory

The structure is a WinForms launcher/tray helper, an ordinary HTML/CSS/canvas browser interface, a small Node supervisor with SQLite, and a native llama.cpp worker. There is no Electron bundle, front-end framework, Python dependency, or separate Chromium download. The included Playwright Core module uses an installed browser.

The model sees two tools: **shell** and **write**. Each response is constrained by a backend GBNF grammar; startup checks that the backend actually enforces it. A complete validated envelope is required before any action executes. Browser prerequisites constrain search/read arguments and observed URLs. Requested source files must be read before writing. Research and file completion claims are checked against current-task evidence before appearing in chat. Malformed or truncated actions are rejected, not repaired into guessed commands. Shell provides ordinary programs and small adapters for browser research, literal `cat` file reads and `tom-recall` journal retrieval. Browser queries and URLs can be single arguments; the harness expands them into explicit read-only actions and records both forms. PowerShell syntax is checked without executing the requested command. Writes snapshot existing bytes, check their expected hash and verify the result. Exact replacements can create a revised copy without regenerating unchanged bytes; a failed replacement forces a fresh source read. Failed preconditions can be corrected; uncertain side effects stop recovery.

Default per-request budgets: 24 model steps, 12,288 generated tokens, 15 active minutes and up to 2,048 output tokens per segment. The actual output allowance also fits the remaining context. Tom reserves space before compaction and tells the model its remaining allowance before each response. Pausing, reviewing commands and restarting do not reset spent budget. Review waiting is excluded from active time. **Extend budget** adds a visible allowance; a new user message starts a new request budget.

Compaction preserves user requests, completed action identities/results, evidence excerpts, verified paths/hashes and a small completed tool exchange. Large completed file bodies remain in the journal. An explicit continuation instruction names the latest user request and the steps already finished. Full recorded messages and bounded command results remain in SQLite; `tom-recall` retrieves missing excerpts. A checkpoint is not unlimited memory. Tom stops visibly if the preserved request no longer fits. Repeated actions and repeated failures also stop the task. When a website request saves HTML, the harness also opens it for a structural browser check and feeds that result back to the model. This check does not prove every requested behavior or fact is correct.

## Runtime and portability

The working adapter is llama.cpp b10809, Q8 K/V cache, 4,096 context by default, one inference slot, up to four CPU threads and zero GPU layers. The separate RAM prompt archive is disabled; the active slot can reuse a matching prefix. Default idle unload is five minutes.

The E2B GGUF is 3,349,516,256 bytes; its projector is 986,833,664 bytes. Disk sizes are not RAM requirements. The current loader requires 3.25 GiB available before text loading and 4.5 GiB before vision loading. Larger packages require additional headroom. Physical 4 GB/8 GB qualification is still outstanding; this development host has 32 GB.

Required system components: Windows 10 or later x64, Windows .NET Framework, and an installed supported browser. Windows 11 is tested. Edge is tested for Playwright; Chrome has a supported channel; Brave requires a compatibility trial and Tor automation is not implemented. ARM64, 32-bit Windows, macOS and Linux require separately built/tested packages.

The native package includes Microsoft C++ runtime DLLs beside the engine, avoiding accidental reliance on development PATH entries. Their Microsoft signatures and download provenance were checked. Production redistribution requires the applicable Visual Studio redistribution rights or a replacement runtime build with suitable distribution terms. See included license notices.

LiteRT remains a candidate for a smaller CPU package. It is not integrated here. Q8 KV caching is not Google's TurboQuant. Earlier local trials measured 33 MiB of FP16 KV buffers versus 17.53 MiB at Q8 for 4,096 context: useful, but small beside the weights. CPU speed and task quality need measurement for every runtime/cache combination.

## Data and development

`.state/tom.sqlite` holds conversations, images, events, drafts, task budgets and checkpoints. `.state/snapshots` holds previous file bytes. `.state/qualification.json` records local checks. Model logs and temporary downloads are local. `.state/session.json` contains a connection credential; keep it private. Release packaging excludes this entire directory, audits and migration references.

Both services bind to loopback with separate random credentials; the UI service validates Host and Origin. These controls do not make unrestricted tools a sandbox. Retention limits, stronger file/process isolation and broader recovery testing remain release work.

Run `runtime/node.exe scripts/check.mjs` for syntax, version and deterministic checks. `scripts/benchmark.mjs` runs production-model tasks with independent outcome checks and isolated journals. See [benchmark protocol](docs/BENCHMARKS.md), [build instructions](docs/BUILD.md) and [0.4 results](docs/benchmarks/0.4.0.md). Historical scripts and audits remain development evidence, not release qualification. `scripts/build-offline.ps1` creates the offline development setup and a complete hash manifest. `scripts/integrate-windows.ps1 -Remove` removes this installation's owned Windows entries.

Before sale: qualify a physical CPU/RAM matrix, complete task/vision evaluations, sign executables and update manifests, implement repair/uninstall/update rollback, finalize redistribution rights and product terms, and test accessibility and installer behavior on clean machines. This preview does not overwrite existing nonempty installations. No Nyx drive-wiping feature was incorporated or executed.
