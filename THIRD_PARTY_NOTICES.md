# Tom 0.5.2 beta: credits and third-party notices

Tom's original source code is Copyright 2026 OsbornVentures and licensed under Apache-2.0; see LICENSE and NOTICE. The following components retain their own terms. Attribution does not imply endorsement. This is an unsigned beta provided without warranty under the applicable licenses.

- **Gemma 4 E2B IT QAT Q4_0 GGUF and matching multimodal projector**: Google, Apache-2.0. Both are from `google/gemma-4-E2B-it-qat-q4_0-gguf`, revision `675cff42a74c774d6cb76f76d8eacb49b48c9b93`. Included notices: `licenses/Gemma-Apache-2.0.txt` and `licenses/Gemma-model-card.md`. Upstream: https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf.
- **llama.cpp b10809**, commit `5266f24da`: MIT. Included `licenses/llama.cpp-MIT.txt`. CPU archive hash: `9df3158ed228a641a4b127942d7f459f24c9e13f04682659d05c00c80099b6b5`. Individual restored native component hashes are in `config/runtime-components.json`. Upstream: https://github.com/ggml-org/llama.cpp/tree/b10809.
- **LLVM OpenMP runtime** distributed with that CPU archive: Apache-2.0 with LLVM exceptions; its supplied license is preserved as `licenses/LICENSE-LLVM-OpenMP` and in the runtime directory.
- **llama.cpp b10809 Vulkan backend**: same MIT upstream release; Windows archive SHA256 `97e50b3ef0cdd2cb4d5afd446a9006b3496bee6c0d0ba7083d32f36075771870`. Source and component hashes are in `config/gpu-runtime.json`. Uses the computer's installed graphics driver; no GPU driver or SDK is redistributed. Included alongside the CPU package in both installer editions.
- **Node.js v24.19.0**: the upstream license and included dependency notices are in `licenses/Node-LICENSE.txt`. Upstream: https://github.com/nodejs/node/tree/v24.19.0. Node's built-in SQLite support is used by the development supervisor.
- **Playwright Core 1.62.1**: Apache-2.0, in `licenses/Playwright-Apache-2.0.txt` and the copied package's `LICENSE` and `NOTICE` files. Upstream: https://github.com/microsoft/playwright. The optional helper uses an already installed browser; no browser binary is bundled.
- **Microsoft .NET Framework, Microsoft Visual C++ v14 x64 Runtime, Windows and Microsoft Edge**: separately installed prerequisites under Microsoft's licenses. They are not redistributed in the 0.5.2 payload. Official Visual C++ prerequisite: https://aka.ms/vc14/vc_redist.x64.exe. Install it before using Tom if Windows reports missing runtime components.
- **SQLite**: public domain; included through Node.js. https://sqlite.org/copyright.html.
- **Exa**: external search service used for web queries, not redistributed software. Service terms apply to its use. https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf.
- **Gemma identifying artwork**: supplied by the project owner to identify Google DeepMind's Gemma 4. Brand names and artwork retain their owners' rights and are excluded from Tom's source-code license grant. No Google affiliation or endorsement is claimed.
- **Development assistance**: GPT-6 Astra in Codex helped develop and polish Tom. Astra is not Tom's inference engine and is not bundled; Tom runs Gemma locally.

Do not substitute model or projector revisions independently. A release must pin and verify the complete redistributed payload and retain each dependency's accompanying notices.

Historical 0.5.1 development copies included app-local Microsoft runtime DLLs. New 0.5.2 installers exclude those files because separate redistribution rights were not established. License references remain for attribution and upgrade history. Microsoft redistribution guidance: https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files.

Gemma 4 specifically uses Apache-2.0 (https://ai.google.dev/gemma/apache_2). The older Gemma Terms of Use apply to the older model families listed there, not this Gemma 4 payload. llama.cpp is MIT software and does not require accepting a Meta Llama model agreement. Each dependency's full included license and notices remain authoritative.
