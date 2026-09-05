# baseline-0-4-0

Classification: **preliminary baseline**. 5/7 outcome checks passed. 2 failed. See the [machine-readable record](baseline-0-4-0.json) for exact assertions, source/dependency hashes, outputs and timing samples.

Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; win32 x64; context 4096; CPU threads 4; K/V q8_0/q8_0. 1 repetition(s), starting seed 42.

| Case | Outcome | Task state | Wall seconds | Calls | Output tokens | Compactions |
|---|---|---|---:|---:|---:|---:|
| file | PASS | complete | 40.8 | 2 | 49 | 0 |
| webpage | FAIL | error | 591.0 | 6 | 3757 | 4 |
| followup | FAIL | skipped | 0.0 | — | — | 0 |
| browser | PASS | complete | 62.2 | 3 | 244 | 0 |
| missing-page | PASS | blocked | 34.4 | 2 | 91 | 0 |
| vision | PASS | complete | 30.0 | 1 | 28 | — |
| live-web | PASS | complete | 211.3 | 4 | 314 | 2 |

- One physical host; this is a build baseline, not fleet qualification.
- Minimum free memory includes other running applications; supervisor RSS excludes browser/model processes.
- Live search results and network timing are not deterministic.
- Seeds and build hashes are recorded; exact CPU floating-point output can differ across builds/hardware.

A blocked or budget-limited task is not a successful task; the missing-page negative case explicitly expects an honest failure. No result on this machine qualifies low-memory systems.
