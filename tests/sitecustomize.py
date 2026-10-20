"""ComfyUI stubs for the toolkit tests, installed at interpreter start.

The package ``__init__`` imports every node module, and those import ComfyUI's runtime, so the suite
only collects when ``server`` / ``comfy`` / ``folder_paths`` are replaced before pytest touches the
package. ``site`` imports this module automatically when the tests folder is on PYTHONPATH, which is
how ``pytest.ini`` documents running the suite.
"""
import sys
import types
from pathlib import Path

import torch

PACKAGE_DIR = Path(__file__).resolve().parents[1]
TAGGER_MODEL_DIRS = []


def _stub(name, **attributes):
    module = types.ModuleType(name)
    for key, value in attributes.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


class _Routes:
    def get(self, *args, **kwargs):
        return lambda handler: handler

    def post(self, *args, **kwargs):
        return lambda handler: handler


class _PromptServer:
    instance = types.SimpleNamespace(routes=_Routes())


class _ProgressBar:
    def __init__(self, total):
        self.total = total

    def update(self, value):
        pass


def install_comfyui_stubs():
    if str(PACKAGE_DIR) not in sys.path:
        sys.path.insert(0, str(PACKAGE_DIR))

    _stub("server", PromptServer=_PromptServer)
    _stub(
        "folder_paths",
        models_dir=str(PACKAGE_DIR / "_test_models"),
        add_model_folder_path=lambda *args, **kwargs: None,
        get_folder_paths=lambda key: list(TAGGER_MODEL_DIRS),
    )
    comfy = _stub("comfy")
    _stub("comfy.utils", ProgressBar=_ProgressBar)
    _stub(
        "comfy.model_management",
        get_torch_device=lambda: torch.device("cpu"),
        soft_empty_cache=lambda *args, **kwargs: None,
        throw_exception_if_processing_interrupted=lambda: None,
    )
    comfy.utils = sys.modules["comfy.utils"]
    comfy.model_management = sys.modules["comfy.model_management"]


install_comfyui_stubs()
