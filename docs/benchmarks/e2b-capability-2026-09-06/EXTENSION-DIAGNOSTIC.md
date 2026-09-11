# Post-hoc filename sensitivity results

The same four small repairs were repeated using .js instead of .cjs filenames, with two seeds and no production-code changes. This is a diagnostic chosen after seeing the original failures; it is excluded from the 64-trial comparison. The corrected V2 scorer applies to both variants.

| Variant | Nonempty deliverables | Functionally correct |
|---|---:|---:|
| Original .cjs | 5/8 | 0/8 |
| Diagnostic .js | 8/8 | 0/8 |

Recognized filenames did not produce a passing repair in this diagnostic. Fixing output recognition alone cannot be claimed to solve the code-quality problem.

| Task | Seed | Correct | End state |
|---|---:|---|---|
| sum-money-js | 42 | FAIL | complete |
| merge-ranges-js | 42 | FAIL | complete |
| stable-unique-js | 42 | FAIL | complete |
| paginate-js | 42 | FAIL | complete |
| sum-money-js | 43 | FAIL | complete |
| merge-ranges-js | 43 | FAIL | complete |
| stable-unique-js | 43 | FAIL | complete |
| paginate-js | 43 | FAIL | complete |

Both variants are checked as CommonJS function bodies. This is not a test of Node package/module resolution or a repository workflow. The source inventory in the diagnostic runner was briefly edited after the process had loaded, then restored byte-for-byte; the edit concerned metadata collection only. The executing generator, model prompts, grader inputs and production sources were not changed. Start/end source hashes agree, and the matching source snapshot is retained. See [methodology](capability-extension-methodology.md).
