# candidate-0-5-0

Classification: **development candidate before final relevance and handoff refinements**. 4/9 outcome checks passed. 5 failed. See the [machine-readable record](candidate-0-5-0.json) for exact assertions, source/dependency hashes, outputs and timing samples.

Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; win32 x64; context 4096; CPU threads 4; K/V q8_0/q8_0. 1 repetition(s), starting seed 42.

| Case | Outcome | Task state | Wall seconds | Calls | Output tokens | Compactions |
|---|---|---|---:|---:|---:|---:|
| file | PASS | complete | 43.4 | 2 | 52 | 0 |
| webpage | FAIL | budget | 600.2 | 7 | 4569 | 5 |
| followup | FAIL | skipped | 0.0 | — | — | 0 |
| browser | PASS | complete | 67.2 | 3 | 200 | 0 |
| missing-page | PASS | blocked | 37.2 | 2 | 70 | 0 |
| vision | PASS | complete | 29.8 | 1 | 28 | — |
| weather | FAIL | blocked | 34.0 | 1 | 48 | 0 |
| weather-followup | FAIL | blocked | 42.3 | 1 | 48 | 0 |
| live-web | FAIL | blocked | 36.1 | 1 | 49 | 0 |

- One physical host; this is a build baseline, not fleet qualification.
- Minimum free memory includes other running applications; supervisor RSS excludes browser/model processes.
- Live search results and network timing are not deterministic.
- Seeds and build hashes are recorded; exact CPU floating-point output can differ across builds/hardware.

A blocked or budget-limited task is not a successful task; the missing-page negative case explicitly expects an honest failure. No result on this machine qualifies low-memory systems.
