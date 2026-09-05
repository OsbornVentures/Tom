# Tom 0.4.0 package validation

**Passed on the development Windows 11 x64 host. This is not a commercial release or low-memory qualification.** This report was produced after packaging; exact artifact hashes, sizes and qualification measurements are in the [machine-readable record](package-0-4-0.json).

The build passed 50 deterministic tests, checked 48 JavaScript files and compiled the Windows launcher and installer. GitHub Actions has not run. The offline installer copied and verified all 204 files into a new path containing spaces. Tom started with only standard Windows folders in PATH and automatically passed text generation, structured tool formatting, 4,096-context recall and vision recognition. Installed production files matched the package manifest.

The test used portable installation mode. It did not register Windows menus, test a clean Windows account, disconnect the network, or certify uninstall/update behavior. Installation itself reads the bundled payload without downloading dependencies. The subsequent optional catalogue check had internet access. E4B was offered for download and a local trial; larger candidates failed the speed screen. Nothing was downloaded or activated, and E2B remained selected.

## Measured first run

| Measurement | Observation |
|---|---:|
| Model loading and validation | 15.44 s |
| Short generation first output | 0.74 s |
| Short generation decode | 13.91 tokens/s |
| 2,874-token recall request | 80.00 s total; 79.07 s to first output |
| Minimum system-wide free RAM during check | 20.66 GiB |
| Local qualification duration, including vision reload | 135.10 s |

These are single samples. The short first-output measurement does not represent a long agent task. System free RAM includes other applications and is not Tom's peak working set. The full browser/model/supervisor process tree still needs dedicated memory and paging measurement on physical minimum-spec machines.

## Distribution footprint

| Component | Bytes | Approximate decimal size |
|---|---:|---:|
| E2B weights | 3,349,516,256 | 3.35 GB |
| Matching vision projector | 986,833,664 | 986.83 MB |
| Node runtime | 92,825,416 | 92.83 MB |
| Native CPU runtime and its app-local dependencies | 44,140,501 | 44.14 MB |
| Playwright Core, without a browser download | 13,442,086 | 13.44 MB |
| Harness, UI, configuration, launcher, docs and notices | 672,270 | 0.67 MB |
| **Total payload** | **4,487,430,193** | **4.49 GB / 4.18 GiB** |

`Setup-Tom.exe` is 27,648 bytes and sits beside the manifest and payload directory. `Start-Tom.exe` is 32,768 bytes and is included in the payload. This is an unsigned development folder distribution, not a single self-extracting EXE. Model files dominate its size; KV quantization changes inference cache memory, not these disk sizes.

## Failure found during installation

The first PowerShell 7 build serialized the summed payload size with a decimal suffix. The .NET installer rejected that value when reading an Int64, before installing any files. The build now casts the total to Int64. A full rebuild and actual fresh installation passed after this correction. The failed layout remains in the local ignored audit artifacts and is not the validated package.

This is the only code change after the recorded model baseline, and it affects packaging only. Both hashes of the changed build script are recorded in the JSON. The baseline's inference, browser, UI and task-harness sources were not changed to obtain this installation result.

The [seven-case model baseline](baseline-0-4-0.md) still has a failed webpage task and an unrun follow-up. Build and installation success do not erase those failures. Apply the [proposed shipping gates](../BENCHMARKS.md) before advertising supported systems or selling a release.
