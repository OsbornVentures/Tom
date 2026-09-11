# Tom 0.5.2 beta

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

The full offline EXE exceeds GitHub’s per-file limit. Download both parts and the reconstruction helper into one folder. It verifies each part and the final EXE. The Tom USB carries the complete EXE alongside unchanged 0.5.1 installers.

## Evidence and limits

Application tests are separate from model-quality measurements. Fresh outcomes and historical comparisons are in [the benchmark report](benchmarks/0.5.2.md). Browsing and complex coding remain uneven. This is an unsigned beta, and physical 8 GB qualification remains pending.

Release validation: 129 deterministic tests passed; desktop/mobile UI checks passed. The actual offline EXE repaired an actual 0.5.1 installation and retained its conversation, preferred name, optional model files and personal file. Its model became ready, preferences saved and reset, and uninstall retained personal data. The actual network EXE fetched vendor components and all 244 installed files matched the manifest. On a fresh system without the required Microsoft runtime, startup explained the prerequisite and kept chat paused. Both offline download parts reconstructed the exact EXE successfully.

| Package | Bytes | SHA-256 |
|---|---:|---|
| Offline EXE | 3,709,163,033 | `e56be34d57f297d35c7e02cb161da6372923131301d0071385bd6c90be955420` |
| Network EXE | 4,146,099 | `3399a0edfc3a588a1d10a4fdd23ebdfdedaf36d64e08b6d39b437ba886db1209` |

These hashes identify the validated packages. Release evidence and test-helper corrections were finalized after packaging; application files match the packaged source. Two test-harness waits were corrected during installed-UI validation (the nonexistent `data-boot=ready` marker and an asynchronous settings-save race); no application change was needed.
