# Tom development distribution: third-party components

Tom's commercial application license and installer terms have not been finalized. The following notices describe components in this development payload, not a blanket license for Tom itself.

- **Gemma 4 E2B IT QAT Q4_0 GGUF and matching multimodal projector**: Google, Apache-2.0. Both are from `google/gemma-4-E2B-it-qat-q4_0-gguf`, revision `675cff42a74c774d6cb76f76d8eacb49b48c9b93`. Included notices: `licenses/Gemma-Apache-2.0.txt` and `licenses/Gemma-model-card.md`. Upstream: https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf.
- **llama.cpp b10809**, commit `5266f24da`: MIT. Included `licenses/llama.cpp-MIT.txt`. CPU archive hash: `9df3158ed228a641a4b127942d7f459f24c9e13f04682659d05c00c80099b6b5`. Individual restored native component hashes are in `config/runtime-components.json`. Upstream: https://github.com/ggml-org/llama.cpp/tree/b10809.
- **LLVM OpenMP runtime** distributed with that CPU archive: its supplied license is preserved as `licenses/LICENSE-LLVM-OpenMP` and in the runtime directory.
- **Node.js v24.19.0**: the upstream license and included dependency notices are in `licenses/Node-LICENSE.txt`. Upstream: https://github.com/nodejs/node/tree/v24.19.0. Node's built-in SQLite support is used by the development supervisor.
- **Playwright Core 1.62.1**: Apache-2.0, in `licenses/Playwright-Apache-2.0.txt` and the copied package's `LICENSE` and `NOTICE` files. Upstream: https://github.com/microsoft/playwright. The optional helper uses an already installed browser; no browser binary is bundled.
- **Microsoft .NET Framework and Microsoft Edge**: installed system components used by the development launcher. They are not redistributed in this payload.

The preserved Nyx reference directory has its own license and notices. It is excluded from `package-dev.ps1` outputs. Nyx's sanitization utilities and smartmontools are not part of Tom's runtime.

Do not substitute model or projector revisions independently. A release must pin and verify the complete redistributed payload and retain each dependency's accompanying notices.

- **Microsoft Visual C++ v14 Runtime 14.51.36247.0**: app-local AMD64 minimum runtime DLLs extracted from Microsoft's signed VC_redist.x64.exe. Original SHA256: 843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c. Bundle and individual Microsoft signatures verified. License: licenses/Microsoft-Visual-Cpp-14-License.txt and original DOCX. Upstream source: https://aka.ms/vc14/vc_redist.x64.exe. These are development copies; commercial redistribution requires applicable Visual Studio redistribution rights or replacing this runtime build. Microsoft redistribution guidance: https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files.
