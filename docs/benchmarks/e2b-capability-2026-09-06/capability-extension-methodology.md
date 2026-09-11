# Post-hoc filename sensitivity diagnostic

This diagnostic was designed after the original CommonJS failures and source-code review were visible. It is excluded from the original 64-trial comparison and must not replace failed trials or be advertised as a held-out result.

The same four repair specifications and hidden functional checks are used, with `source.cjs` / `solution.cjs` changed to `source.js` / `solution.js`. Only Tom is run, with seeds 42 and 43, the same two inference threads, pinned model, 4,096 context, sampling and task budgets. No production code is changed. Files are isolated, the input must remain unchanged, and the output is evaluated with the same CommonJS function-body checker.

This isolates sensitivity to the requested filename convention reasonably closely, but does not prove a single-component causal effect: directory names and resulting prompts also differ, and the trials run later. The checker treats both variants as CommonJS function bodies; this is not a test of Node's `.js` package/module resolution or a complete repository workflow.

The production audit found that `.js` activates output tracking while `.cjs` does not. Neither extension activates the current required-source-read rule. The diagnostic tests whether the observed delivery/function outcomes change when output tracking becomes available; it does not assume that recognition alone will fix the model's code.

All eight diagnostic attempts, including failures, must be retained separately. The relevant scripts are `capability-js-cases.mjs` and `capability-js-diagnostic.mjs`; the original grader is reused unchanged.
