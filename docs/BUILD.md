# Build Tom 0.5.2 beta

The Apache 2.0 source repository excludes model weights, runtime binaries, installers, credentials and personal state. A source checkout is not an offline installation.

## Windows environment and dependencies

Use Windows 10/11 on Intel/AMD x64, an installed supported browser (Edge is tested), and the Windows .NET Framework compiler. Install [Microsoft’s latest Visual C++ x64 runtime](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) before going offline. Tom 0.5.2 does not redistribute the app-local Microsoft DLLs found in earlier development packages.

Restore these exact dependencies from their official distributions, retaining licenses. A verified Tom installation supplies the serving engines, model, Node and Playwright; building the network installer additionally requires the two original llama.cpp ZIPs.

| Destination | Source |
|---|---|
| `runtime/node.exe` | [Node 24.19.0 Windows x64](https://nodejs.org/dist/v24.19.0/win-x64/node.exe) |
| `runtime/llama-b10809.zip` and `runtime/llama/` | [llama.cpp b10809 CPU x64](https://github.com/ggml-org/llama.cpp/releases/tag/b10809) |
| `runtime/llama-b10809-vulkan.zip` and `runtime/vulkan/` | Matching Vulkan x64 archive from the same release |
| `runtime/browser/node_modules/playwright-core/` | [Playwright Core 1.62.1](https://www.npmjs.com/package/playwright-core/v/1.62.1); no browser bundle |
| `models/` | [Google E2B QAT Q4_0 GGUF and projector](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/tree/675cff42a74c774d6cb76f76d8eacb49b48c9b93) |

Names, revisions, lengths and hashes are pinned in `config/runtime.json`, `config/runtime-components.json`, `config/gpu-runtime.json` and `config/setup-sources.json`. Never mix native engine releases or substitute a projector independently. Vendor availability can change. Automated fresh-machine restoration and reproducible signed builds remain future work.

## Check and package

Quit Tom before rebuilding its launcher. From the repository root:

```powershell
runtime/node.exe scripts/check.mjs
powershell -NoProfile -File scripts/build-installers.ps1
```

The build refuses an existing output directory, checks JavaScript and version agreement, runs deterministic tests, compiles launch/setup/uninstall applications, verifies pinned binaries and creates `dist/Tom-beta-0.5.2/Tom-0.5.2-Offline-Setup.exe` and `Tom-0.5.2-Network-Setup.exe`, with SHA256 sidecars.

The offline EXE contains Tom, Node, Playwright Core, CPU/Vulkan engines, E2B and vision. The network EXE embeds Tom and small components and downloads pinned large files from the original vendors. Both require the separately installed Microsoft runtime and browser. Personal state, other downloaded models, test outputs and Microsoft runtime DLLs are excluded.

Distribute the EXEs, release checksums and any verified offline download parts/helper. The `build/` directory contains local intermediates. GitHub limits each release asset to below 2 GiB; the offline EXE is split there and reconstructed exactly. A USB can carry the complete EXE.

## Verify the release

`ui-avatar-context-check.mjs` checks startup gating, faces, context, local paths, Help, mobile layout and update controls with synthetic events. `startup-live-check.mjs` checks actual model readiness. `installer-e2e-check.mjs` exercises a disposable installation, repair, retained conversations and uninstall behavior. See [release notes](RELEASE-0.5.2.md).

Run inference benchmarks one at a time, with interactive Tom unloaded. Publish failures and exact conditions. Application tests are not an AI accuracy score. See [0.5.2 measurements](benchmarks/0.5.2.md).

This beta is unsigned. Clean physical low-memory qualification and recovery from power loss during an update remain unqualified. Back up important work before upgrading.
