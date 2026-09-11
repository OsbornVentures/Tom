# Tom E2B Q4 capability comparison — methodology

This is a developer-authored exploratory experiment, not an independent certification, SWE-bench result, or ranking against a shipped competitor. The suite and run manifest were saved before the first evaluated model response. No application code is changed to improve the result during the run. Failed attempts remain in the record.

## Question and scope

Does the current Tom controller help the pinned Gemma 4 E2B Q4_0 model produce correct small local deliverables compared with a simpler tool loop? A separate text-only arm measures whether the underlying model can already supply the correct contents. This is not a speed contest.

Eight synthetic tasks × two seeds × three modes = 48 planned trials. Four tasks repair small JavaScript functions; two transform local data; two preserve file facts/bytes, including a quoted malicious instruction. These newly authored tasks were not used to tune production code during this evaluation. They are small convenience samples, not randomly sampled customer work or real repository issues. Their generic programming patterns may occur in training data.

## Modes

| Mode | Configuration | What it measures |
|---|---|---|
| Direct | One unconstrained model response; all fixture contents included in the prompt; return only the requested file body | Content generation without operating files. The evaluator saves the answer verbatim. This is not autonomous file-task success. |
| Minimal | Tom's generic dispatch grammar, production model adapter and shell/write implementations; simple prompt; append-only tool history | Internal tool-loop baseline. No task-specific grammar, evidence gate, compaction, checkpoint continuation, or controller recovery. This is not Eldon, Aider, or mini-SWE-agent. |
| Tom | Production Engine, Runtime, Store and tools, including task-specific dispatch and completion gates | Full controller under the evaluator's declared file permissions. |

The two tool modes share 24 calls, 12,288 generated tokens, 15 active minutes, and at most 2,048 tokens per segment. Both have a 4,096-token context. The direct arm gets a single 2,048-token response, so it is a diagnostic reference rather than a budget-matched agent. Model sampling is temperature 0.2, top-p 0.95, top-k 64, seeds 42 and 43, thinking disabled. KV cache is Q8_0, GPU layers zero, inference and batch threads two. No CPU affinity is imposed: this is a two-inference-thread run on an eight-logical-processor host, not a whole-machine two-thread limit.

Mode order rotates by case and seed. Runs are sequential on one native worker with a reusable prefix cache. Prompts do not intentionally include other trials' answers. There is one shared cold load; per-task wall times are diagnostic and not latency qualification. Normal desktop background load is uncontrolled.

## Permissions and scoring

Tool-based tasks may read named fixture files and the named output with `cat`, and write only the named output. Other reviewed commands are declined. The evaluator checks write destinations before execution. The production controller itself is not a filesystem sandbox. This restricted review policy must not be represented as Tom's general unrestricted shell performance. The function code is evaluated after submission with hidden checks; the agents do not receive test outcomes or run repository tests. Thus these are small software repair tasks, not full SWE workflows with test-driven iteration.

The primary result is **artifact correctness**: all functional/data/byte checks pass, input fixture bytes are unchanged, and no unexpected file is created. A secondary result additionally requires a completed task state. A completed state with an incorrect artifact is reported separately. The direct arm's completion state means the model response ended normally, not that the model operated a computer.

Code is checked on empty inputs, boundaries, nesting/ordering, and mutation where applicable. Each hidden case executes in a fresh JavaScript context with a 750 ms limit and without exposed process or file APIs; dynamic code generation is disabled. Node's VM is not a general security sandbox. Only synthetic generated function bodies are evaluated, not downloaded repository install scripts. JSON comparisons ignore object-key ordering and preserve array ordering; text comparisons are byte-exact for these UTF-8 fixtures. Markdown fences are not silently repaired or removed in the primary score.

The grader was checked before inference: eight reference solutions passed, eight corrupt outputs failed, all four buggy originals failed, and timeout/unavailable-process/dynamic-code checks passed. These checks validate the scorer's intended distinctions, not exhaustive correctness of every possible implementation.

**Post-hoc scorer correction:** V1 omitted valid CommonJS imports from supplied fixture files. V2 adds a restricted fixture-module loader and applies to every saved output without changing the test cases or regenerating responses. Final reported scores use V2; the original records remain available. See [the correction note](capability-scoring-correction.md).

## Interpretation and uncertainty

Publish all denominators and all seeds. The two repeats are correlated observations on the same eight tasks; they are not 16 independent task types. Report paired wins, losses and ties; any exploratory bootstrap resamples whole task IDs with both seeds retained. A small convenience sample cannot establish general customer reliability. Do not cherry-pick seeds, merge historical source versions, or claim a statistically established uplift from a descriptive point difference alone.

Minimal versus Tom changes several controller components together, including the system prompt. It measures that bundle, not a causal attribution to grammar, compaction, or memory individually. Minimal already includes Tom's grammar and safe-write code, so it cannot measure their benefit over an unconstrained external harness. Direct has fixture contents supplied inline, while agents must obtain them through tools.

Malformed/truncated responses, context exhaustion, blocked/paused tasks, wrong code and unsupported completion are retained with distinct statuses. Infrastructure errors must be described; a missing output alone is not grounds to assume why a model failed. Predicted failure is not a measured zero. Skipped external suites and unavailable hardware are excluded from the 48-trial denominator.

## Evidence and reproduction

The runner writes a pre-inference protocol, model/runtime identities, source hashes, hardware details, every returned response, produced files, tool actions, token use, statuses and assertions under `.state/capability/<timestamp>`. Tom's isolated SQLite journal additionally records exact input snapshots. Connection credentials and user conversations are not published. The report package contains sanitized synthetic evidence and a frozen source snapshot; the multi-gigabyte model is identified by hash rather than redistributed.

Run with the interactive model unloaded and no active task:

```powershell
runtime/node.exe scripts/capability-check-grader.mjs
runtime/node.exe scripts/capability-benchmark.mjs
```

The bundled native runtime verifies component and model hashes before loading. Reproduction requires the same artifacts and compatible Windows x64 environment. Exact outputs can still vary across backend builds and hardware. This protocol does not qualify other quantizations, models, operating systems, CPU generations or RAM capacities.
