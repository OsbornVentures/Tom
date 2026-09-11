# Scorer correction: valid CommonJS fixture imports

The original scorer executed a submitted function in a limited JavaScript context with `module.exports`, but no `require`. During the Aider batch, the seed-43 money-sum solution imported the supplied `source.cjs`. The import was unnecessary for that particular implementation, but it was valid in the task's CommonJS environment. V1 therefore risked scoring valid code as failed. The prompt did not prohibit imports of supplied files.

**V2 is the authoritative scorer.** It supplies a CommonJS-style module wrapper and a restricted `require` for the fixture modules included in that task. Source modules are compiled into the same limited context; the model gets no host `require`, filesystem or process object. The functional input/expected-output cases, mutation checks and 750 ms per-case timeout are unchanged. JSON and exact-text scoring are unchanged.

This is a post-hoc evaluator correction, not a model repair. All saved outputs from all modes are rescored identically with V2. No prompts, model outputs or expected answers are edited, and no affected task is regenerated to obtain a better answer. Original V1 results are retained separately. The report lists every changed pass/fail outcome.

Validation includes correct implementations with supplied-module imports, the original buggy imported implementation (which must still fail), unavailable host imports, unavailable process access, dynamic-code attempts, infinite loops and corrupt outputs. The standalone reference solutions are also checked. A restricted VM is not a general security sandbox; this is a controlled synthetic function evaluator.

The correction applies equally to the later `.js` filename diagnostic. That diagnostic remains separate from the main comparison. Future reproductions should preserve original generation logs and apply `capability-score-v2.mjs` before reporting final scores.
