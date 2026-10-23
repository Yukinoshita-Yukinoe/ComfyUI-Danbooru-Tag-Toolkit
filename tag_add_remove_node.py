"""Add missing tags to a prompt and drop unwanted ones, leaving the rest untouched.

Tag identity follows the rest of the toolkit: case-insensitive, underscores equal to spaces, an escaped
Danbooru parenthesis is the same as a bare one, and a weighted group counts as its inner tags.
"""

from typing import List, Set

from .node import (
    _build_weighted_prompt_part,
    _escape_unescaped_parentheses,
    _join_tag_text,
    _parse_weighted_prompt_part,
    _split_top_level_prompt_parts,
    _unescape_comfy_parentheses,
)


def _paren_group_closes_at_end(value: str) -> bool:
    """True when the leading "(" is closed by the last character, ignoring escaped parentheses."""
    depth = 0
    index = 0
    while index < len(value):
        char = value[index]
        if char == "\\":
            index += 2
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index == len(value) - 1
        index += 1
    return False


def _strip_group_wrapper(text: str) -> str:
    # "(tag)" and "((tag))" are ComfyUI weights around the tag, not part of its name. Escaped
    # parentheses are left alone so a real tag such as "utdr_\(toby_fox\)" keeps its shape.
    value = str(text or "").strip()
    while len(value) > 2 and value.startswith("(") and _paren_group_closes_at_end(value):
        value = value[1:-1].strip()
    return value


def _tag_key(text) -> str:
    value = _unescape_comfy_parentheses(_strip_group_wrapper(text))
    return " ".join(str(value or "").replace("_", " ").split()).lower()


def _entry_keys(text) -> List[str]:
    """Keys an input tag or a prompt part stands for; a weighted group stands for its inner tags."""
    weighted = _parse_weighted_prompt_part(text)
    entries = weighted["tags"] if weighted else [text]
    keys: List[str] = []
    for entry in entries:
        key = _tag_key(entry)
        if key and key not in keys:
            keys.append(key)
    return keys


def _input_keys(raw_value: str) -> Set[str]:
    keys: Set[str] = set()
    for part in _split_top_level_prompt_parts(raw_value):
        keys.update(_entry_keys(part))
    return keys


def _drop_removed(parts: List[str], remove_keys: Set[str], removed: List[str]) -> List[str]:
    kept: List[str] = []
    for part in parts:
        weighted = _parse_weighted_prompt_part(part)
        if not weighted:
            if _tag_key(part) in remove_keys:
                removed.append(str(part).strip())
            else:
                kept.append(part)
            continue

        remaining = [tag for tag in weighted["tags"] if _tag_key(tag) not in remove_keys]
        removed.extend(tag for tag in weighted["tags"] if _tag_key(tag) in remove_keys)
        if not remaining:
            continue
        if len(remaining) == len(weighted["tags"]):
            kept.append(part)
        else:
            kept.append(_build_weighted_prompt_part(remaining, weighted["weight"]))
    return kept


class DanbooruTagAddRemoveNode:
    DESCRIPTION = (
        "Adds tags that are missing from a prompt and removes the ones you list, leaving everything "
        "else as it was. New tags go at the end unless add_to_front is on."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "1girl, solo, long hair",
                }),
                "add_tags": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "要补充的 tag，逗号分隔（已有则跳过）",
                }),
                "remove_tags": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "要移除的 tag，逗号分隔（没有则原样通过）",
                }),
                "add_to_front": ("BOOLEAN", {"default": False, "label": "新增 tag 放到开头"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "added_tags", "removed_tags")
    FUNCTION = "edit_tags"
    CATEGORY = "Danbooru Toolkit/Filter"

    def edit_tags(self, prompt="", add_tags="", remove_tags="", add_to_front=False):
        text = str(prompt or "")
        parts = _split_top_level_prompt_parts(text)
        remove_keys = _input_keys(remove_tags)

        removed: List[str] = []
        kept = _drop_removed(parts, remove_keys, removed) if remove_keys else list(parts)

        # Presence is judged on the incoming prompt, as the two boxes describe edits to what arrived.
        present_keys = set()
        for part in parts:
            present_keys.update(_entry_keys(part))

        additions: List[str] = []
        added_keys: Set[str] = set()
        for entry in _split_top_level_prompt_parts(add_tags):
            keys = _entry_keys(entry)
            if not keys or any(key in present_keys for key in keys):
                continue
            # Remove wins when the same tag is listed in both boxes.
            if any(key in remove_keys for key in keys):
                continue
            if any(key in added_keys for key in keys):
                continue
            added_keys.update(keys)
            additions.append(_escape_unescaped_parentheses(str(entry).strip()))

        if not additions and not removed:
            return (text, "", "")

        ordered = additions + kept if add_to_front else kept + additions
        return (
            _join_tag_text(ordered),
            _join_tag_text(additions),
            _join_tag_text(removed),
        )


NODE_CLASS_MAPPINGS = {
    "DanbooruTagAddRemoveNode": DanbooruTagAddRemoveNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruTagAddRemoveNode": "Danbooru Tag Toolkit - Tag Add / Remove",
}
