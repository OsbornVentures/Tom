# Development changes

## 0.5.2 beta

- Compact avatar/name/context/actions header, nine ASCII activity states, richer ready expressions and merging compaction lines.
- Truthful startup gate, preferred-name setup, local file opening, expanded offline AI FAQ, stack credits and Apache 2.0 source license.
- Manual GitHub update checks and refreshed Offline/Network installers that preserve existing user data.
- Microsoft Visual C++ is a separately installed prerequisite; development runtime DLLs are excluded.
- See [release notes](docs/RELEASE-0.5.2.md) and [measured results](docs/benchmarks/0.5.2.md).

## 0.5.1 development

- Single-file Offline/Network setup, repair and uninstall; performance recovery and a revised action harness.
- Preserved public development trials document both improvements and remaining failures.

## 0.5.0

- Conversational current-fact questions now require an actual browser attempt. A bare follow-up such as “search the web for it” resolves its subject from earlier user messages, not model answers or search results.
- Required research queries are bound to the original subject during decoding. Relevance distinguishes identifying terms from broad topic words and checks region codes/product IDs; wrong-location pages cannot pass merely on “weather” and “today.” This remains a conservative lexical check, not full semantic verification.
- Search failures record provider attempts and rejected subjects. A visible handoff opens the original query in the user's normal browser; it does not bypass verification challenges or copy browser cookies. Blocked tasks can resume through the API.
- A new versioned emerald/cyan favicon, red error state, nine-shape Help guide, mobile Help access, and plain-language context/memory/model-limit explanations.
- Supporting documentation lookups remain part of file-building tasks, rather than replacing their deliverable requirements with a research-only task.
- Windows CI now uses absolute compiler paths and current runner actions. The baseline source is uploaded to the private repository; release signing and hardware qualification are still outstanding.

## 0.4.0

- Token-level GBNF dispatch for shell/write, with an enforcement probe at model load. Incomplete or malformed actions cannot execute.
- Search/read prerequisites, observed URL choices, bounded provider/query fallbacks, article links and relevance screening. HTTP errors and challenges cannot qualify as research evidence.
- Requested source reads, observed file hashes, exact-copy revisions and current-request evidence checks before completion. File and research replies are published after verification.
- Generated local-page checks for disabled controls, checkbox/reset behavior, browser errors and narrow layout. These checks do not prove arbitrary page functionality or every requested fact.
- Visible query/action/result descriptions, blocked states and nested diagnostics. Private generated reasoning is not exposed as an action log.
- Deterministic regression tests, a production-model benchmark runner, preserved exploratory failures, and documented proposed release gates.
- Versioned build checks and offline development packaging. Windows x64 remains the current package target; low-memory machines and other architectures remain unqualified.

This is an unsigned development build. Consult the benchmark report before interpreting a successful build or first-run model check as task-quality qualification.
