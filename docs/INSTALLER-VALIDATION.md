# Tom 0.5.1 beta validation — 2026-09-10

The Windows installer beta was tested on the current development computer. This is not a physical compatibility matrix.

| Check | Result |
|---|---|
| Application deterministic suite | 110 passed, 0 failed |
| Browser interface | Settings, streaming, narrow layout, reduced motion and page errors passed |
| CPU, standard FP16 cache | Model loaded, grammar enforced, real reply generated |
| CPU, Q8 cache | Model loaded, grammar enforced, real reply generated |
| Vulkan, standard FP16 cache | Model loaded, grammar enforced, real reply generated on RTX 3050 |
| Vulkan, Q8 cache | Model loaded, grammar enforced, real reply generated on RTX 3050 |
| Offline EXE | Fresh install from the self-contained file passed |
| Network EXE | Full install using public vendor downloads passed |
| Repair | Damaged application file restored; conversation and personal note retained |
| Saved settings recovery | Malformed JSON quarantined; invalid performance settings repaired |
| Installed interface | Performance preferences saved; recommended settings restored |
| Uninstall | Program removed; conversation database and personal note retained |
| Installer failure handling | Traversal, bad hashes, unexpected sizes, cancellation and repair rollback passed |

The runtime probes use a 2,048 context, two CPU threads, and the actual pinned E2B model. They validate loading and generation, not model quality or sustained performance. The installed supervisor was tested with development tools removed from PATH. Repair/uninstall integration tests used portable mode so the development installation's Windows registrations were not changed.

Still pending: physical 8 GB and lower-end Intel PCs, AMD/Intel GPU hardware, clean Windows 10, accessibility/DPI matrices, Q4 KV quality, power-loss recovery during repair, code signing, and commercial redistribution review. Windows integration uses account-owned entries and refuses to replace another installation's registrations; a clean-account registration/unregistration test remains pending.

Detailed local evidence is in `audit/installer-beta` and `audit/v05`, excluded from installers. Test helpers live in `scripts/SetupTests.cs`, `scripts/runtime-compat-check.mjs`, `scripts/installer-e2e-check.mjs`, and `scripts/installed-startup-check.mjs`.
