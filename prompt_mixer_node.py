# -*- coding: utf-8 -*-
from typing import Any, Dict, List

try:
    from server import PromptServer
    from aiohttp import web
except Exception:
    PromptServer = None
    web = None

from .node import (
    _as_bool,
    _escape_unescaped_parentheses,
    _format_prompt_weight,
    _parse_prompt_segments,
    _safe_parse_json_list,
    _safe_parse_json_weight_map,
    _unescape_comfy_parentheses,
)


_latest_prompt_mixer_input_by_node: Dict[str, str] = {}


def _normalize_mixer_weight(value: Any, fallback: float = 1.0) -> float:
    try:
        parsed = float(value)
    except Exception:
        return fallback
    if parsed != parsed:
        return fallback
    parsed = round(parsed * 100.0) / 100.0
    if parsed < 0:
        return 0.0
    if parsed > 20:
        return 20.0
    return parsed


def _normalize_mixer_tag(value: Any) -> str:
    return _unescape_comfy_parentheses(value).strip().lower()


def _parse_prompt_mixer_items(raw_prompt: Any) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    item_index: Dict[str, int] = {}

    for segment in _parse_prompt_segments(raw_prompt):
        segment_type = str(segment.get("type") or "plain")
        if segment_type == "weighted":
            raw_tags = segment.get("tags") or []
            base_weight = _normalize_mixer_weight(segment.get("weight"), 1.0)
        else:
            raw_tags = [segment.get("tag", "")]
            base_weight = 1.0

        for raw_tag in raw_tags:
            escaped_tag = _escape_unescaped_parentheses(str(raw_tag or "").strip())
            normalized_key = _normalize_mixer_tag(escaped_tag)
            if not normalized_key:
                continue

            existing_index = item_index.get(normalized_key)
            if existing_index is not None:
                existing = items[existing_index]
                if abs(float(existing.get("base_weight", 1.0)) - 1.0) <= 1e-9 and abs(base_weight - 1.0) > 1e-9:
                    existing["base_weight"] = base_weight
                continue

            item_index[normalized_key] = len(items)
            items.append({
                "tag": escaped_tag,
                "key": normalized_key,
                "base_weight": base_weight,
            })

    return items


def _apply_prompt_mixer_order(items: List[Dict[str, Any]], tag_order_json: Any) -> List[Dict[str, Any]]:
    if not items:
        return []

    ordered_keys: List[str] = []
    seen = set()
    for raw_tag in _safe_parse_json_list(tag_order_json, []):
        normalized_key = _normalize_mixer_tag(raw_tag)
        if not normalized_key or normalized_key in seen:
            continue
        seen.add(normalized_key)
        ordered_keys.append(normalized_key)

    if not ordered_keys:
        return list(items)

    item_lookup = {item["key"]: item for item in items}
    ordered_items: List[Dict[str, Any]] = []
    consumed = set()

    for key in ordered_keys:
        item = item_lookup.get(key)
        if item is None or key in consumed:
            continue
        consumed.add(key)
        ordered_items.append(item)

    for item in items:
        key = str(item.get("key") or "")
        if not key or key in consumed:
            continue
        consumed.add(key)
        ordered_items.append(item)

    return ordered_items


def _build_prompt_mixer_output(
    prompt: Any,
    selected_tags_json: Any,
    selected_tag_weights_json: Any,
    selection_initialized: Any,
    tag_order_json: Any,
) -> str:
    items = _apply_prompt_mixer_order(_parse_prompt_mixer_items(prompt), tag_order_json)
    if not items:
        return ""

    item_lookup = {item["key"]: item for item in items}
    initialized = _as_bool(selection_initialized, False)

    if initialized:
        selected_keys: List[str] = []
        selected_seen = set()
        for raw_tag in _safe_parse_json_list(selected_tags_json, []):
            normalized_key = _normalize_mixer_tag(raw_tag)
            if not normalized_key or normalized_key not in item_lookup or normalized_key in selected_seen:
                continue
            selected_seen.add(normalized_key)
            selected_keys.append(normalized_key)
    else:
        selected_keys = [item["key"] for item in items]

    override_weights: Dict[str, float] = {}
    for raw_tag, raw_weight in _safe_parse_json_weight_map(selected_tag_weights_json).items():
        normalized_key = _normalize_mixer_tag(raw_tag)
        item = item_lookup.get(normalized_key)
        if not item:
            continue
        effective_weight = _normalize_mixer_weight(raw_weight, float(item.get("base_weight", 1.0)))
        if abs(effective_weight - float(item.get("base_weight", 1.0))) > 1e-9:
            override_weights[normalized_key] = effective_weight

    selected_key_set = set(selected_keys)
    output_parts: List[str] = []
    for item in items:
        if item["key"] not in selected_key_set:
            continue
        effective_weight = override_weights.get(item["key"], float(item.get("base_weight", 1.0)))
        if abs(effective_weight - 1.0) > 1e-9:
            output_parts.append(f"({item['tag']}:{_format_prompt_weight(effective_weight)})")
        else:
            output_parts.append(item["tag"])

    return ", ".join(output_parts)


class DanbooruPromptMixerNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                # Use a pure STRING input port to keep the node compact.
                # Linked prompts can still be previewed from the frontend via Refresh.
                "prompt": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                }),
                "selected_tags_json": ("STRING", {"default": "[]", "multiline": True}),
                "selected_tag_weights_json": ("STRING", {"default": "{}", "multiline": True}),
                "tag_order_json": ("STRING", {"default": "[]", "multiline": True}),
                "selection_initialized": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("PROMPT",)
    FUNCTION = "mix_prompt"
    CATEGORY = "Danbooru Toolkit/Prompt"

    def mix_prompt(
        self,
        prompt="",
        selected_tags_json="[]",
        selected_tag_weights_json="{}",
        tag_order_json="[]",
        selection_initialized=False,
        unique_id=None,
    ):
        if unique_id is not None:
            _latest_prompt_mixer_input_by_node[str(unique_id)] = str(prompt or "")
        return (
            _build_prompt_mixer_output(
                prompt=prompt,
                selected_tags_json=selected_tags_json,
                selected_tag_weights_json=selected_tag_weights_json,
                selection_initialized=selection_initialized,
                tag_order_json=tag_order_json,
            ),
        )


NODE_CLASS_MAPPINGS = {
    "DanbooruPromptMixerNode": DanbooruPromptMixerNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruPromptMixerNode": "Toolkit Prompt Mixer",
}


if PromptServer is not None and web is not None:
    try:
        @PromptServer.instance.routes.get("/danbooru_prompt_mixer/latest")
        async def get_latest_prompt_mixer_input(request):
            node_id = str(request.query.get("node_id", "")).strip()
            prompt = _latest_prompt_mixer_input_by_node.get(node_id, "")
            return web.json_response({
                "status": "success",
                "node_id": node_id,
                "prompt": prompt,
            })
    except Exception:
        pass
