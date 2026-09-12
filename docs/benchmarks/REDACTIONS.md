# Public evidence redactions

Machine-local workspace and Python executable prefixes in synthetic benchmark logs and historical source snapshots were replaced with `<workspace>` and `<python>` on September 12, 2026. Nested, JSON-escaped paths are included. Prompts, model answers, task outcomes and measured values were not changed.

The per-file SHA-256 manifest describes these public, redacted copies. Source snapshots containing `<python>` need `BENCH_PYTHON` set to a real Python executable when reproducing a trial. Original evidence is retained privately. Earlier Git commits may still contain the generic development-machine paths; they are not account credentials or personal chat records.
