# Named peer addendum: Aider 0.86.2

This addendum was written before the first scored Aider response, after some internal-comparison results were visible. It is therefore an exploratory extension, not an externally preregistered trial. The eight tasks and hidden graders are unchanged. All eight tasks are run with seeds 42 and 43; no favorable subset is selected.

The installed `aider-chat` package is version 0.86.2. Its native programmatic `Coder` uses the **whole-file** editing format, which is also the package's generic model default. The integration supplies source files as read-only context and the named deliverable as the editable file. Aider starts the deliverable as an empty file; Tom and the direct arm start without it. Final file correctness is checked identically.

Git integration, commits, repository maps, linting, automatic tests, URL detection, shell suggestions and telemetry are disabled. These tasks do not supply public tests, and no arm gets hidden grader feedback. Aider retains its native prompts, output parser and format-reflection behavior. Its normal maximum of three reflections is retained, under the common overall budget ceiling. The integration restricts IO writes to the named deliverable, corresponding to the Tom evaluator's write permission. This is a specified Aider configuration, not a measurement of all Aider modes or its full repository workflow.

An authenticated native worker remains bound to loopback. A separate loopback evaluation proxy lets Aider use its ordinary OpenAI-compatible client path, but routes all actual inference to the same pinned local GGUF. There is no cloud-model fallback. The proxy enforces seed, temperature 0.2, top-p 0.95, top-k 64, thinking disabled, a 4,096-token shared context with 128 tokens reserved, 2,048 maximum output tokens per call, 12,288 total output tokens, 24 calls and 15 active minutes. It records supplied prompts and raw responses. Both inference and batch threads are two and GPU layers zero. Any proxy/context errors remain visible.

The Aider batch runs **after** the internal batch, on the same host with a freshly loaded copy of the same worker configuration. It is not interleaved; software installation and background workload can affect wall times. Do not use these trials for speed rankings. Exact artifact outcomes, seeds, budgets and prompts are the comparison of interest.

The Aider transport check used a fixed mock completion on a separate `probe.txt` task and passed. It checked connection and file-edit integration only; it is excluded from all capability percentages. The dependency download initially failed under restricted network access and succeeded through the permitted installation route. That setup failure is not a model failure.

Interpretation: this adds a named peer to the comparison, while the internal minimal loop remains the closer controller ablation because it shares Tom's tools and generic grammar. Aider supplies file contents automatically, whereas Tom decides/gets constrained to read them; this is an actual harness behavior difference. Differences cannot be attributed solely to model intelligence or a single controller component.

The suite is **not Aider Polyglot**. Aider's published benchmark has different exercises, languages and evaluation procedures; its leaderboard percentages must not be compared numerically to these eight local tasks. [Aider benchmark implementation](https://github.com/Aider-AI/aider/blob/main/benchmark/README.md), [Aider leaderboard and experiment records](https://aider.chat/docs/leaderboards/).

Reproduce after installing the pinned dependency set into `.state/capability-deps`, with no other active model:

```powershell
runtime/node.exe scripts/capability-aider-benchmark.mjs --transport-smoke
runtime/node.exe scripts/capability-aider-benchmark.mjs
```

Set `BENCH_PYTHON` to a compatible local Python interpreter if the development runtime path differs. Python is an evaluator dependency for Aider, not a new Tom product dependency.
