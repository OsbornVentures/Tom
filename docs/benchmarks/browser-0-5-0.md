# browser-0-5-0

Classification: **final browser regression**. 3/5 outcome checks passed. 2 failed. See the [machine-readable record](browser-0-5-0.json) for exact assertions, source/dependency hashes, outputs and timing samples.

Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; win32 x64; context 4096; CPU threads 4; K/V q8_0/q8_0. 1 repetition(s), starting seed 42.

| Case | Outcome | Task state | Wall seconds | Calls | Output tokens | Compactions |
|---|---|---|---:|---:|---:|---:|
| browser | PASS | complete | 80.2 | 3 | 206 | 0 |
| missing-page | PASS | blocked | 36.3 | 2 | 70 | 0 |
| weather | FAIL | blocked | 23.8 | 1 | 50 | 0 |
| weather-followup | FAIL | blocked | 31.1 | 1 | 50 | 0 |
| live-web | PASS | complete | 224.5 | 4 | 309 | 2 |

- One physical host; this is a build baseline, not fleet qualification.
- Minimum free memory includes other running applications; supervisor RSS excludes browser/model processes.
- Live search results and network timing are not deterministic.
- Seeds and build hashes are recorded; exact CPU floating-point output can differ across builds/hardware.

A blocked or budget-limited task is not a successful task; the missing-page negative case explicitly expects an honest failure. No result on this machine qualifies low-memory systems.
