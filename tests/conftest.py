"""Fixture shared by the toolkit tests.

The ComfyUI stubs themselves live in ``sitecustomize.py`` next to this file: they have to be installed
while the interpreter starts, because pytest imports the toolkit package (which imports ComfyUI's
runtime) before it imports any conftest.

Run the suite with the tests folder on PYTHONPATH::

    $env:PYTHONPATH="$PWD/tests"; pytest tests     # PowerShell, from the repo root
    PYTHONPATH=tests pytest tests                  # bash
"""
import pytest

from sitecustomize import TAGGER_MODEL_DIRS


@pytest.fixture
def tagger_model_dirs():
    TAGGER_MODEL_DIRS.clear()
    yield TAGGER_MODEL_DIRS
    TAGGER_MODEL_DIRS.clear()
