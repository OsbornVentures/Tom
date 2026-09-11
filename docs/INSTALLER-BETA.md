# Tom 0.5.2 installer beta

Share the Offline Setup EXE for computers where downloads are inconvenient. After system prerequisites are installed, it installs without internet and contains E2B text and vision, Node, Playwright Core, and the CPU/Vulkan llama.cpp runtimes. The Network Setup EXE installs the same app but retrieves the large dependencies directly from pinned vendor URLs. It requires no Tom website, GitHub release, or Cloudflare service.

Setup uses Tom's emerald/cyan mark, dark palette, typography, and voice. It defaults to the current account's Local AppData Programs folder and needs no elevation. Start menu, Send to, Explorer menus, and Windows Installed apps are added for a standard install. Portable mode skips those entries. An existing supported browser (Edge or Chrome recommended) and Windows .NET Framework and the latest Microsoft Visual C++ x64 runtime are system prerequisites. Get Visual C++ from Microsoft using the link in setup or Help; Tom 0.5.2 does not bundle Microsoft runtime DLLs. GPU drivers are supplied by the computer.

Rerun setup for repair or update. Close Tom, including its tray helper, first. The installer stages and hashes all files before applying them, preserves `.state` and files outside the shipped manifest, and rolls back replacements on ordinary file errors. It refuses unrelated nonempty folders and directory links. Power-loss recovery during replacement and signed updates remain release work. Older preview folders lack the new ownership marker and need a fresh installation destination.

Uninstall from Windows Installed apps or the installed Uninstall-Tom.exe. Only files in the installed package manifest are removed. Conversations, preferences, downloaded optional models, and other personal files are retained. The portable uninstaller also keeps personal data. Download cancellation or verification failure leaves the prior installation intact; incomplete staging is removed. Interrupted network downloads currently restart rather than resume.

## Performance and recovery

- Automatic: try a detected Vulkan device with standard FP16 cache; use CPU when graphics are unavailable.
- CPU: use the independently bundled CPU engine and its available instruction variants.
- Compatible graphics: try the same Vulkan engine explicitly. No NVIDIA/AMD/Intel toolkit installation is needed.
- Standard, Q8, Q4: select working-memory precision separately from the model's weight quantization. Q4 is experimental. Quantized value caches request flash attention; standard fallback disables it.
- A failing load/generation probe retries standard cache, then CPU, then a 2,048 context. The successful fallback is saved and shown in Settings. Cancellation, insufficient free memory, or a corrupt required component does not trigger repeated load attempts.
- Invalid saved values are bounded to the current machine. Malformed JSON preference rows are retained in `damaged_settings` in the local SQLite journal before their defaults are restored. Missing working folders and browsers are repaired where an alternative exists. Restore recommended performance settings resets only performance preferences.

Runtime startup checks include token-level grammar enforcement. Passing these probes establishes that the configuration loads and generates; it does not establish speed, model quality, or maximum safe memory use. CPU first-run qualification remains a separate text/tool/recall/vision check.

## Compatibility evidence

Windows 10/11 on Intel/AMD x64 is the compatibility target. Recommend at least 8 GB RAM. Physical low-end Intel, physical 8 GB, AMD GPU, Intel GPU, and clean Windows 10 testing is still pending. ARM64, 32-bit Windows, macOS, and Linux are not supported by these EXEs.

Vulkan is a backend inside llama.cpp. GPU vendor names do not establish which cache kernels a particular driver/build supports; the product probes the selected configuration and retains a CPU fallback. ROCm/HIP and SYCL are not shipped in this beta. Upstream references: [llama.cpp build documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [backend feature matrix](https://github.com/ggml-org/llama.cpp/wiki/Feature-matrix), [Node supported platforms](https://github.com/nodejs/node/blob/main/BUILDING.md). Runtime sources are pinned to [llama.cpp b10809](https://github.com/ggml-org/llama.cpp/releases/tag/b10809).

Validation scripts: `check.mjs` for application tests; `runtime-compat-check.mjs` for real CPU/Vulkan and standard/Q8 loading and generation; `SetupTests.cs` for path containment, corruption, bounded size, cancellation, repair rollback and personal-file retention. EXE `--install-test <empty-folder>` runs the actual installer without Windows integration; `--layout-test <png>` renders its actual form. Keep generated audit results out of distribution.

The installers are unsigned betas. Commercial signing and a physical hardware matrix remain required before sale. Hashes detect corruption; they do not establish a trusted publisher. Code signing needs packaging-aware handling of the embedded payload footer before enabling a signing pipeline.
