# exploratory-c

Classification: **exploratory**. 5/6 outcome checks passed. 1 failed. See the [machine-readable record](exploratory-c.json) for exact assertions, source/dependency hashes, outputs and timing samples.

Intel(R) Xeon(R) CPU E3-1245 v5 @ 3.50GHz; 31.9 GiB RAM; win32 x64; context 4096; CPU threads 4; K/V q8_0/q8_0. 1 repetition(s), starting seed 42.

| Case | Outcome | Task state | Wall seconds | Calls | Output tokens | Compactions |
|---|---|---|---:|---:|---:|---:|
| file | PASS | complete | 40.9 | 2 | 52 | 0 |
| webpage | FAIL | error | 568.7 | 6 | 3562 | 4 |
| browser | PASS | complete | 64.5 | 3 | 242 | 0 |
| missing-page | PASS | blocked | 35.3 | 2 | 93 | 0 |
| vision | PASS | complete | 32.4 | 1 | 28 | — |
| live-web | PASS | complete | 216.6 | 4 | 322 | 2 |

- One physical host; this is a build baseline, not fleet qualification.
- Minimum free memory includes other running applications; supervisor RSS excludes browser/model processes.
- Live search results and network timing are not deterministic.
- Seeds and build hashes are recorded; exact CPU floating-point output can differ across builds/hardware.

A blocked or budget-limited task is not a successful task; the missing-page negative case explicitly expects an honest failure. No result on this machine qualifies low-memory systems.
