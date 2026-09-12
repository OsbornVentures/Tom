# Tom downloads

Cloudflare Worker serving an allowlisted full EXE from a private R2 bucket, with D1 aggregate counters. The source contains no account tokens. Upload credentials remain local; the GitHub statistics token is an encrypted Worker secret limited to Tom and read-only Administration access.

Bindings: `RELEASES` (R2), `STATS` (D1), `GITHUB_STATS_TOKEN` (secret). Initialize D1 with `schema.sql`. Deploy `worker.mjs` and `site.mjs` as JavaScript modules and attach the custom domain `tom.osbornventures.com`. Configure the scheduled handler every six hours (`0 */6 * * *`). Runtime request logging is disabled. The download counter never persists IP addresses or visitor identifiers.

Upload the final EXE under `releases/<version>/<filename>` with custom metadata `sha256` matching the release digest. Update `RELEASE` only after rebuilding and verifying packages. The Worker checks size and metadata before serving it, streams bytes without buffering the installer, supports resume ranges and includes the checksum in the response headers.

Publish only after a full HTTPS download matches the local SHA-256. Keep the network installer available on GitHub. Do not upload environment files, private build directories or state.

`/stats.json` exposes definitions and refresh time. Clone daily buckets use upserts so overlapping 14-day GitHub windows do not inflate totals; tracking cannot recover older events. Initial download requests are counted separately from continuations, HEAD and prefetch. They are not completed installs or unique people. The download continues even if counter storage is unavailable. GitHub refresh failures preserve the previous snapshot and show it as stale after seven hours.

Run `node --test cloudflare/worker.test.mjs` for HTTP-range, download integrity, counting and rolling-window checks.

Statistics requests also initialize a new deployment or recover an overdue refresh. An atomic D1 lock limits attempts to once per ten minutes; successful snapshots remain fresh for six hours. Keep the statistics secret valid: an expired token preserves the previous snapshot and marks it stale instead of presenting zeros as current data.
