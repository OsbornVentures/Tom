# Tom downloads

Cloudflare Worker serving an allowlisted full EXE from a private R2 bucket, with D1 aggregate counters. The source contains no account tokens. Upload credentials remain local; the GitHub statistics token is an encrypted Worker secret limited to Tom and read-only Administration access.

Bindings: `RELEASES` (R2), `STATS` (D1), `GITHUB_STATS_TOKEN` (secret). Initialize D1 with `schema.sql`. Deploy `worker.mjs` and `site.mjs` as JavaScript modules and attach the custom domain `tom.osbornventures.com`. Configure the scheduled handler every six hours (`0 */6 * * *`). Runtime request logging is disabled. The download counter never persists IP addresses or visitor identifiers.

Upload the final EXE under `releases/<version>/<filename>` with custom metadata `sha256` matching the release digest. Update `RELEASE` only after rebuilding and verifying packages. The Worker checks size and metadata before serving it, streams bytes without buffering the installer, supports resume ranges and includes the checksum in the response headers.

Publish only after a full HTTPS download matches the local SHA-256. Keep the network installer available on GitHub. Do not upload environment files, private build directories or state.

`/stats.json` and the site expose exactly two aggregate metrics: cumulative `downloads` and `clones`. Edition breakdowns remain in private D1 tables and snapshots. Badges are `/badges/downloads.svg` and `/badges/clones.svg`; legacy edition badge URLs redirect to the combined badge.

Clone daily buckets use upserts so overlapping 14-day GitHub windows do not inflate totals. Buckets are retained indefinitely, including when they leave the API window; tracking cannot recover unavailable older events. GitHub installer counts are retained per asset ID using their highest observed count, so removed releases do not erase earlier downloads and repeated polls do not double-count them.

Hosted full downloads increment only after the stream reaches EOF with the exact release byte count. Partial, cancelled or truncated transfers, HEAD and prefetch do not increment that counter. The server cannot prove a file was saved to disk, and independent resumed ranges cannot be matched without visitor identifiers; those transfers are conservatively omitted. GitHub-hosted installers use GitHub's asset counts, whose completion semantics we do not control. Neither metric measures installations or unique people. Old private request-start counts are not converted into completed downloads. The download continues if counter storage fails. GitHub refresh failures preserve the previous public snapshot and show it as stale after seven hours.

The hosted transfer uses Cloudflare's native [FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#fixedlengthstream). This preserves the response length and avoids per-chunk JavaScript execution for multi-gigabyte installers. Completion counting follows the native pipe promise; a failed pipe never increments the completed counter.

Run `node --test cloudflare/worker.test.mjs` for HTTP-range, download integrity, counting and rolling-window checks.

Statistics requests also initialize a new deployment or recover an overdue refresh. An atomic D1 lock limits attempts to once per ten minutes; successful snapshots remain fresh for six hours. Keep the statistics secret valid: an expired token preserves the previous snapshot and marks it stale instead of presenting zeros as current data.
