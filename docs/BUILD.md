# Building the Windows development package

The source repository excludes model weights, runtime binaries, credentials, user conversations, migration references and generated packages. A source checkout alone is not an offline installer.

The qualified development configuration is Windows 11 x64, Node 24.19.0, llama.cpp b10809 CPU, Playwright Core 1.62.1, and the pinned Gemma 4 E2B Q4_0 model plus its matching image projector. No Python, Electron or separate Chromium download is needed by the shipped app. Edge/Chrome and .NET Framework are system prerequisites. Other platforms are unqualified.

## Restore dependencies

Restore `runtime`, `models`, and accompanying licenses from a verified Tom development payload, or obtain the exact versions from their official upstream distributions. Never substitute a projector independently. Model and native component hashes are pinned in `config/runtime.json` and `config/runtime-components.json`.

| Destination | Upstream / pinned version |
|---|---|
| `runtime/node.exe` | [Node 24.19.0 Windows x64](https://nodejs.org/dist/v24.19.0/) |
| `runtime/llama` | [llama.cpp b10809 Windows CPU x64](https://github.com/ggml-org/llama.cpp/releases/tag/b10809); native component inventory in config |
| `runtime/browser/node_modules/playwright-core` | [playwright-core 1.62.1](https://www.npmjs.com/package/playwright-core/v/1.62.1) |
| `models` | [Google E2B Q4_0 GGUF package](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/tree/675cff42a74c774d6cb76f76d8eacb49b48c9b93); filenames, revisions, sizes and hashes in config |
| Native C++ runtime DLLs | The app-local Microsoft runtime documented in `THIRD_PARTY_NOTICES.md`; retain applicable licenses and verify redistribution rights before distribution |

Dependencies are pinned, but an automated fresh-machine dependency bootstrap and reproducible signed compiler environment remain release work. Historical audit scripts may require development imaging tools; they are excluded from the installer. `check.mjs` and `benchmark.mjs` use Node and Tom's own bundled browser adapter, with no Codex-specific dependency paths.

## Check and package

```powershell
runtime/node.exe scripts/check.mjs
powershell -NoProfile -File scripts/build-offline.ps1
```

Quit the running Tom tray helper before compiling its launcher. The build script refuses an existing destination, checks all JavaScript syntax, checks product/package version agreement, runs the deterministic suite, compiles the launcher and installer with Windows .NET Framework, and copies only the intended payload. It derives the version from product configuration. Benchmark qualification is separate and must accompany every release candidate; a successful package build does not assert task quality.

The output is `dist/Tom-offline-<version>` containing `Setup-Tom.exe`, `payload-manifest.json` and `Tom-Payload`. Keep all three together. This is an unsigned offline development layout, not a single self-extracting commercial EXE. Setup stages and verifies every file before committing an installation, does not overwrite a nonempty target, and starts the first-run hardware/model check when the app opens.

The manifest provides accidental-corruption detection. A release needs a trusted signature, code signing, dependency provenance/SBOM, repair/uninstall and update rollback. Do not upload `.state`, raw audit journals, credentials or local connection URLs to GitHub.

## Compare a later build

Use the [benchmark protocol](BENCHMARKS.md). Keep prompts, seeds, measurement conditions and test version fixed. Publish the exact source and dependency hashes alongside results, including failures. Test a fresh offline installation as well as the development folder. A build-ready Windows package is not a claim that every CPU/RAM/OS combination is supported.
