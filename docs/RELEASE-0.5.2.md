# Tom 0.5.2 beta

Beta revision 1 refreshes download hosting and installer help. Earlier beta installations can discover the revision through Check for updates.

- Compact reply header: actual animated avatar, larger Tom name, smaller context ring and expandable actions.
- Nine three-character ASCII activity states; seven ready expressions, blinks and waiting dots. Three lines merge during compaction.
- Startup keeps chat paused while showing real checks, current operation and progress; cached qualification no longer skips model readiness.
- Actual compaction count and accessible Help explaining retained history, lost detail and accuracy limits.
- Searchable offline knowledge base with 21 FAQs, plain-language attention and harness explanations, Gemma artwork and stack/license credits.
- Preferred name in setup, prefilled from Windows, editable in Settings and used by the UI and harness.
- Local saved-file cards with full paths, Open locally, Show in folder and Copy path.
- Manual GitHub version check in Settings; opens releases without automatically downloading or installing anything.
- Apache 2.0 source license and installer credits for Gemma 4 (Apache 2.0) and llama.cpp (MIT).
- Microsoft runtime DLLs from earlier development packages are excluded. Install the latest Microsoft Visual C++ x64 runtime as a system prerequisite.

## Install and update

Both editions install the same Tom version and base model. Offline contains the model and vision files; Network downloads pinned large components from their original vendors. Install the Microsoft runtime and browser before going offline.

Quit Tom, run the new installer and select the existing Tom folder. Setup verifies new files before replacement, rolls replacements back on ordinary errors, and retains conversations, name, preferences, optional models and files outside its manifest. Do not uninstall first. Back up important work; power-loss recovery is not qualified.

Download the complete offline EXE from [tom.osbornventures.com](https://tom.osbornventures.com/). The network installer remains on [GitHub Releases](https://github.com/OsbornVentures/Tom/releases/tag/v0.5.2-beta.1). Both packages have published SHA-256 checksums. The Tom USB also carries a complete offline installer; 0.5.1 is preserved.

## Evidence and limits

Application tests are separate from model-quality measurements. Fresh outcomes and historical comparisons are in [the benchmark report](benchmarks/0.5.2.md). Browsing and complex coding remain uneven. This is an unsigned beta, and physical 8 GB qualification remains pending.

Release validation: 129 deterministic tests passed; desktop/mobile UI checks passed. The actual offline EXE repaired an actual 0.5.1 installation and retained its conversation, preferred name, optional model files and personal file. Its model became ready, preferences saved and reset, and uninstall retained personal data. The actual network EXE fetched vendor components and all 244 installed files matched the manifest. On a fresh system without the required Microsoft runtime, startup explained the prerequisite and kept chat paused.

Revision 1 validation: 130 application tests and six download-service tests passed. The revised offline EXE repaired an existing 0.5.2 installation, retained test user files and installed the revised help. A complete 3,709,163,624-byte HTTPS download matched SHA-256 `99877c34a53babde60e04a948cb8ba40980dce40e9a890c3ded271fb08f4a252`; byte-range resume and inaccessible private paths were also checked. Cloudflare successfully refreshed the public repository and restricted clone statistics. The verification download is excluded from the public download counter.

The exact current package sizes and SHA-256 digests are published with the [release downloads](https://github.com/OsbornVentures/Tom/releases/tag/v0.5.2-beta.1) and at [tom.osbornventures.com/SHA256SUMS.txt](https://tom.osbornventures.com/SHA256SUMS.txt).
