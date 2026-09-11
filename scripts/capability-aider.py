"""Aider 0.86.2 programmatic whole-file editing; local model and explicit file scope."""
import json
import os
import sys
from pathlib import Path

spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
root = Path(spec["dir"]).resolve()
destination = (root / spec["output"]).resolve()
os.chdir(root)
os.environ["OPENAI_API_BASE"] = spec["base"]
os.environ["OPENAI_API_KEY"] = "local-benchmark-only"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
os.environ["AIDER_ANALYTICS"] = "false"

from aider import __version__
from aider.coders import Coder
from aider.io import InputOutput
from aider.models import Model, model_info_manager
from aider.llm import litellm

name = "openai/tom-e2b"
metadata = {"max_input_tokens": 4096, "max_output_tokens": 2048, "max_tokens": 4096,
            "input_cost_per_token": 0, "output_cost_per_token": 0,
            "litellm_provider": "openai", "mode": "chat"}
model_info_manager.local_model_metadata[name] = metadata
litellm.register_model({name: metadata})
model = Model(name, weak_model=False, editor_model=False)
model.weak_model = model
model.editor_model = model
model.extra_params = {"max_tokens": 2048, "temperature": 0.2}

class ScopedIO(InputOutput):
    def confirm_ask(self, question, *args, subject=None, **kwargs):
        if question in {"Create new file?", "Allow edits to file that has not been added to the chat?"}:
            if not subject or Path(subject).resolve() != destination:
                return False
        return super().confirm_ask(question, *args, subject=subject, **kwargs)

    def write_text(self, filename, content, *args, **kwargs):
        if Path(filename).resolve() != destination:
            raise PermissionError("EVALUATION_PERMISSION: only the named deliverable may be written")
        return super().write_text(filename, content, *args, **kwargs)

class NoAnalytics:
    def event(self, *args, **kwargs):
        pass

io = ScopedIO(yes=True, pretty=False, fancy_input=False, line_endings="lf",
              chat_history_file=None, input_history_file=None, root=str(root))
coder = Coder.create(main_model=model, edit_format="whole", io=io,
                     fnames=[str(destination)],
                     read_only_fnames=[str(root / n) for n in spec["files"]],
                     use_git=False, auto_commits=False, dirty_commits=False,
                     map_tokens=0, auto_lint=False, auto_test=False,
                     stream=False, suggest_shell_commands=False, detect_urls=False,
                     analytics=NoAnalytics())
answer = coder.run(with_message=spec["request"], preproc=False)
Path(spec["resultFile"]).write_text(json.dumps({"version": __version__, "python": sys.version, "answer": answer,
    "messages": coder.done_messages + coder.cur_messages,
    "malformed": coder.num_malformed_responses,
    "exhaustedContext": coder.num_exhausted_context_windows,
    "reflections": coder.num_reflections,
    "filesEdited": sorted(coder.aider_edited_files or [])}, indent=2), encoding="utf-8")
