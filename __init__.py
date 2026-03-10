"""
@author: RafealaSilva
@title: Danbooru Tag Toolkit
@nickname: Danbooru Toolkit
@description: A ComfyUI node toolkit for Danbooru tag selection, preset prompt selection, and lightweight post gallery browsing.
"""
from .node import NODE_CLASS_MAPPINGS as BASE_NODE_CLASS_MAPPINGS
from .node import NODE_DISPLAY_NAME_MAPPINGS as BASE_NODE_DISPLAY_NAME_MAPPINGS
from .prompt_selector_node import NODE_CLASS_MAPPINGS as PROMPT_SELECTOR_NODE_CLASS_MAPPINGS
from .prompt_selector_node import NODE_DISPLAY_NAME_MAPPINGS as PROMPT_SELECTOR_NODE_DISPLAY_NAME_MAPPINGS
from .prompt_mixer_node import NODE_CLASS_MAPPINGS as PROMPT_MIXER_NODE_CLASS_MAPPINGS
from .prompt_mixer_node import NODE_DISPLAY_NAME_MAPPINGS as PROMPT_MIXER_NODE_DISPLAY_NAME_MAPPINGS

NODE_CLASS_MAPPINGS = {
    **BASE_NODE_CLASS_MAPPINGS,
    **PROMPT_SELECTOR_NODE_CLASS_MAPPINGS,
    **PROMPT_MIXER_NODE_CLASS_MAPPINGS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **BASE_NODE_DISPLAY_NAME_MAPPINGS,
    **PROMPT_SELECTOR_NODE_DISPLAY_NAME_MAPPINGS,
    **PROMPT_MIXER_NODE_DISPLAY_NAME_MAPPINGS,
}

WEB_DIRECTORY = "./js"

def __init__():
    pass

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
