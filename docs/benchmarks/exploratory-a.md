# exploratory-a

Classification: **exploratory**. 3/7 outcome checks passed. 4 failed. See the [machine-readable record](exploratory-a.json) for exact assertions, source/dependency hashes, outputs and timing samples.

Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; win32 x64; context 4096; CPU threads 4; K/V q8_0/q8_0. 1 repetition(s), starting seed 42.

| Case | Outcome | Task state | Wall seconds | Calls | Output tokens | Compactions |
|---|---|---|---:|---:|---:|---:|
| file | PASS | complete | 40.1 | 2 | 48 | 0 |
| webpage | FAIL | complete | 231.0 | 4 | 1099 | 2 |
| followup | FAIL | error | 201.3 | 3 | 388 | 3 |
| browser | FAIL | blocked | 72.5 | 3 | 361 | 0 |
| missing-page | PASS | blocked | 34.0 | 2 | 71 | 0 |
| vision | PASS | complete | 29.2 | 1 | 28 | — |
| live-web | FAIL | error | 88.4 | 3 | 131 | 0 |

- One physical host; this is a build baseline, not fleet qualification.
- Minimum free memory includes other running applications; supervisor RSS excludes browser/model processes.
- Live search results and network timing are not deterministic.
- Seeds and build hashes are recorded; exact CPU floating-point output can differ across builds/hardware.

A blocked or budget-limited task is not a successful task; the missing-page negative case explicitly expects an honest failure. No result on this machine qualifies low-memory systems.
