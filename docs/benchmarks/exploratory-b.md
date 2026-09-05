# exploratory-b

Classification: **exploratory**. 5/7 outcome checks passed. 2 failed. See the [machine-readable record](exploratory-b.json) for exact assertions, source/dependency hashes, outputs and timing samples.

Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; win32 x64; context 4096; CPU threads 4; K/V q8_0/q8_0. 1 repetition(s), starting seed 42.

| Case | Outcome | Task state | Wall seconds | Calls | Output tokens | Compactions |
|---|---|---|---:|---:|---:|---:|
| file | PASS | complete | 39.5 | 2 | 48 | 0 |
| webpage | FAIL | complete | 342.5 | 5 | 1444 | 3 |
| followup | FAIL | complete | 521.6 | 6 | 516 | 6 |
| browser | PASS | complete | 53.4 | 3 | 172 | 0 |
| missing-page | PASS | blocked | 35.6 | 2 | 90 | 0 |
| vision | PASS | complete | 29.5 | 1 | 28 | — |
| live-web | PASS | complete | 220.0 | 4 | 388 | 2 |

- One physical host; this is a build baseline, not fleet qualification.
- Minimum free memory includes other running applications; supervisor RSS excludes browser/model processes.
- Live search results and network timing are not deterministic.
- Seeds and build hashes are recorded; exact CPU floating-point output can differ across builds/hardware.

A blocked or budget-limited task is not a successful task; the missing-page negative case explicitly expects an honest failure. No result on this machine qualifies low-memory systems.
