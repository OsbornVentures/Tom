# Tom 0.5.0 package validation

**Build and fresh portable installation passed on the development Windows 11 x64 host. This is not a shipping or minimum-hardware qualification.** Exact sizes, hashes, UI checks and measurements are in the [machine-readable record](package-0-5-0.json). This report was generated after packaging and is not included in the payload.

The build passed all **58 deterministic tests**, checked 51 JavaScript files and compiled the Windows launcher and installer. The real offline installer copied and verified all **213 files** into a new path containing spaces. Tom started with only standard Windows directories in PATH. Its automatic first-run check passed text generation, backend grammar enforcement, structured tool formatting, 4,096-context recall and vision. Every installed file matched the payload manifest.

## First-run measurements

| Measurement | Observation |
|---|---:|
| Model loading and validation | 16.64 s |
| Short generation first output | 0.80 s |
| Short generation decode | 14.17 tokens/s |
| 2,874-token recall request | 79.84 s total; 78.88 s to first output |
| Minimum system-wide free RAM during check | 21.17 GiB |
| Complete local qualification, including vision reload | 135.45 s |

These are single samples on a Xeon E3-1245 v5 with 31.9 GiB RAM, four inference threads and no GPU. Available system memory includes other applications and is not Tom's peak process-tree memory. The short-generation latency does not describe a long request.

After qualification, the online catalogue offered E4B for download and a separate trial. Larger candidates failed the predicted-speed screen. No upgrade was downloaded or activated; E2B remained selected. The installation test did not physically disconnect networking. Installation itself reads the bundled files without downloading dependencies. Portable test mode does not register Windows menus and does not qualify clean-account installation, update, repair or uninstall behavior.

## Distribution footprint

| Component | Bytes | Approximate decimal size |
|---|---:|---:|
| E2B weights | 3,349,516,256 | 3.35 GB |
| Matching vision projector | 986,833,664 | 986.83 MB |
| Node runtime | 92,825,416 | 92.83 MB |
| Native CPU runtime and app-local dependencies | 44,140,501 | 44.14 MB |
| Playwright Core, without a browser download | 13,442,086 | 13.44 MB |
| Harness, UI, configuration, launcher, docs and notices | 750,101 | 0.75 MB |
| **Total payload** | **4,487,508,024** | **4.49 GB / 4.18 GiB** |

`Setup-Tom.exe` is 27,648 bytes and must remain beside the manifest and payload folder. `Start-Tom.exe` is 32,768 bytes and is included in the payload. This is an unsigned folder distribution, not a single self-extracting executable. Model weights dominate disk usage; KV quantization affects inference cache memory rather than weight-file size.

The production harness, UI and model configuration match the [final browser regression](browser-0-5-0.md). Only the benchmark runner's `core` selector changed afterward to exclude internet-dependent weather cases; its before/after hashes are recorded. The final browser run passed 3/5 checks, with both weather tasks honestly blocked. The earlier candidate's long webpage task also failed. Successful packaging does not change those task outcomes. See the [0.5 evaluation](0.5.0.md) and [proposed shipping gates](../BENCHMARKS.md) for remaining work.
