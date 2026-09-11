import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

folder, pdf, archive = [Path(p).resolve() for p in sys.argv[1:4]]
stats = json.loads((folder / 'statistics.json').read_text())
shutil.copy2(pdf, folder / pdf.name)
lock=[]
for line in (folder/'aider-dependencies.txt').read_text(encoding='utf-8-sig').splitlines():
    name,version=line.removesuffix('.dist-info').rsplit('-',1)
    lock.append(name.replace('_','-')+'=='+version)
(folder/'aider-requirements-lock.txt').write_text('\n'.join(sorted(lock))+'\n',encoding='utf-8')
readme=f'''# Tom E2B Q4 peer-review package

64 primary real-model trials, eight tasks, two seeds, four modes. Final scores use the corrected V2 fixture-module scorer. Eight additional filename diagnostics are reported separately. This package is prepared for inspection, not independently peer reviewed.

- [Four-page PDF]({pdf.name}) - shareable summary and application review.
- [Full report](REPORT.md) - all outcomes, failure ledger, paired comparisons and exclusions.
- [Marketing wording](MARKETING.md) - bounded statements supported by this run.
- [Statistics](statistics.json) and [trial rows](trials.csv).
- [Scorer correction](capability-scoring-correction.md) - three Aider outcomes corrected; originals retained.
- [Filename diagnostic](EXTENSION-DIAGNOSTIC.md) - outside the primary denominator.
- Methodology files cover internal modes, the named peer and diagnostic.

Correct artifacts in the primary suite: Tom {stats['aggregate']['tom']['passed']}/16; minimal loop {stats['aggregate']['minimal']['passed']}/16; Aider {stats['aggregate']['aider']['passed']}/16; direct contents {stats['aggregate']['direct']['passed']}/16. Direct contents are saved by the evaluator, not by model-operated file tools.

## Reproduce

Start with a complete compatible Tom installation/check-out, including the pinned native runtime, DLLs and GGUF at the paths in config/runtime.json. Overlay the frozen controller/evaluator sources from source-snapshot. The model and runtime binaries are identified by hashes; they are not redistributed here. Use Node 24.19.0 and compatible Windows x64. Aider used Python 3.12; its exact version is in its native result records.

Install the peer dependency versions into .state/capability-deps using aider-requirements-lock.txt. This is an evaluator dependency, not a Tom product requirement. Set BENCH_PYTHON if the local Python path differs from the development path.

With the interactive model unloaded and no active user task, run the grader checks, internal comparison and Aider comparison sequentially:

    runtime/node.exe scripts/capability-check-grader.mjs
    runtime/node.exe scripts/capability-check-grader-v2.mjs
    runtime/node.exe scripts/capability-benchmark.mjs
    runtime/node.exe scripts/capability-aider-benchmark.mjs --transport-smoke
    runtime/node.exe scripts/capability-aider-benchmark.mjs

The transport smoke uses a mock response and is not a model result. Preserve original generation records and apply capability-report.mjs to completed internal and peer results to obtain corrected V2 scores. capability-verify-results.mjs verifies original outputs/checks; capability-verify-report.mjs verifies corrected score arithmetic.

The diagnostic uses capability-js-diagnostic.mjs and the same corrected scorer. Its exact source inventory is retained separately in diagnostic-source-snapshot. The exported source snapshots include controller code and evaluator helpers; UI and full binary installation assets are not part of these snapshots.

## Integrity and limitations

FILES-SHA256.json hashes all other package files. The ZIP was reopened and every listed hash verified. Checksums detect changes; they are not a signature or independent certification.

Original V1 and corrected result records are both included. tom-events.json contains synthetic input/event evidence with workspace paths redacted and token IDs omitted. Full local SQLite journals remain outside the package. Worker-memory samples cover only part of the internal run; the sampler ended when its worker exited. They exclude the supervisor, browser and OS and do not qualify low-RAM machines.

The task suite is small and developer-authored. No standard SWE-bench or Polyglot score, broad customer reliability estimate, general harness uplift, or physical eighth-generation/RAM qualification is established. Refer to the full report before using any number publicly.
'''
(folder/'README.md').write_text(readme,encoding='utf-8')
files=sorted(p for p in folder.rglob('*') if p.is_file() and p.name!='FILES-SHA256.json')
manifest=[{'path':p.relative_to(folder).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
(folder/'FILES-SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
archive.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(folder.rglob('*')):
        if p.is_file(): z.write(p,p.relative_to(folder).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for item in manifest: assert hashlib.sha256(z.read(item['path'])).hexdigest()==item['sha256']
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(checksum+'  '+archive.name+'\n')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(manifest)+1,'sha256':checksum,'verified':True},indent=2))
