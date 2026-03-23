import pandas as pd
from collections import defaultdict
import os
import ast
import hashlib
import json
import pickle
import re
import io
import time
import urllib.parse
import urllib.request
import torch
import comfy
import numpy as np
from PIL import Image
from typing import Dict, List, Any, Iterable

try:
    from server import PromptServer
    from aiohttp import web
except Exception:
    PromptServer = None
    web = None

_tag_cache = {}
_latest_tag_bundle_by_node: Dict[str, Dict[str, Any]] = {}
_gallery_post_cache: Dict[str, Dict[str, Any]] = {}
_gallery_image_cache: Dict[str, Dict[str, Any]] = {}
_gallery_autocomplete_cache: Dict[str, Dict[str, Any]] = {}

_DANBOORU_BASE_URL = "https://danbooru.donmai.us"
_GALLERY_POST_CACHE_TTL = 120
_GALLERY_POST_CACHE_LIMIT = 128
_GALLERY_IMAGE_CACHE_TTL = 180
_GALLERY_IMAGE_CACHE_LIMIT = 24
# 0 = unlimited (multi-select friendly)
_GALLERY_OUTPUT_SELECTION_LIMIT = 0
_GALLERY_AUTOCOMPLETE_CACHE_TTL = 300
_GALLERY_AUTOCOMPLETE_CACHE_LIMIT = 256
SEPARATOR_OPTIONS = ["comma", "newline", "space", True, False, "True", "False", "true", "false"]
_SORTER_PRESET_DIR_NAME = "sorter_presets"
_TAG_DATABASE_CACHE_DIR_NAME = ".tag_db_cache"
_TAG_DATABASE_CACHE_VERSION = 1
_TAG_DATABASE_REQUIRED_COLUMNS = (
    "english",
    "category",
    "subcategory",
    "category_key",
    "subcategory_key",
    "category_zh",
    "category_en",
    "subcategory_zh",
    "subcategory_en",
)
_OUTPUT_CATEGORY_DEFINITIONS = (
    {"key": "artist_terms", "zh": "画师词", "en": "Artist"},
    {"key": "background_terms", "zh": "背景词", "en": "Background"},
    {"key": "subject_terms", "zh": "人物对象词", "en": "Subject"},
    {"key": "character_feature_terms", "zh": "角色特征词", "en": "Character Features"},
    {"key": "facial_feature_terms", "zh": "角色五官词", "en": "Facial Features"},
    {"key": "body_part_terms", "zh": "角色部位词", "en": "Body Parts"},
    {"key": "sexual_feature_terms", "zh": "性征部位词", "en": "Sexual Features"},
    {"key": "outfit_terms", "zh": "服饰词", "en": "Outfit"},
    {"key": "action_terms", "zh": "动作词", "en": "Actions"},
    {"key": "expression_terms", "zh": "角色表情词", "en": "Expressions"},
    {"key": "camera_terms", "zh": "镜头词", "en": "Camera"},
    {"key": "uncategorized_terms", "zh": "未归类词", "en": "Uncategorized"},
)
_OUTPUT_CATEGORY_LEGACY_EN_ALIASES_BY_KEY = {
    "artist_terms": ("Artist Terms",),
    "background_terms": ("Background Terms",),
    "subject_terms": ("Subject Terms",),
    "character_feature_terms": ("Character Feature Terms",),
    "facial_feature_terms": ("Facial Feature Terms",),
    "body_part_terms": ("Body Part Terms",),
    "sexual_feature_terms": ("Sexual Feature Terms",),
    "outfit_terms": ("Outfit Terms",),
    "action_terms": ("Action Terms",),
    "expression_terms": ("Expression Terms",),
    "camera_terms": ("Camera Terms",),
    "uncategorized_terms": ("Uncategorized Terms",),
}
_OUTPUT_CATEGORY_LABELS_BY_KEY = {
    str(entry["key"]): {
        "zh": str(entry["zh"]),
        "en": str(entry["en"]),
    }
    for entry in _OUTPUT_CATEGORY_DEFINITIONS
}
_OUTPUT_CATEGORY_ALIAS_TO_KEY = {}
for _entry in _OUTPUT_CATEGORY_DEFINITIONS:
    _key = str(_entry["key"]).strip()
    _legacy_aliases = _OUTPUT_CATEGORY_LEGACY_EN_ALIASES_BY_KEY.get(_key, ())
    for _alias in {_entry["key"], _entry["zh"], _entry["en"], *_legacy_aliases}:
        _alias_text = str(_alias or "").strip().lower()
        if _alias_text and _alias_text not in _OUTPUT_CATEGORY_ALIAS_TO_KEY:
            _OUTPUT_CATEGORY_ALIAS_TO_KEY[_alias_text] = _key


def load_defaults_from_json():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(current_dir, "defaults_config.json")

    fallback_mapping = "{}"
    fallback_order = "[]"

    if not os.path.exists(config_path):
        print(f"[DanbooruTagToolkit] Warning: defaults config not found, using empty defaults: {config_path}")
        return fallback_mapping, fallback_order

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        order_list = data.get("order", [])
        default_order_text = json.dumps(order_list, ensure_ascii=False)

        mapping_list = data.get("mapping", [])
        mapping_lines = []

        for i in mapping_list:
            if len(i) >= 3:
                cat, sub, target = i[0], i[1], i[2]
                # 复刻PythonDict的字符串行
                line = f'    ("{cat}", "{sub}"): "{target}"'  # 加个tab
                mapping_lines.append(line)

        # 搞半天要自己拼.jpg
        default_mapping_text = "{\n" + ",\n".join(mapping_lines) + "\n}"

        return default_mapping_text, default_order_text

    except Exception as e:
        print(f"[DanbooruTagToolkit] Failed to read defaults config: {e}")
        return fallback_mapping, fallback_order


# 节点加载时先运行一次初始化默认值
DEFAULT_MAPPING_TEXT, DEFAULT_ORDER_TEXT = load_defaults_from_json()

CATEGORY_MAPPING_PLACEHOLDER = (
    "示例1（精确元组）:\n"
    '{("人物","对象"): "人物对象词"}\n\n'
    "示例1b（英文短名称也可）:\n"
    '{("人物","对象"): "Subject"}\n\n'
    "示例2（仅大类）:\n"
    '{"人物": "人物对象词"}\n\n'
    "示例3（大类通配）:\n"
    '{("服饰","*"): "服饰词"}\n\n'
    "目标分类可填：中文 / 英文短名称 / 内部key；\n"
    "例如：人物对象词 / Subject / subject_terms\n"
    "可混合使用，优先级: (大类,子类) > 大类 > (大类,*)"
)

CATEGORY_ORDER_PLACEHOLDER = (
    "支持三种写法:\n"
    '1) JSON: ["背景词","人物对象词","未归类词"]\n'
    '1b) JSON(英文): ["Background","Subject","Uncategorized"]\n'
    "2) Python: ['背景词','人物对象词','未归类词']\n"
    "3) 每行一个分类:\n"
    "背景词\n"
    "人物对象词\n"
    "未归类词\n\n"
    "同样支持：中文 / 英文短名称 / 内部key"
)


def _normalize_lookup_text(raw_value: Any) -> str:
    return str(raw_value or "").strip().lower()


def _resolve_output_category_key(raw_value: Any) -> str:
    text = str(raw_value or "").strip()
    if not text:
        return ""
    normalized = _normalize_lookup_text(text)
    return _OUTPUT_CATEGORY_ALIAS_TO_KEY.get(normalized, text)


def _build_output_category_labels(raw_values: Iterable[Any]) -> Dict[str, Dict[str, str]]:
    labels: Dict[str, Dict[str, str]] = {}

    for raw_value in raw_values:
        text = str(raw_value or "").strip()
        if not text:
            continue
        key = _resolve_output_category_key(text)
        builtin = _OUTPUT_CATEGORY_LABELS_BY_KEY.get(key)
        if builtin and text == key:
            candidate = {"zh": str(builtin["zh"]), "en": str(builtin["en"])}
        else:
            candidate = {"zh": text, "en": text}

        if key not in labels:
            labels[key] = candidate
            continue

        current = labels[key]
        if builtin and text != key and current == {"zh": str(builtin["zh"]), "en": str(builtin["en"])}:
            labels[key] = candidate
    return labels


def _get_output_category_label(
    category_key: Any,
    labels: Dict[str, Dict[str, str]] | None = None,
    lang: str = "zh",
) -> str:
    key = str(category_key or "").strip()
    if not key:
        return ""
    language = "zh" if str(lang or "").strip().lower() == "zh" else "en"
    source = labels or _OUTPUT_CATEGORY_LABELS_BY_KEY
    item = source.get(key) or {}
    text = str(item.get(language) or item.get("zh") or item.get("en") or key).strip()
    return text or key


def _normalize_output_category_labels_map(
    labels: Dict[str, Dict[str, str]] | None,
) -> Dict[str, Dict[str, str]]:
    normalized: Dict[str, Dict[str, str]] = {}
    for raw_key, raw_value in (labels or {}).items():
        key = _resolve_output_category_key(raw_key)
        if not key:
            continue
        if isinstance(raw_value, dict):
            zh = str(raw_value.get("zh") or "").strip()
            en = str(raw_value.get("en") or "").strip()
        else:
            zh = str(raw_value or "").strip()
            en = zh
        builtin = _OUTPUT_CATEGORY_LABELS_BY_KEY.get(key, {})
        normalized[key] = {
            "zh": zh or str(builtin.get("zh") or key),
            "en": en or str(builtin.get("en") or zh or key),
        }
    for builtin_key, builtin_value in _OUTPUT_CATEGORY_LABELS_BY_KEY.items():
        normalized.setdefault(builtin_key, {"zh": builtin_value["zh"], "en": builtin_value["en"]})
    return normalized


def _build_source_alias_map(*values: Any) -> Dict[str, str]:
    alias_map: Dict[str, str] = {}
    normalized_values = [str(value or "").strip() for value in values if str(value or "").strip()]
    canonical_key = normalized_values[0] if normalized_values else ""
    if not canonical_key:
        return alias_map
    for value in normalized_values:
        alias = _normalize_lookup_text(value)
        if alias and alias not in alias_map:
            alias_map[alias] = canonical_key
    return alias_map


def _remap_category_keys_by_output_aliases(raw_mapping: Dict[str, List[str]]) -> Dict[str, List[str]]:
    remapped: Dict[str, List[str]] = {}
    for raw_category, tags in (raw_mapping or {}).items():
        category_key = _resolve_output_category_key(raw_category)
        if not category_key:
            continue
        existing = list(remapped.get(category_key, []))
        if isinstance(tags, list):
            next_tags = [str(tag).strip() for tag in tags if str(tag).strip()]
        else:
            next_tags = _parse_tag_string(str(tags))
        remapped[category_key] = _dedupe_string_list(existing + next_tags, unescape_parentheses=True)
    return remapped


def _build_output_category_lookup(bundle: Dict[str, Any]) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for raw_category in (bundle or {}).keys():
        category = str(raw_category or "").strip()
        if not category:
            continue
        resolved_key = _resolve_output_category_key(category)
        aliases = {
            category,
            resolved_key,
            _get_output_category_label(resolved_key, None, "zh"),
            _get_output_category_label(resolved_key, None, "en"),
        }
        for alias in aliases:
            normalized = _normalize_lookup_text(alias)
            if normalized and normalized not in lookup:
                lookup[normalized] = category
    return lookup


def _parse_tag_string(tag_string: str) -> List[str]:
    """
    将 "tag1, tag2, " 这类字符串解析为 tag 列表。
    """
    if not isinstance(tag_string, str):
        return []
    return [t.strip() for t in tag_string.split(',') if t.strip()]


def _normalize_bundle_for_ui(tag_bundle: Dict[str, Any]) -> Dict[str, List[str]]:
    """
    统一将 TAG_BUNDLE 转成 {category: [tag1, tag2]} 结构，供前端可视化使用。
    """
    normalized: Dict[str, List[str]] = {}
    if not isinstance(tag_bundle, dict):
        return normalized

    for category, raw_tags in tag_bundle.items():
        category_key = _resolve_output_category_key(category)
        if not category_key:
            continue
        if isinstance(raw_tags, list):
            tags = [str(t).strip() for t in raw_tags if str(t).strip()]
        else:
            tags = _parse_tag_string(str(raw_tags))
        existing = list(normalized.get(category_key, []))
        normalized[category_key] = _dedupe_string_list(existing + tags, unescape_parentheses=True)
    return normalized


def _safe_parse_json_list(raw_value: Any, fallback: List[str] = None) -> List[str]:
    if fallback is None:
        fallback = []
    if isinstance(raw_value, list):
        return _dedupe_string_list(raw_value)
    if not isinstance(raw_value, str):
        return fallback
    text = raw_value.strip()
    if not text:
        return fallback
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return _dedupe_string_list(data)
    except Exception:
        pass
    return fallback


def _safe_parse_json_weight_map(raw_value: Any) -> Dict[str, float]:
    if isinstance(raw_value, dict):
        data = raw_value
    elif isinstance(raw_value, str):
        text = raw_value.strip()
        if not text:
            return {}
        try:
            data = json.loads(text)
        except Exception:
            return {}
    else:
        return {}

    if not isinstance(data, dict):
        return {}

    result: Dict[str, float] = {}
    for raw_key, raw_weight in data.items():
        key = str(raw_key or '').strip()
        if not key:
            continue
        try:
            weight = round(float(raw_weight), 2)
        except (TypeError, ValueError):
            continue
        result[key] = max(0.0, min(20.0, weight))
    return result


def _merge_manual_tags_into_bundle(
    normalized_bundle: Dict[str, List[str]],
    manual_category_tags_json: Any,
) -> Dict[str, List[str]]:
    merged_bundle: Dict[str, List[str]] = _remap_category_keys_by_output_aliases(normalized_bundle)

    if isinstance(manual_category_tags_json, dict):
        manual_tags = manual_category_tags_json
    elif isinstance(manual_category_tags_json, str):
        text = manual_category_tags_json.strip()
        if not text:
            return merged_bundle
        try:
            manual_tags = json.loads(text)
        except Exception:
            return merged_bundle
    else:
        return merged_bundle

    if not isinstance(manual_tags, dict):
        return merged_bundle

    for raw_category, raw_tags in manual_tags.items():
        category_key = _resolve_output_category_key(raw_category)
        if not category_key:
            continue
        if isinstance(raw_tags, list):
            next_tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
        else:
            next_tags = _parse_tag_string(str(raw_tags))
        if not next_tags:
            continue
        existing_tags = list(merged_bundle.get(category_key, []))
        merged_bundle[category_key] = _dedupe_string_list(existing_tags + next_tags, unescape_parentheses=True)

    return merged_bundle


def _format_prompt_weight(weight: Any) -> str:
    try:
        normalized = round(float(weight), 2)
    except (TypeError, ValueError):
        normalized = 1.0
    text = f"{normalized:.2f}".rstrip('0').rstrip('.')
    return text or '1'


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off", ""}:
            return False
    return default


def _unescape_comfy_parentheses(text: Any) -> str:
    value = str(text or "")
    return value.replace("\\(", "(").replace("\\)", ")")


def _escape_unescaped_parentheses(text: Any) -> str:
    value = str(text or "")
    # only escape bare parentheses, keep already escaped ones as-is
    value = re.sub(r'(?<!\\)\(', r'\\(', value)
    value = re.sub(r'(?<!\\)\)', r'\\)', value)
    return value


def _dedupe_string_list(values: Any, unescape_parentheses: bool = False) -> List[str]:
    unique: List[str] = []
    seen = set()
    if not isinstance(values, list):
        return unique

    for item in values:
        text = str(item or "").strip()
        if not text:
            continue
        normalized = _unescape_comfy_parentheses(text) if unescape_parentheses else text
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(text)
    return unique


def _normalize_specificity_tag(text: Any) -> str:
    normalized = _unescape_comfy_parentheses(text)
    normalized = str(normalized or "").replace("_", " ").strip().lower()
    return re.sub(r"\s+", " ", normalized)


def _build_specificity_variants(tag: Any, match_singular_plural: bool = True) -> List[str]:
    normalized = _normalize_specificity_tag(tag)
    if not normalized:
        return []

    prefix, _, last_word = normalized.rpartition(" ")
    if not last_word:
        return []

    prefix_text = f"{prefix} " if prefix else ""
    last_variants = [last_word]

    if match_singular_plural:
        if last_word.endswith("ies") and len(last_word) > 3:
            last_variants.append(last_word[:-3] + "y")
        elif last_word.endswith("y") and len(last_word) > 1:
            last_variants.append(last_word[:-1] + "ies")

        if last_word.endswith("s") and len(last_word) > 1 and not last_word.endswith("ss"):
            last_variants.append(last_word[:-1])
        else:
            last_variants.append(last_word + "s")

    variants: List[str] = []
    seen = set()
    for last_variant in last_variants:
        candidate = f"{prefix_text}{last_variant}".strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        variants.append(candidate)
    return variants


def _split_top_level_prompt_parts(raw_value: Any) -> List[str]:
    text = str(raw_value or "")
    if not text:
        return []

    parts: List[str] = []
    current: List[str] = []
    depth = 0
    escaped = False

    for char in text:
        if escaped:
            current.append(char)
            escaped = False
            continue

        if char == "\\":
            current.append(char)
            escaped = True
            continue

        if char == "(":
            depth += 1
            current.append(char)
            continue

        if char == ")":
            if depth > 0:
                depth -= 1
            current.append(char)
            continue

        if depth == 0 and char in {",", "\r", "\n"}:
            part = "".join(current).strip()
            if part:
                parts.append(part)
            current = []
            continue

        current.append(char)

    part = "".join(current).strip()
    if part:
        parts.append(part)
    return parts

def _parse_tag_text_block(raw_value: Any) -> List[str]:
    return _split_top_level_prompt_parts(raw_value)


def _parse_weighted_prompt_part(raw_value: Any) -> Dict[str, Any]:
    text = str(raw_value or "").strip()
    if not text:
        return {}

    match = re.match(r'^\((.*):\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\)$', text, flags=re.S)
    if not match:
        return {}

    inner_text = str(match.group(1) or "").strip()
    weight_text = str(match.group(2) or "").strip()
    inner_tags = _split_top_level_prompt_parts(inner_text)
    if not inner_tags or not weight_text:
        return {}

    return {
        "type": "weighted",
        "tags": inner_tags,
        "weight": weight_text,
    }


def _parse_prompt_segments(raw_value: Any) -> List[Dict[str, Any]]:
    segments: List[Dict[str, Any]] = []
    for part in _split_top_level_prompt_parts(raw_value):
        weighted = _parse_weighted_prompt_part(part)
        if weighted:
            segments.append(weighted)
        else:
            segments.append({
                "type": "plain",
                "tag": str(part or "").strip(),
            })
    return segments


def _build_weighted_prompt_part(tags: List[str], weight: Any) -> str:
    cleaned_tags = [
        _escape_unescaped_parentheses(str(tag or "").strip())
        for tag in tags
        if str(tag or "").strip()
    ]
    if not cleaned_tags:
        return ""
    return f"({', '.join(cleaned_tags)}:{_format_prompt_weight(weight)})"


def _join_tag_text(tags: List[str], keep_trailing_comma: bool = False) -> str:
    cleaned_tags = [str(tag or "").strip() for tag in tags if str(tag or "").strip()]
    if not cleaned_tags:
        return ""
    result = ", ".join(cleaned_tags)
    if keep_trailing_comma:
        return result + ", "
    return result

def _unwrap_list_input(value: Any, default: Any = None) -> Any:
    if isinstance(value, list):
        if not value:
            return default
        return value[0]
    return value if value is not None else default


def _tag_is_covered_by_specific_variant(
    base_tag: str,
    candidate_tags: List[str],
    match_singular_plural: bool = True,
    min_prefix_words: int = 1,
) -> bool:
    base_variants = _build_specificity_variants(base_tag, match_singular_plural)
    if not base_variants:
        return False

    blocked_prefix_tokens = {"no", "without"}

    for candidate_tag in candidate_tags:
        candidate_variants = _build_specificity_variants(candidate_tag, match_singular_plural)
        for candidate_variant in candidate_variants:
            for base_variant in base_variants:
                if candidate_variant == base_variant:
                    continue

                suffix = f" {base_variant}"
                if not candidate_variant.endswith(suffix):
                    continue

                prefix = candidate_variant[:-len(suffix)].strip()
                if not prefix:
                    continue

                prefix_tokens = prefix.split()
                if len(prefix_tokens) < max(1, min_prefix_words):
                    continue
                if prefix_tokens[-1] in blocked_prefix_tokens:
                    continue
                return True

    return False


def _clean_specificity_tag_list(
    candidate_tags: List[str],
    preserve_tags_text: Any = "",
    match_singular_plural: bool = True,
    min_prefix_words: int = 1,
) -> Dict[str, List[str]]:
    normalized_candidates = _dedupe_string_list(candidate_tags, unescape_parentheses=True)

    preserve_variants = set()
    for preserve_tag in _parse_tag_text_block(str(preserve_tags_text or "")):
        preserve_variants.update(_build_specificity_variants(preserve_tag, match_singular_plural))

    cleaned_tags: List[str] = []
    removed_tags: List[str] = []

    for tag in normalized_candidates:
        tag_variants = _build_specificity_variants(tag, match_singular_plural)
        if any(variant in preserve_variants for variant in tag_variants):
            cleaned_tags.append(tag)
            continue

        if _tag_is_covered_by_specific_variant(
            base_tag=tag,
            candidate_tags=normalized_candidates,
            match_singular_plural=match_singular_plural,
            min_prefix_words=min_prefix_words,
        ):
            removed_tags.append(tag)
            continue

        cleaned_tags.append(tag)

    return {
        "cleaned_tags": cleaned_tags,
        "removed_tags": removed_tags,
    }


def _clean_specificity_prompt(
    raw_prompt: Any,
    preserve_tags_text: Any = "",
    match_singular_plural: bool = True,
    min_prefix_words: int = 1,
    keep_trailing_comma: bool = False,
) -> Dict[str, Any]:
    source_text = str(raw_prompt or "")
    segments = _parse_prompt_segments(source_text)
    flat_candidate_tags: List[str] = []
    for segment in segments:
        if segment.get("type") == "weighted":
            flat_candidate_tags.extend(segment.get("tags", []))
        else:
            tag = str(segment.get("tag") or "").strip()
            if tag:
                flat_candidate_tags.append(tag)

    cleaned_result = _clean_specificity_tag_list(
        candidate_tags=flat_candidate_tags,
        preserve_tags_text=preserve_tags_text,
        match_singular_plural=match_singular_plural,
        min_prefix_words=min_prefix_words,
    )
    cleaned_key_set = {
        key
        for key in (_normalize_specificity_tag(tag) for tag in cleaned_result["cleaned_tags"])
        if key
    }

    emitted_keys = set()
    cleaned_parts: List[str] = []
    for segment in segments:
        if segment.get("type") == "weighted":
            kept_tags: List[str] = []
            local_seen = set()
            for raw_tag in segment.get("tags", []):
                tag = str(raw_tag or "").strip()
                key = _normalize_specificity_tag(tag)
                if not key or key not in cleaned_key_set or key in emitted_keys or key in local_seen:
                    continue
                local_seen.add(key)
                emitted_keys.add(key)
                kept_tags.append(tag)
            weighted_text = _build_weighted_prompt_part(kept_tags, segment.get("weight", 1))
            if weighted_text:
                cleaned_parts.append(weighted_text)
            continue

        tag = str(segment.get("tag") or "").strip()
        key = _normalize_specificity_tag(tag)
        if not key or key not in cleaned_key_set or key in emitted_keys:
            continue
        emitted_keys.add(key)
        cleaned_parts.append(_escape_unescaped_parentheses(tag))

    escaped_removed_tags = [
        _escape_unescaped_parentheses(tag)
        for tag in cleaned_result["removed_tags"]
        if str(tag or "").strip()
    ]
    return {
        "cleaned_tags": cleaned_parts,
        "removed_tags": escaped_removed_tags,
        "cleaned_prompt": _join_tag_text(cleaned_parts, keep_trailing_comma=keep_trailing_comma),
        "removed_prompt": _join_tag_text(escaped_removed_tags, keep_trailing_comma=False),
    }


def _merge_tag_prompt_texts(tag_texts: List[str], keep_trailing_comma: bool = False) -> str:
    merged_parts: List[str] = []
    seen_plain = set()
    seen_weighted = set()

    for tag_text in tag_texts:
        for segment in _parse_prompt_segments(str(tag_text or "")):
            if segment.get("type") == "weighted":
                group_tags: List[str] = []
                group_keys: List[str] = []
                local_seen = set()
                for raw_tag in segment.get("tags", []):
                    tag = str(raw_tag or "").strip()
                    key = _normalize_specificity_tag(tag)
                    if not key or key in local_seen:
                        continue
                    local_seen.add(key)
                    group_keys.append(key)
                    group_tags.append(tag)
                if not group_tags:
                    continue
                weight_text = _format_prompt_weight(segment.get("weight", 1))
                signature = f"{weight_text}|{'|'.join(group_keys)}"
                if signature in seen_weighted:
                    continue
                seen_weighted.add(signature)
                merged_parts.append(_build_weighted_prompt_part(group_tags, weight_text))
                continue

            tag = str(segment.get("tag") or "").strip()
            escaped_tag = _escape_unescaped_parentheses(tag)
            key = _normalize_specificity_tag(escaped_tag)
            if not key or key in seen_plain:
                continue
            seen_plain.add(key)
            merged_parts.append(escaped_tag)

    return _join_tag_text(merged_parts, keep_trailing_comma=keep_trailing_comma)

def _extract_tags_text_from_payload(raw_value: Any, depth: int = 0) -> str:
    if depth > 3:
        return ""

    if isinstance(raw_value, str):
        text = raw_value.strip()
        if not text:
            return ""

        # 优先解析完整 JSON 字符串（例如上游传入 metadata payload）。
        try:
            parsed = json.loads(text)
            extracted = _extract_tags_text_from_payload(parsed, depth + 1)
            if extracted:
                return extracted
        except Exception:
            pass

        # 兜底：字符串里夹了 JSON 片段时，尝试提取常见字段。
        for key in ("prompt", "tags", "tag_string", "caption", "text"):
            pattern = re.compile(rf'"{re.escape(key)}"\s*:\s*"((?:\\.|[^"\\])*)"', re.IGNORECASE | re.DOTALL)
            match = pattern.search(text)
            if not match:
                continue
            try:
                return json.loads(f'"{match.group(1)}"')
            except Exception:
                return match.group(1)

        return text

    if isinstance(raw_value, dict):
        # Gallery 选择项通常同时包含 tag_string/prompt，这里必须优先用 prompt，
        # 否则会把整条空格分隔 tag_string 当成一个“未归类词”。
        if any(key in raw_value for key in ("post_id", "image_url", "preview_url", "md5")):
            for key in ("prompt", "tags", "tag_string", "caption", "text"):
                if key not in raw_value:
                    continue
                extracted = _extract_tags_text_from_payload(raw_value.get(key), depth + 1)
                if extracted:
                    return extracted

        for key in ("tags", "prompt", "tag_string", "caption", "text"):
            if key not in raw_value:
                continue
            extracted = _extract_tags_text_from_payload(raw_value.get(key), depth + 1)
            if extracted:
                return extracted

        selections = raw_value.get("selections")
        if isinstance(selections, list):
            chunks: List[str] = []
            for item in selections:
                extracted = _extract_tags_text_from_payload(item, depth + 1)
                if extracted:
                    chunks.append(extracted)
            if chunks:
                return ", ".join(chunks)

        for value in raw_value.values():
            if isinstance(value, (dict, list)):
                extracted = _extract_tags_text_from_payload(value, depth + 1)
                if extracted:
                    return extracted
        return ""

    if isinstance(raw_value, list):
        chunks: List[str] = []
        for item in raw_value:
            extracted = _extract_tags_text_from_payload(item, depth + 1)
            if extracted:
                chunks.append(extracted)
        return ", ".join(chunks)

    return str(raw_value or "").strip()


def _is_metadata_like_token(token: str) -> bool:
    text = str(token or "").strip().lower()
    if not text:
        return True

    if "http://" in text or "https://" in text:
        return True

    metadata_prefixes = (
        '{"', '{"selections"', '"selections"', '"post_id"', '"image_url"', '"prompt"',
        '"tags"', '"caption"', '"text"',
    )
    if text.startswith(metadata_prefixes):
        return True

    # JSON 碎片：例如 `"foo":`、`...}` 等。
    if ":" in text and (text.startswith("{") or text.startswith('"') or text.endswith("}") or text.endswith("]")):
        return True

    return False


def _resolve_excel_path(excel_file: str) -> str:
    """
    将用户输入的 excel_file 解析成可用路径。
    - 支持绝对路径
    - 否则默认在 tags_database 下查找
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_base_dir = os.path.join(current_dir, "tags_database")
    if os.path.isabs(excel_file) and os.path.exists(excel_file):
        return excel_file
    return os.path.join(data_base_dir, excel_file)


def _build_source_file_signature(file_path: str) -> Dict[str, Any]:
    abs_path = os.path.abspath(file_path or "")
    signature: Dict[str, Any] = {"source_path": abs_path}
    try:
        stat_info = os.stat(abs_path)
        signature["mtime_ns"] = int(stat_info.st_mtime_ns)
        signature["size"] = int(stat_info.st_size)
    except Exception:
        pass
    return signature


def _get_tag_database_cache_dir() -> str:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(current_dir, _TAG_DATABASE_CACHE_DIR_NAME)


def _normalize_cache_file_name(raw_name: Any) -> str:
    text = str(raw_name or "").strip()
    normalized = re.sub(r'[^A-Za-z0-9._-]+', "_", text).strip("._")
    return normalized[:80] or "tag_database"


def _get_tag_database_cache_path(source_path: str) -> str:
    abs_path = os.path.abspath(source_path or "")
    name_hash = hashlib.md5(abs_path.encode("utf-8")).hexdigest()
    file_name = _normalize_cache_file_name(os.path.basename(abs_path))
    return os.path.join(_get_tag_database_cache_dir(), f"{file_name}.{name_hash}.pkl")


def _empty_tag_database_payload() -> Dict[str, Dict[str, Any]]:
    return {
        "tag_db": {},
        "source_category_aliases": {},
        "source_subcategory_aliases": {},
    }


def _is_valid_tag_database_payload(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and isinstance(payload.get("tag_db"), dict)
        and isinstance(payload.get("source_category_aliases"), dict)
        and isinstance(payload.get("source_subcategory_aliases"), dict)
    )


def _store_tag_database_memory_cache(cache_key: str, payload: Dict[str, Any]) -> None:
    if not cache_key or not _is_valid_tag_database_payload(payload):
        return
    _tag_cache.clear()
    _tag_cache[cache_key] = payload


def _load_tag_database_disk_cache(source_path: str, expected_signature: Dict[str, Any]) -> Dict[str, Any] | None:
    cache_path = _get_tag_database_cache_path(source_path)
    if not os.path.isfile(cache_path):
        return None

    try:
        with open(cache_path, "rb") as f:
            payload = pickle.load(f)
    except Exception as e:
        print(f"[DanbooruTagToolkit] Failed to load tag database cache: {e}")
        return None

    if not isinstance(payload, dict):
        return None
    if int(payload.get("cache_version", 0)) != _TAG_DATABASE_CACHE_VERSION:
        return None
    if payload.get("source_signature") != expected_signature:
        return None

    cached_payload = payload.get("payload")
    if not _is_valid_tag_database_payload(cached_payload):
        return None

    print(f"[DanbooruTagToolkit] Loading tag database cache: {cache_path}")
    return cached_payload


def _save_tag_database_disk_cache(source_path: str, source_signature: Dict[str, Any], payload: Dict[str, Any]) -> None:
    if not _is_valid_tag_database_payload(payload):
        return

    cache_dir = _get_tag_database_cache_dir()
    cache_path = _get_tag_database_cache_path(source_path)
    temp_path = f"{cache_path}.tmp"
    wrapper = {
        "cache_version": _TAG_DATABASE_CACHE_VERSION,
        "source_signature": source_signature,
        "payload": payload,
    }

    try:
        os.makedirs(cache_dir, exist_ok=True)
        with open(temp_path, "wb") as f:
            pickle.dump(wrapper, f, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(temp_path, cache_path)
    except Exception as e:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass
        print(f"[DanbooruTagToolkit] Failed to save tag database cache: {e}")


def _read_tag_database_table(source_path: str) -> pd.DataFrame:
    usecols = lambda column_name: str(column_name or "").strip() in _TAG_DATABASE_REQUIRED_COLUMNS
    read_kwargs = {
        "dtype": str,
        "usecols": usecols,
    }
    if str(source_path).lower().endswith(".csv"):
        return pd.read_csv(source_path, **read_kwargs)
    return pd.read_excel(source_path, **read_kwargs)


def _get_table_cell(row: Any, column_index: Dict[str, int], column_name: str) -> Any:
    index = column_index.get(column_name)
    if index is None:
        return ""
    if index < 0 or index >= len(row):
        return ""
    return row[index]


def _list_available_tag_files() -> List[str]:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_base_dir = os.path.join(current_dir, "tags_database")
    allowed_ext = {".xlsx", ".xls", ".csv"}
    if not os.path.isdir(data_base_dir):
        return []

    file_names: List[str] = []
    try:
        for name in os.listdir(data_base_dir):
            full_path = os.path.join(data_base_dir, name)
            if not os.path.isfile(full_path):
                continue
            if str(name).startswith("~$"):
                continue
            _, ext = os.path.splitext(name)
            if ext.lower() in allowed_ext:
                file_names.append(name)
    except Exception:
        return []

    file_names.sort(key=lambda x: x.lower())
    return file_names


def _normalize_preset_name(raw_name: Any) -> str:
    name = str(raw_name or "").strip()
    if not name:
        return ""
    name = os.path.basename(name)
    if name.lower().endswith(".json"):
        name = name[:-5]
    name = re.sub(r'[\\/:*?"<>|]+', "_", name).strip(" .")
    return name[:80]


def _get_sorter_preset_dir() -> str:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(current_dir, _SORTER_PRESET_DIR_NAME)


def _list_sorter_presets() -> List[str]:
    preset_dir = _get_sorter_preset_dir()
    if not os.path.isdir(preset_dir):
        return []

    names: List[str] = []
    try:
        for filename in os.listdir(preset_dir):
            full_path = os.path.join(preset_dir, filename)
            if not os.path.isfile(full_path):
                continue
            if not filename.lower().endswith(".json"):
                continue
            names.append(os.path.splitext(filename)[0])
    except Exception:
        return []
    names.sort(key=lambda x: x.lower())
    return names


def _load_sorter_preset(name: str) -> Dict[str, Any]:
    normalized = _normalize_preset_name(name)
    if not normalized:
        raise ValueError("Invalid preset name")

    preset_dir = _get_sorter_preset_dir()
    preset_path = os.path.join(preset_dir, f"{normalized}.json")
    if not os.path.isfile(preset_path):
        raise FileNotFoundError("Preset not found")

    with open(preset_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, dict):
        raise ValueError("Invalid preset content")

    return {
        "name": normalized,
        "excel_file": str(payload.get("excel_file", "danbooru_tags.xlsx") or "danbooru_tags.xlsx"),
        "category_mapping": str(payload.get("category_mapping", DEFAULT_MAPPING_TEXT) or DEFAULT_MAPPING_TEXT),
        "new_category_order": str(payload.get("new_category_order", DEFAULT_ORDER_TEXT) or DEFAULT_ORDER_TEXT),
        "default_category": str(payload.get("default_category", "未归类词") or "未归类词"),
    }


def _save_sorter_preset(name: str, payload: Dict[str, Any]) -> str:
    normalized = _normalize_preset_name(name)
    if not normalized:
        raise ValueError("Invalid preset name")

    preset_dir = _get_sorter_preset_dir()
    os.makedirs(preset_dir, exist_ok=True)
    preset_path = os.path.join(preset_dir, f"{normalized}.json")

    data = {
        "excel_file": str(payload.get("excel_file", "danbooru_tags.xlsx") or "danbooru_tags.xlsx"),
        "category_mapping": str(payload.get("category_mapping", DEFAULT_MAPPING_TEXT) or DEFAULT_MAPPING_TEXT),
        "new_category_order": str(payload.get("new_category_order", DEFAULT_ORDER_TEXT) or DEFAULT_ORDER_TEXT),
        "default_category": str(payload.get("default_category", "未归类词") or "未归类词"),
        "updated_at": int(time.time()),
    }
    with open(preset_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return normalized


def _clean_sheet_text(value: Any) -> str:
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value).strip()


def _parse_input_data(raw_input: Any, default_text: str, expected_type: type):
    """
    解析 category_mapping/new_category_order 这类输入：
    优先 json，其次 literal_eval，失败时回退默认值。
    """
    if isinstance(raw_input, expected_type):
        return raw_input
    if not isinstance(raw_input, str):
        raw_input = default_text

    text = raw_input.strip()
    if not text:
        text = default_text

    try:
        parsed = json.loads(text)
        if isinstance(parsed, expected_type):
            return parsed
    except Exception:
        pass

    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, expected_type):
            return parsed
    except Exception:
        pass

    # 兼容前端设置里按行填写分类（非 JSON/Python list）：
    # 每行一个分类，或逗号分隔均可。
    if expected_type is list:
        rough_items = re.split(r'[\r\n,]+', text)
        normalized_items: List[str] = []
        seen = set()
        for raw_item in rough_items:
            item = str(raw_item).strip().strip('"').strip("'").strip()
            item = re.sub(r'^[\[\{\(]+|[\]\}\)]+$', '', item).strip()
            if re.fullmatch(r'[\[\]\{\}\(\)\s]+', item):
                continue
            if not item or item in seen:
                continue
            seen.add(item)
            normalized_items.append(item)
        if normalized_items:
            return normalized_items

    try:
        parsed = ast.literal_eval(default_text)
        if isinstance(parsed, expected_type):
            return parsed
    except Exception:
        pass

    return {} if expected_type is dict else []


def _build_category_order(new_category_order: Any, default_category: str) -> List[str]:
    ordered: List[str] = []
    seen = set()

    if isinstance(new_category_order, list):
        for item in new_category_order:
            name = str(item).strip()
            if not name or name in seen:
                continue
            seen.add(name)
            ordered.append(name)

    default_name = str(default_category or "").strip()
    if default_name and default_name not in seen:
        ordered.append(default_name)

    return ordered


def _normalize_output_category_sequence(values: Iterable[Any]) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for raw_value in values or []:
        key = _resolve_output_category_key(raw_value)
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def _execute_sorting(
    tags: str,
    excel_file: str,
    category_mapping: Any,
    new_category_order: Any,
    default_category: str,
    regex_blacklist: str,
    tag_blacklist: str,
    deduplicate_tags: bool,
    validation: bool,
    force_reload: bool,
    is_comment: bool,
):
    """
    统一执行分类逻辑，供旧 Sorter 节点、一体化节点、预览 API 复用。
    返回 (all_str, cat_dict, final_excel_path, cat_map, cat_order, output_category_labels)。
    """
    default_category = str(default_category or "").strip() or "未归类词"
    final_excel_path = _resolve_excel_path(excel_file)

    cat_map = _parse_input_data(category_mapping, DEFAULT_MAPPING_TEXT, dict)
    parsed_order = _parse_input_data(new_category_order, DEFAULT_ORDER_TEXT, list)
    cat_order = _build_category_order(parsed_order, default_category)
    output_category_candidates: List[Any] = [default_category, *cat_order, *list(cat_map.values())]
    output_category_labels = _build_output_category_labels(output_category_candidates)

    if validation:
        used_keys = set(_normalize_output_category_sequence(cat_map.values()))
        defined_keys = set(_normalize_output_category_sequence(cat_order))
        missing_keys = used_keys - defined_keys
        if missing_keys:
            missing_labels = [
                _get_output_category_label(category_key, output_category_labels, "zh")
                for category_key in sorted(missing_keys)
            ]
            print(
                f"[DanbooruTagToolkit] Validation warning: mapping contains categories not present in order: "
                f"{missing_labels}. These tags will fall back to default category {default_category!r}."
            )

    if force_reload:
        global _tag_cache
        _tag_cache.clear()

    sorter = DanbooruTagSorter(
        final_excel_path,
        cat_map,
        cat_order,
        default_category,
        output_category_labels=output_category_labels,
        comment_language="zh",
    )
    all_str, cat_dict = sorter.process_tags(
        tags,
        is_comment,
        regex_blacklist,
        tag_blacklist,
        deduplicate_tags
    )
    normalized_cat_order = list(sorter.new_category_order)
    for category in normalized_cat_order:
        cat_dict.setdefault(category, "")
    return all_str, cat_dict, final_excel_path, sorter.category_mapping, normalized_cat_order, sorter.output_category_labels


def _select_from_bundle(
    tag_bundle: Dict[str, Any],
    selected_tags_json: Any,
    selected_categories_json: Any,
    manual_category_tags_json: Any,
    selected_category_weights_json: Any,
    selected_tag_weights_json: Any,
    separator: str,
    use_all_when_empty: bool,
    deduplicate_selected: bool,
    keep_trailing_comma: bool,
):
    normalized_bundle = _normalize_bundle_for_ui(tag_bundle)
    working_bundle = _merge_manual_tags_into_bundle(normalized_bundle, manual_category_tags_json)
    selected_list = _safe_parse_json_list(selected_tags_json, [])
    selected_categories = _safe_parse_json_list(selected_categories_json, [])
    selected_category_weights = _safe_parse_json_weight_map(selected_category_weights_json)
    selected_tag_weights = _safe_parse_json_weight_map(selected_tag_weights_json)
    use_all_when_empty = _as_bool(use_all_when_empty, True)
    deduplicate_selected = _as_bool(deduplicate_selected, True)
    normalized_separator = str(separator or "comma").strip()
    normalized_separator_lower = normalized_separator.lower()
    if normalized_separator_lower in {"true", "false"}:
        normalized_separator = "comma"
    if normalized_separator not in {"comma", "newline", "space"}:
        normalized_separator = "comma"
    keep_trailing = _as_bool(keep_trailing_comma, True)

    available_map: Dict[str, str] = {}
    all_tags: List[str] = []
    tag_category_map: Dict[str, str] = {}
    for category, tags in working_bundle.items():
        for tag in tags:
            key = _unescape_comfy_parentheses(tag).strip().lower()
            if not key:
                continue
            if key not in available_map:
                available_map[key] = tag
                all_tags.append(tag)
            if key not in tag_category_map:
                tag_category_map[key] = category

    category_name_map = _build_output_category_lookup(working_bundle)

    resolved_categories: List[str] = []
    seen_categories = set()
    for category in selected_categories:
        normalized_key = str(category).strip().lower()
        resolved_category = category_name_map.get(normalized_key)
        if not resolved_category or normalized_key in seen_categories:
            continue
        seen_categories.add(normalized_key)
        resolved_categories.append(resolved_category)

    resolved_category_weights: Dict[str, float] = {}
    for raw_category, weight in selected_category_weights.items():
        normalized_key = str(raw_category).strip().lower()
        resolved_category = category_name_map.get(normalized_key)
        if not resolved_category:
            continue
        resolved_category_weights[resolved_category] = weight

    resolved_tag_weights: Dict[str, float] = {}
    for raw_tag, weight in selected_tag_weights.items():
        normalized_key = _unescape_comfy_parentheses(raw_tag).strip().lower()
        if not normalized_key or normalized_key not in available_map:
            continue
        resolved_tag_weights[normalized_key] = weight

    category_order: List[str] = []
    seen_category_order = set()
    for category in resolved_categories:
        normalized_key = category.strip().lower()
        if normalized_key in seen_category_order:
            continue
        seen_category_order.add(normalized_key)
        category_order.append(category)

    selected_tag_keys = set()
    fallback_tags: List[str] = []
    for item in selected_list:
        normalized_item = _unescape_comfy_parentheses(item).strip().lower()
        if not normalized_item:
            continue
        selected_tag_keys.add(normalized_item)
        resolved_tag = available_map.get(normalized_item)
        if resolved_tag is None:
            fallback_tag = _escape_unescaped_parentheses(str(item).strip())
            if fallback_tag:
                fallback_tags.append(fallback_tag)
            continue
        resolved_category = tag_category_map.get(normalized_item)
        if not resolved_category:
            continue
        category_key = resolved_category.strip().lower()
        if category_key not in seen_category_order:
            seen_category_order.add(category_key)
            category_order.append(resolved_category)

    selected_parts: List[str] = []
    if selected_list or category_order:
        explicit_category_keys = {category.strip().lower() for category in resolved_categories}
        used_tag_keys = set()
        for category in category_order:
            category_tags = list(working_bundle.get(category, []))
            row_source: List[str] = []
            if selected_tag_keys:
                for tag in category_tags:
                    normalized_tag = _unescape_comfy_parentheses(tag).strip().lower()
                    if normalized_tag in selected_tag_keys:
                        row_source.append(tag)
            if not row_source and category.strip().lower() in explicit_category_keys:
                row_source = category_tags

            row_tags: List[str] = []
            row_seen = set()
            for tag in row_source:
                escaped_tag = _escape_unescaped_parentheses(str(tag).strip())
                if not escaped_tag:
                    continue
                normalized_tag = _unescape_comfy_parentheses(escaped_tag).strip().lower()
                if not normalized_tag or normalized_tag in row_seen:
                    continue
                if deduplicate_selected and normalized_tag in used_tag_keys:
                    continue
                row_seen.add(normalized_tag)
                if deduplicate_selected:
                    used_tag_keys.add(normalized_tag)
                row_tags.append(escaped_tag)

            if not row_tags:
                continue

            row_weight = resolved_category_weights.get(category, 1.0)
            if abs(float(row_weight) - 1.0) > 1e-9:
                weighted_parts: List[str] = []
                remaining_tags: List[str] = []
                for escaped_tag in row_tags:
                    normalized_key = _unescape_comfy_parentheses(escaped_tag).strip().lower()
                    tag_weight = resolved_tag_weights.get(normalized_key, 1.0)
                    if abs(float(tag_weight) - 1.0) > 1e-9:
                        weighted_parts.append(_build_weighted_prompt_part([escaped_tag], tag_weight))
                    else:
                        remaining_tags.append(escaped_tag)
                selected_parts.extend([part for part in weighted_parts if part])
                grouped_part = _build_weighted_prompt_part(remaining_tags, row_weight)
                if grouped_part:
                    selected_parts.append(grouped_part)
            else:
                for escaped_tag in row_tags:
                    normalized_key = _unescape_comfy_parentheses(escaped_tag).strip().lower()
                    tag_weight = resolved_tag_weights.get(normalized_key, 1.0)
                    if abs(float(tag_weight) - 1.0) > 1e-9:
                        weighted_tag = _build_weighted_prompt_part([escaped_tag], tag_weight)
                        if weighted_tag:
                            selected_parts.append(weighted_tag)
                    else:
                        selected_parts.append(escaped_tag)

        fallback_seen = set()
        for tag in fallback_tags:
            normalized_tag = _unescape_comfy_parentheses(tag).strip().lower()
            if not normalized_tag or normalized_tag in fallback_seen:
                continue
            if deduplicate_selected and normalized_tag in used_tag_keys:
                continue
            fallback_seen.add(normalized_tag)
            if deduplicate_selected:
                used_tag_keys.add(normalized_tag)
            tag_weight = resolved_tag_weights.get(normalized_tag, 1.0)
            if abs(float(tag_weight) - 1.0) > 1e-9:
                weighted_tag = _build_weighted_prompt_part([tag], tag_weight)
                if weighted_tag:
                    selected_parts.append(weighted_tag)
            else:
                selected_parts.append(tag)
    elif use_all_when_empty:
        selected_parts = [
            _escape_unescaped_parentheses(str(tag).strip())
            for tag in all_tags
            if str(tag).strip()
        ]
        if deduplicate_selected and selected_parts:
            seen = set()
            deduplicated = []
            for tag in selected_parts:
                key = _unescape_comfy_parentheses(tag).strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                deduplicated.append(tag)
            selected_parts = deduplicated

    sep_map = {
        "comma": ", ",
        "newline": "\n",
        "space": " ",
    }
    joiner = sep_map.get(normalized_separator, ", ")
    selected_text = joiner.join(selected_parts) if selected_parts else ""

    if selected_text and keep_trailing:
        if normalized_separator == "newline":
            selected_text += "\n"
        elif normalized_separator == "space":
            selected_text += " "
        else:
            selected_text += ", "

    return selected_text, normalized_bundle

def _empty_image_tensor() -> torch.Tensor:
    return torch.zeros(1, 1, 1, 3)


def _absolutize_danbooru_url(raw_url: Any) -> str:
    text = str(raw_url or "").strip()
    if not text:
        return ""
    if text.startswith("//"):
        return "https:" + text
    if text.startswith("/"):
        return _DANBOORU_BASE_URL + text
    return text


def _tag_string_to_prompt(tag_string: Any) -> str:
    tokens = [t.strip() for t in str(tag_string or "").split(" ") if t.strip()]
    if not tokens:
        return ""
    return ", ".join(_escape_unescaped_parentheses(t.replace("_", " ")) for t in tokens)


def _guess_file_ext_from_url(url: Any) -> str:
    text = str(url or "").strip()
    if not text:
        return ""
    try:
        parsed = urllib.parse.urlparse(text)
        _, ext = os.path.splitext(parsed.path or "")
        return ext.lower().lstrip(".")
    except Exception:
        return ""


def _evict_oldest_cache_item(cache_dict: Dict[str, Any], max_items: int):
    if max_items <= 0:
        cache_dict.clear()
        return
    if len(cache_dict) < max_items:
        return
    oldest_key = min(cache_dict.keys(), key=lambda k: cache_dict[k].get("ts", 0))
    cache_dict.pop(oldest_key, None)


def _cleanup_expired_cache_items(cache_dict: Dict[str, Any], ttl_seconds: int):
    if ttl_seconds <= 0 or not cache_dict:
        return
    now = time.time()
    expired_keys = [
        key for key, value in cache_dict.items()
        if not isinstance(value, dict) or (now - float(value.get("ts", 0)) > ttl_seconds)
    ]
    for key in expired_keys:
        cache_dict.pop(key, None)


def _fetch_gallery_posts(tags: str, limit: int, page: int, rating: str = "safe") -> List[Dict[str, Any]]:
    allowed_image_ext = {"jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif"}
    rating_value = str(rating or "all").strip().lower()
    tag_parts = [str(tags or "").strip()]
    if rating_value and rating_value != "all":
        tag_parts.append(f"rating:{rating_value}")
    final_tags = " ".join([p for p in tag_parts if p]).strip()

    cache_key = f"{final_tags}|{limit}|{page}"
    now = time.time()
    cached = _gallery_post_cache.get(cache_key)
    if cached and (now - cached.get("ts", 0) <= _GALLERY_POST_CACHE_TTL):
        return cached.get("posts", [])

    query = urllib.parse.urlencode({
        "tags": final_tags,
        "limit": int(limit),
        "page": int(page),
    })
    api_url = f"{_DANBOORU_BASE_URL}/posts.json?{query}"

    with urllib.request.urlopen(api_url, timeout=15) as response:
        payload = response.read().decode("utf-8", errors="replace")
    parsed = json.loads(payload)
    if not isinstance(parsed, list):
        return []

    posts: List[Dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue

        post_id = item.get("id")
        tag_string = str(item.get("tag_string", "") or "")
        prompt = _tag_string_to_prompt(tag_string)

        preview_url = _absolutize_danbooru_url(item.get("preview_file_url"))
        if not preview_url:
            continue

        image_url = _absolutize_danbooru_url(item.get("file_url"))
        if not image_url:
            image_url = _absolutize_danbooru_url(item.get("large_file_url"))
        if not image_url:
            image_url = preview_url

        file_ext = str(item.get("file_ext", "") or "").strip().lower()
        if not file_ext:
            file_ext = _guess_file_ext_from_url(image_url)
        if file_ext and file_ext not in allowed_image_ext:
            continue

        posts.append({
            "id": post_id,
            "preview_url": preview_url,
            "image_url": image_url,
            "display_url": (
                _absolutize_danbooru_url(item.get("large_file_url"))
                or _absolutize_danbooru_url(item.get("file_url"))
                or preview_url
            ),
            "preview_width": int(item.get("preview_width", 0) or 0),
            "preview_height": int(item.get("preview_height", 0) or 0),
            "image_width": int(item.get("image_width", 0) or 0),
            "image_height": int(item.get("image_height", 0) or 0),
            "tag_string": tag_string,
            "prompt": prompt,
            "score": item.get("score", 0),
            "rating": item.get("rating", ""),
            "file_ext": file_ext,
            "md5": item.get("md5", ""),
            "tag_string_artist": str(item.get("tag_string_artist", "") or ""),
            "tag_string_copyright": str(item.get("tag_string_copyright", "") or ""),
            "tag_string_character": str(item.get("tag_string_character", "") or ""),
            "tag_string_general": str(item.get("tag_string_general", "") or ""),
            "tag_string_meta": str(item.get("tag_string_meta", "") or ""),
        })

    _evict_oldest_cache_item(_gallery_post_cache, _GALLERY_POST_CACHE_LIMIT)
    _gallery_post_cache[cache_key] = {
        "ts": now,
        "posts": posts,
    }
    return posts


def _fetch_gallery_autocomplete(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    text = str(query or "").strip().lower().replace(" ", "_")
    if len(text) < 2:
        return []

    limit = max(1, min(int(limit), 50))
    cache_key = f"{text}|{limit}"
    now = time.time()
    cached = _gallery_autocomplete_cache.get(cache_key)
    if cached and (now - cached.get("ts", 0) <= _GALLERY_AUTOCOMPLETE_CACHE_TTL):
        return cached.get("items", [])

    params = urllib.parse.urlencode({
        "search[name_matches]": f"{text}*",
        "search[order]": "count",
        "limit": limit,
    })
    api_url = f"{_DANBOORU_BASE_URL}/tags.json?{params}"

    with urllib.request.urlopen(api_url, timeout=10) as response:
        payload = response.read().decode("utf-8", errors="replace")
    parsed = json.loads(payload)
    if not isinstance(parsed, list):
        return []

    items: List[Dict[str, Any]] = []
    for tag in parsed:
        if not isinstance(tag, dict):
            continue
        name = str(tag.get("name", "") or "").strip()
        if not name:
            continue
        items.append({
            "name": name,
            "post_count": int(tag.get("post_count", 0) or 0),
            "category": int(tag.get("category", -1) or -1),
        })

    _evict_oldest_cache_item(_gallery_autocomplete_cache, _GALLERY_AUTOCOMPLETE_CACHE_LIMIT)
    _gallery_autocomplete_cache[cache_key] = {
        "ts": now,
        "items": items,
    }
    return items


def _load_gallery_image_tensor(image_url: str) -> torch.Tensor:
    final_url = _absolutize_danbooru_url(image_url)
    if not final_url:
        return _empty_image_tensor()

    _cleanup_expired_cache_items(_gallery_image_cache, _GALLERY_IMAGE_CACHE_TTL)
    cached = _gallery_image_cache.get(final_url)
    if isinstance(cached, dict):
        tensor = cached.get("tensor")
        if tensor is not None:
            cached["ts"] = time.time()
            return tensor

    with urllib.request.urlopen(final_url, timeout=20) as response:
        image_bytes = response.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image_arr = np.array(image).astype(np.float32) / 255.0
    image_tensor = torch.from_numpy(image_arr)[None,]

    _cleanup_expired_cache_items(_gallery_image_cache, _GALLERY_IMAGE_CACHE_TTL)
    _evict_oldest_cache_item(_gallery_image_cache, _GALLERY_IMAGE_CACHE_LIMIT)
    _gallery_image_cache[final_url] = {
        "ts": time.time(),
        "tensor": image_tensor,
    }
    return image_tensor


def _get_cached_gallery_image_tensor(image_url: str) -> torch.Tensor:
    final_url = _absolutize_danbooru_url(image_url)
    if not final_url:
        return _empty_image_tensor()

    _cleanup_expired_cache_items(_gallery_image_cache, _GALLERY_IMAGE_CACHE_TTL)
    cached = _gallery_image_cache.get(final_url)
    if isinstance(cached, dict):
        tensor = cached.get("tensor")
        if tensor is not None:
            cached["ts"] = time.time()
            return tensor

    return _load_gallery_image_tensor(final_url)


# Sorter类
class DanbooruTagSorter:
    def __init__(
        self,
        excel_path,
        category_mapping,
        new_category_order,
        default_category="未归类词",
        output_category_labels: Dict[str, Dict[str, str]] | None = None,
        comment_language: str = "zh",
    ):
        self.excel_path = excel_path
        self._last_cache_hit = False
        self.comment_language = "zh" if str(comment_language or "").strip().lower() == "zh" else "en"
        self.output_category_labels = _normalize_output_category_labels_map(output_category_labels)
        self.output_category_aliases = self._build_output_category_aliases(self.output_category_labels)

        db_payload = self._load_database_with_cache()  # 初始化立刻先尝试加载或从缓存获取数据库
        self.tag_db = db_payload.get("tag_db", {})
        self.source_category_aliases = db_payload.get("source_category_aliases", {})
        self.source_subcategory_aliases = db_payload.get("source_subcategory_aliases", {})

        self.default_category = self._normalize_output_category(default_category) or "uncategorized_terms"
        self.output_category_labels.setdefault(
            self.default_category,
            {
                "zh": _get_output_category_label(self.default_category, self.output_category_labels, "zh"),
                "en": _get_output_category_label(self.default_category, self.output_category_labels, "en"),
            },
        )
        self.new_category_order = self._normalize_category_order(new_category_order, self.default_category)
        self.category_mapping = self._normalize_category_mapping(category_mapping)

    def _build_output_category_aliases(self, labels: Dict[str, Dict[str, str]]) -> Dict[str, str]:
        aliases = dict(_OUTPUT_CATEGORY_ALIAS_TO_KEY)
        for raw_key, raw_value in (labels or {}).items():
            key = str(raw_key or "").strip()
            if not key:
                continue
            candidates = [key]
            if isinstance(raw_value, dict):
                candidates.extend([raw_value.get("zh", ""), raw_value.get("en", "")])
            else:
                candidates.append(str(raw_value or ""))
            for candidate in candidates:
                alias = _normalize_lookup_text(candidate)
                if alias and alias not in aliases:
                    aliases[alias] = key
        return aliases

    def _normalize_output_category(self, raw_value: Any) -> str:
        text = str(raw_value or "").strip()
        if not text:
            return ""
        alias = _normalize_lookup_text(text)
        return self.output_category_aliases.get(alias, _resolve_output_category_key(text))

    def _normalize_source_category(self, raw_value: Any) -> str:
        text = str(raw_value or "").strip()
        if not text:
            return ""
        alias = _normalize_lookup_text(text)
        return self.source_category_aliases.get(alias, text)

    def _normalize_source_subcategory(self, raw_value: Any) -> str:
        text = str(raw_value or "").strip()
        if not text:
            return ""
        if text == "*":
            return "*"
        alias = _normalize_lookup_text(text)
        return self.source_subcategory_aliases.get(alias, text)

    def _normalize_category_mapping(self, raw_mapping: Any) -> Dict[Any, str]:
        normalized: Dict[Any, str] = {}
        if not isinstance(raw_mapping, dict):
            return normalized
        for raw_key, raw_target in raw_mapping.items():
            target_key = self._normalize_output_category(raw_target)
            if not target_key:
                continue
            self.output_category_labels.setdefault(
                target_key,
                {
                    "zh": _get_output_category_label(target_key, self.output_category_labels, "zh"),
                    "en": _get_output_category_label(target_key, self.output_category_labels, "en"),
                },
            )
            if isinstance(raw_key, tuple) and len(raw_key) >= 2:
                category_key = self._normalize_source_category(raw_key[0])
                subcategory_key = self._normalize_source_subcategory(raw_key[1])
                if category_key:
                    normalized[(category_key, subcategory_key)] = target_key
            else:
                category_key = self._normalize_source_category(raw_key)
                if category_key:
                    normalized[category_key] = target_key
        return normalized

    def _normalize_category_order(self, raw_order: Any, default_category: str) -> List[str]:
        ordered: List[str] = []
        seen = set()
        if isinstance(raw_order, list):
            for item in raw_order:
                key = self._normalize_output_category(item)
                if not key or key in seen:
                    continue
                seen.add(key)
                ordered.append(key)
                self.output_category_labels.setdefault(
                    key,
                    {
                        "zh": _get_output_category_label(key, self.output_category_labels, "zh"),
                        "en": _get_output_category_label(key, self.output_category_labels, "en"),
                    },
                )
        if default_category and default_category not in seen:
            ordered.append(default_category)
        return ordered

    # 根据原始的大类小类查表，得到新的分类名
    def get_new_category(self, original_category, original_subcategory):
        key = (original_category, original_subcategory)
        # 如果查不到就返回default_category，由用户自己设定
        if key in self.category_mapping:
            return self.category_mapping[key]

        category_key = str(original_category or "").strip()
        if category_key in self.category_mapping:
            return self.category_mapping[category_key]

        wildcard_key = (category_key, "*")
        if wildcard_key in self.category_mapping:
            return self.category_mapping[wildcard_key]

        return self.default_category

    # 生成哈希键
    # 判断当前的配置参数是否和上次缓存一致
    def _generate_cache_key(self):
        # 缓存只与“数据库文件内容”相关，不随 mapping/order/default_category 变化。
        # 这样切换配置时不会重复读取 xlsx。
        params = _build_source_file_signature(self.excel_path)
        params_str = json.dumps(params, sort_keys=True)
        hasher = hashlib.md5(params_str.encode(encoding='utf-8')).hexdigest()
        # 返回MD5
        return hasher

    # 加载数据库
    def _load_database_with_cache(self):
        cache_key = self._generate_cache_key()
        # 检查缓存是否命中
        if cache_key in _tag_cache:
            self._last_cache_hit = True
            return _tag_cache[cache_key]
        self._last_cache_hit = False
        print(f"[DanbooruTagToolkit] Loading tag database: {self.excel_path}")

        # 基础校验
        if not self.excel_path or not os.path.exists(self.excel_path):
            print(f"[DanbooruTagToolkit] Warning: tag database file not found: {self.excel_path}")
            return _empty_tag_database_payload()

        source_signature = _build_source_file_signature(self.excel_path)
        disk_cached_payload = _load_tag_database_disk_cache(self.excel_path, source_signature)
        if disk_cached_payload is not None:
            self._last_cache_hit = True
            _store_tag_database_memory_cache(cache_key, disk_cached_payload)
            print(f"[DanbooruTagToolkit] Tag database cache loaded: {len(disk_cached_payload.get('tag_db', {}))} tags")
            return disk_cached_payload

        try:
            df = _read_tag_database_table(self.excel_path)
            column_names = [str(name or "").strip() for name in df.columns]
            column_index = {name: idx for idx, name in enumerate(column_names)}

            tag_db = {}
            source_category_aliases: Dict[str, str] = {}
            source_subcategory_aliases: Dict[str, str] = {}
            seen_source_categories = set()
            seen_source_subcategories = set()
            #遍历每一行，构建哈希表查询
            for rank, row in enumerate(df.itertuples(index=False, name=None)):
                #清洗，转小写、去空格
                eng_tag = _clean_sheet_text(_get_table_cell(row, column_index, 'english')).lower()
                category_legacy = _clean_sheet_text(_get_table_cell(row, column_index, 'category'))
                subcategory_legacy = _clean_sheet_text(_get_table_cell(row, column_index, 'subcategory'))
                category_key = _clean_sheet_text(_get_table_cell(row, column_index, 'category_key')) or category_legacy
                subcategory_key = _clean_sheet_text(_get_table_cell(row, column_index, 'subcategory_key')) or subcategory_legacy
                category_zh = _clean_sheet_text(_get_table_cell(row, column_index, 'category_zh')) or category_legacy
                category_en = _clean_sheet_text(_get_table_cell(row, column_index, 'category_en')) or category_zh or category_key
                subcategory_zh = _clean_sheet_text(_get_table_cell(row, column_index, 'subcategory_zh')) or subcategory_legacy
                subcategory_en = _clean_sheet_text(_get_table_cell(row, column_index, 'subcategory_en')) or subcategory_zh or subcategory_key
                if not eng_tag:
                    continue

                #所有的下划线都替换为空格以匹配输入习惯
                clean_key = eng_tag.replace('_', ' ')
                tag_db[clean_key] = {
                    'original': eng_tag,
                    'original_category': category_key,
                    'original_subcategory': subcategory_key,
                    'rank': rank,
                }

                normalized_category = _normalize_lookup_text(category_key)
                if normalized_category and normalized_category not in seen_source_categories:
                    seen_source_categories.add(normalized_category)
                    source_category_aliases.update(
                        _build_source_alias_map(category_key, category_legacy, category_zh, category_en)
                    )

                normalized_subcategory = _normalize_lookup_text(subcategory_key)
                if normalized_subcategory and normalized_subcategory not in seen_source_subcategories:
                    seen_source_subcategories.add(normalized_subcategory)
                    source_subcategory_aliases.update(
                        _build_source_alias_map(subcategory_key, subcategory_legacy, subcategory_zh, subcategory_en)
                    )
            print(f"[DanbooruTagToolkit] Tag database loaded: {len(tag_db)} tags")

            # 存入全局缓存dict
            cache_payload = {
                "tag_db": tag_db,
                "source_category_aliases": source_category_aliases,
                "source_subcategory_aliases": source_subcategory_aliases,
            }
            _save_tag_database_disk_cache(self.excel_path, source_signature, cache_payload)
            _store_tag_database_memory_cache(cache_key, cache_payload)
            return cache_payload
        except Exception as e:
            print(f"[DanbooruTagToolkit] Failed to read tag database: {e}")
            return _empty_tag_database_payload()

    # 处理输入的Prompt字符串
    def process_tags(self, raw_string, add_category_comment=True,
                     regex_blacklist="", tag_blacklist="",
                     deduplicate=False):
        raw_string = _extract_tags_text_from_payload(raw_string)
        # 拆分输入字符串转列表
        input_tags = [t.strip() for t in raw_string.split(',') if t.strip()]

        # 去重
        if deduplicate and input_tags:
            seen = set()
            unique_tags = []
            for tag in input_tags:
                tag_lower = tag.lower()
                if tag_lower not in seen:
                    seen.add(tag_lower)
                    unique_tags.append(tag)
            input_tags = unique_tags

        # 精确匹配黑名单
        exact_blacklist_set = set()
        if tag_blacklist:
            exact_blacklist_set = {
                _unescape_comfy_parentheses(t.strip()).lower()
                for t in tag_blacklist.split(',')
                if t.strip()
            }

        # 正则匹配黑名单
        regex_pattern = None
        if regex_blacklist:
            try:
                regex_pattern = re.compile(regex_blacklist, re.IGNORECASE)
            except re.error as e:
                print(f"[DanbooruTagToolkit] Invalid regex_blacklist pattern: {e}")
        #初始化分类桶
        new_category_buckets = defaultdict(list)
        unmatched_tags = []

        allowed_categories_set = set(self.new_category_order)
        # 遍历每一个输入tag进行匹配
        for tag in input_tags:
            tag_clean = tag.strip()
            if _is_metadata_like_token(tag_clean):
                continue
            tag_for_lookup = _unescape_comfy_parentheses(tag_clean)
            tag_for_output = _escape_unescaped_parentheses(tag_clean)
            tag_lower = tag_for_lookup.lower()
            # 黑名单check
            if (tag_lower in exact_blacklist_set or
                    (regex_pattern and regex_pattern.search(tag_for_lookup))):
                continue
            lookup_key = tag_lower.replace('_', ' ')  # 构造查询Key
            if lookup_key in self.tag_db:  # 缓存命中
                info = self.tag_db[lookup_key]
                group_key = self.get_new_category(
                    info.get('original_category', ''),
                    info.get('original_subcategory', '')
                )
                # 检查该分类是否在Order列表中
                if group_key in allowed_categories_set:
                    # 如果在Order里就正常归类
                    new_category_buckets[group_key].append((info['rank'], tag_for_output))
                else:
                    # 如果mapping有这个分类，但order里被删除了，视为未匹配，归入Default
                    unmatched_tags.append(tag_for_output)
            else:
                # 缓存未命中就丢到未匹配列表
                unmatched_tags.append(tag_for_output)

        #构建输出
        #categorized_tags给Getter节点用
        categorized_tags = {}
        for category in self.new_category_order:
            categorized_tags[category] = ""
        final_lines = []

        #将列表转为"tag1, tag2, "格式
        def format_tag_list(tag_list):
            if not tag_list:
                return ""
            else:
                return ", ".join(tag_list) + ", "

        # 按照用户定义的顺序new_category_order组装
        for category in self.new_category_order:
            if category in new_category_buckets:
                # 组内排序，根据数据库中的rank排序
                items = sorted(new_category_buckets[category], key=lambda x: x[0])
                current_tags_list = [item[1] for item in items]
                tags_str = format_tag_list(current_tags_list)
                categorized_tags[category] = tags_str  # 存入dict
                # 拼接最终
                if add_category_comment:
                    final_lines.append(
                        f"{_get_output_category_label(category, self.output_category_labels, self.comment_language)}:"
                    )
                final_lines.append(tags_str)
                # 处理完后从桶中删除，后续可以处理剩余分类
                del new_category_buckets[category]
        # 上面的循环保证只有order中的Key会进桶，不需要再把order之外的Key追加到末尾了
        # 处理完全未匹配的Tags (包含数据库没找到的，以及被从Order里踢出去的)
        if unmatched_tags:
            unmatched_str = format_tag_list(unmatched_tags)
            target_unk = self.default_category
            if target_unk not in categorized_tags:
                categorized_tags[target_unk] = ""
            categorized_tags[target_unk] += unmatched_str  #追加到默认
            if add_category_comment:
                final_lines.append(
                    f"{_get_output_category_label(target_unk, self.output_category_labels, self.comment_language)}:"
                )
            final_lines.append(unmatched_str)
        return "\n".join(final_lines), categorized_tags


class DanbooruTagSorterSelectorNode:
    """
    一体式节点：
    - 内部先执行 Danbooru tag 分类
    - 再执行可视化多选合并
    - 首次运行即可得到输出，不依赖“先跑一遍再选择”
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                # 保持 Comfy 原生输入框 + 可连线，同时避免旧 workflow 因“必填缺失”校验失败
                "tags": ("STRING", {"multiline": True, "default": "", "placeholder": "1girl, solo..."}),
                "excel_file": ("STRING", {"multiline": False, "default": "danbooru_tags.xlsx"}),
                "category_mapping": ("STRING", {
                    "multiline": True,
                    "default": DEFAULT_MAPPING_TEXT,
                    "placeholder": CATEGORY_MAPPING_PLACEHOLDER
                }),
                "new_category_order": ("STRING", {
                    "multiline": True,
                    "default": DEFAULT_ORDER_TEXT,
                    "placeholder": CATEGORY_ORDER_PLACEHOLDER
                }),
                "config_profile": ("STRING", {"multiline": False, "default": ""}),
                "default_category": ("STRING", {"default": "未归类词"}),
                "regex_blacklist": ("STRING", {"default": ""}),
                "tag_blacklist": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "这里输入不想输出的tag喵...基础语法是 “tag1, tag2,” 喵..."
                }),
                "deduplicate_tags": ("BOOLEAN", {"default": False, "label": "分类前去重"}),
                "validation": ("BOOLEAN", {"default": True, "label": "配置校验"}),
                "force_reload": ("BOOLEAN", {"default": False, "label": "强制重载"}),
                "is_comment": ("BOOLEAN", {"default": True, "label": "保留分类注释"}),

                "prefix_text": ("STRING", {"default": "", "multiline": True}),
                "separator": (SEPARATOR_OPTIONS, {"default": "comma"}),
                "use_all_when_empty": ("BOOLEAN", {"default": True, "label": "空选时输出全部"}),
                "deduplicate_selected": ("BOOLEAN", {"default": True, "label": "选择结果去重"}),
                "keep_trailing_comma": ("BOOLEAN", {"default": True, "label": "尾部逗号"}),
                # 用 optional + 前端隐藏，确保会随 workflow 序列化并传入后端
                "selected_tags_json": ("STRING", {"default": "[]", "multiline": True}),
                "selected_categories_json": ("STRING", {"default": "[]", "multiline": True}),
                "manual_category_tags_json": ("STRING", {"default": "{}", "multiline": True}),
                "selected_category_weights_json": ("STRING", {"default": "{}", "multiline": True}),
                "selected_tag_weights_json": ("STRING", {"default": "{}", "multiline": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("SELECTED_TAGS", "SELECTED_WITH_PREFIX", "ALL_TAGS")
    FUNCTION = "process_and_select"
    CATEGORY = "Danbooru Toolkit/Integrated"

    def process_and_select(
        self,
        tags="",
        excel_file="danbooru_tags.xlsx",
        category_mapping="",
        new_category_order="",
        config_profile="",
        default_category="未归类词",
        regex_blacklist="",
        tag_blacklist="",
        deduplicate_tags=False,
        validation=True,
        force_reload=False,
        is_comment=True,
        prefix_text="",
        separator="comma",
        use_all_when_empty=True,
        deduplicate_selected=True,
        keep_trailing_comma=True,
        selected_tags_json="[]",
        selected_categories_json="[]",
        manual_category_tags_json="{}",
        selected_category_weights_json="{}",
        selected_tag_weights_json="{}",
        unique_id=None,
    ):
        all_str, cat_dict, _, _, _, output_category_labels = _execute_sorting(
            tags=tags,
            excel_file=excel_file,
            category_mapping=category_mapping,
            new_category_order=new_category_order,
            default_category=default_category,
            regex_blacklist=regex_blacklist,
            tag_blacklist=tag_blacklist,
            deduplicate_tags=deduplicate_tags,
            validation=validation,
            force_reload=force_reload,
            is_comment=is_comment,
        )

        selected_text, normalized_bundle = _select_from_bundle(
            tag_bundle=cat_dict,
            selected_tags_json=selected_tags_json,
            selected_categories_json=selected_categories_json,
            manual_category_tags_json=manual_category_tags_json,
            selected_category_weights_json=selected_category_weights_json,
            selected_tag_weights_json=selected_tag_weights_json,
            separator=separator,
            use_all_when_empty=use_all_when_empty,
            deduplicate_selected=deduplicate_selected,
            keep_trailing_comma=keep_trailing_comma,
        )

        if unique_id is not None:
            _latest_tag_bundle_by_node[str(unique_id)] = {
                "categories": normalized_bundle,
                "category_labels": output_category_labels,
            }

        prefix_text = str(prefix_text or "").strip()
        if prefix_text and selected_text:
            if separator == "newline":
                final_text = f"{prefix_text}\n{selected_text}"
            elif separator == "space":
                final_text = f"{prefix_text} {selected_text}"
            else:
                final_text = f"{prefix_text}, {selected_text}"
        elif prefix_text:
            final_text = prefix_text
        else:
            final_text = selected_text

        return (selected_text, final_text, all_str)


class DanbooruTagGalleryLiteNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {},
            "hidden": {
                "selection_data": ("STRING", {"default": "{}", "multiline": True, "forceInput": True}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("images", "prompts", "merged_prompt")
    OUTPUT_IS_LIST = (True, True, False)
    FUNCTION = "get_selected_data"
    CATEGORY = "Danbooru Toolkit/Gallery"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, selection_data="{}", **kwargs):
        return selection_data

    def get_selected_data(self, selection_data="{}", **kwargs):
        if not selection_data or selection_data == "{}":
            return ([_empty_image_tensor()], [""], "")

        try:
            payload = json.loads(selection_data)
        except Exception:
            return ([_empty_image_tensor()], [""], "")

        selections: List[Dict[str, Any]] = []
        if isinstance(payload, dict):
            if isinstance(payload.get("selections"), list):
                selections = [
                    item for item in payload.get("selections", [])
                    if isinstance(item, dict) and str(item.get("post_id", "")).strip()
                ]
            elif str(payload.get("post_id", "")).strip():
                selections = [payload]
        elif isinstance(payload, list):
            selections = [
                item for item in payload
                if isinstance(item, dict) and str(item.get("post_id", "")).strip()
            ]

        if not selections:
            return ([_empty_image_tensor()], [""], "")

        # 可选安全阈值：当 _GALLERY_OUTPUT_SELECTION_LIMIT > 0 时限制输出数量。
        if _GALLERY_OUTPUT_SELECTION_LIMIT > 0 and len(selections) > _GALLERY_OUTPUT_SELECTION_LIMIT:
            selections = selections[-_GALLERY_OUTPUT_SELECTION_LIMIT:]

        images: List[torch.Tensor] = []
        prompts: List[str] = []

        for item in selections:
            if not isinstance(item, dict):
                continue

            prompt = str(item.get("prompt", "") or "").strip()
            if not prompt:
                prompt = _tag_string_to_prompt(item.get("tag_string", ""))

            candidates: List[str] = []
            image_url = str(item.get("image_url", "") or "").strip()
            preview_url = str(item.get("preview_url", "") or "").strip()
            if image_url:
                candidates.append(image_url)
            if preview_url:
                candidates.append(preview_url)
            if not candidates:
                continue

            loaded_tensor = None
            for url in candidates:
                try:
                    loaded_tensor = _get_cached_gallery_image_tensor(url)
                    break
                except Exception:
                    loaded_tensor = None

            if loaded_tensor is None:
                print(f"[DanbooruTagToolkit] Gallery item skipped (all image urls failed): {candidates}")
                continue

            images.append(loaded_tensor)
            prompts.append(prompt)

        if not images:
            return ([_empty_image_tensor()], [""], "")

        normalized_prompts = [
            _escape_unescaped_parentheses(str(p or "").strip()) if str(p or "").strip() else ""
            for p in prompts
        ]
        merged_prompt_tags: List[str] = []
        seen_prompt_tags = set()
        for prompt in normalized_prompts:
            for raw_tag in _parse_tag_string(prompt):
                tag = _escape_unescaped_parentheses(str(raw_tag or "").strip())
                if not tag:
                    continue
                key = _unescape_comfy_parentheses(tag).lower()
                if key in seen_prompt_tags:
                    continue
                seen_prompt_tags.add(key)
                merged_prompt_tags.append(tag)
        merged_prompt = ", ".join(merged_prompt_tags)
        return (images, normalized_prompts, merged_prompt)


# Selector 前端拉取最新 TAG_BUNDLE 的 API
class DanbooruTagSpecificCleanerNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tags": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "jacket, white jacket, pantyhose, black pantyhose",
                }),
            },
            "optional": {
                "preserve_tags": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Optional whitelist: 1girl, jacket",
                }),
                "match_singular_plural": ("BOOLEAN", {"default": True}),
                "min_prefix_words": ("INT", {"default": 1, "min": 1, "max": 4, "step": 1}),
                "keep_trailing_comma": ("BOOLEAN", {"default": False}),
            },
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("cleaned_prompt", "removed_tags", "cleaned_prompt_list", "removed_tags_list")
    OUTPUT_IS_LIST = (False, False, True, True)
    FUNCTION = "clean_tags"
    CATEGORY = "Danbooru Toolkit/Filter"

    def clean_tags(
        self,
        tags,
        preserve_tags="",
        match_singular_plural=True,
        min_prefix_words=1,
        keep_trailing_comma=False,
    ):
        prompt_items = tags if isinstance(tags, list) else [tags]
        preserve_tags_text = str(_unwrap_list_input(preserve_tags, "") or "")
        use_plural_matching = _as_bool(_unwrap_list_input(match_singular_plural, True), True)
        keep_trailing = _as_bool(_unwrap_list_input(keep_trailing_comma, False), False)

        try:
            prefix_words = int(_unwrap_list_input(min_prefix_words, 1) or 1)
        except Exception:
            prefix_words = 1
        prefix_words = max(1, min(4, prefix_words))

        cleaned_prompt_list: List[str] = []
        removed_tags_list: List[str] = []

        for prompt_text in prompt_items:
            result = _clean_specificity_prompt(
                raw_prompt=prompt_text,
                preserve_tags_text=preserve_tags_text,
                match_singular_plural=use_plural_matching,
                min_prefix_words=prefix_words,
                keep_trailing_comma=keep_trailing,
            )
            cleaned_prompt_list.append(result["cleaned_prompt"])
            removed_tags_list.append(result["removed_prompt"])

        merged_cleaned_prompt = _merge_tag_prompt_texts(cleaned_prompt_list, keep_trailing_comma=keep_trailing)
        merged_removed_tags = _merge_tag_prompt_texts(removed_tags_list, keep_trailing_comma=False)
        return (merged_cleaned_prompt, merged_removed_tags, cleaned_prompt_list, removed_tags_list)


# Selector API for latest TAG_BUNDLE
if PromptServer is not None and web is not None:
    try:
        @PromptServer.instance.routes.get("/danbooru_tag_picker/latest")
        async def get_latest_bundle_for_selector(request):
            node_id = str(request.query.get("node_id", "")).strip()
            payload = _latest_tag_bundle_by_node.get(node_id, {}) if node_id else {}
            categories = payload.get("categories", {}) if isinstance(payload, dict) else {}
            category_labels = payload.get("category_labels", {}) if isinstance(payload, dict) else {}
            return web.json_response({
                "status": "success",
                "node_id": node_id,
                "categories": categories,
                "category_labels": category_labels,
                "category_count": len(categories),
            })

        @PromptServer.instance.routes.post("/danbooru_tag_picker/preview")
        async def preview_bundle_for_selector(request):
            try:
                data = await request.json()
                node_id = str(data.get("node_id", "")).strip()

                tags = str(data.get("tags", ""))
                excel_file = str(data.get("excel_file", "danbooru_tags.xlsx"))
                category_mapping = data.get("category_mapping", DEFAULT_MAPPING_TEXT)
                new_category_order = data.get("new_category_order", DEFAULT_ORDER_TEXT)
                default_category = str(data.get("default_category", "未归类词"))
                regex_blacklist = str(data.get("regex_blacklist", ""))
                tag_blacklist = str(data.get("tag_blacklist", ""))
                deduplicate_tags = _as_bool(data.get("deduplicate_tags", False), False)
                validation = _as_bool(data.get("validation", True), True)
                force_reload = _as_bool(data.get("force_reload", False), False)
                is_comment = _as_bool(data.get("is_comment", True), True)

                all_str, cat_dict, _, _, _, output_category_labels = _execute_sorting(
                    tags=tags,
                    excel_file=excel_file,
                    category_mapping=category_mapping,
                    new_category_order=new_category_order,
                    default_category=default_category,
                    regex_blacklist=regex_blacklist,
                    tag_blacklist=tag_blacklist,
                    deduplicate_tags=deduplicate_tags,
                    validation=validation,
                    force_reload=force_reload,
                    is_comment=is_comment,
                )

                normalized = _normalize_bundle_for_ui(cat_dict)
                if node_id:
                    _latest_tag_bundle_by_node[node_id] = {
                        "categories": normalized,
                        "category_labels": output_category_labels,
                    }

                return web.json_response({
                    "status": "success",
                    "node_id": node_id,
                    "categories": normalized,
                    "category_labels": output_category_labels,
                    "all_tags": all_str,
                    "category_count": len(normalized),
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                    "categories": {},
                    "all_tags": "",
                }, status=500)

        @PromptServer.instance.routes.get("/danbooru_tag_picker/excel_files")
        async def list_excel_files_for_selector(request):
            try:
                files = _list_available_tag_files()
                return web.json_response({
                    "status": "success",
                    "files": files,
                    "count": len(files),
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                    "files": [],
                    "count": 0,
                }, status=500)

        @PromptServer.instance.routes.get("/danbooru_tag_picker/profile/list")
        async def list_sorter_profiles(request):
            try:
                names = _list_sorter_presets()
                return web.json_response({
                    "status": "success",
                    "profiles": names,
                    "count": len(names),
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                    "profiles": [],
                    "count": 0,
                }, status=500)

        @PromptServer.instance.routes.get("/danbooru_tag_picker/profile/load")
        async def load_sorter_profile(request):
            try:
                name = str(request.query.get("name", "")).strip()
                data = _load_sorter_preset(name)
                return web.json_response({
                    "status": "success",
                    "profile": data,
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                    "profile": {},
                }, status=400)

        @PromptServer.instance.routes.post("/danbooru_tag_picker/profile/save")
        async def save_sorter_profile(request):
            try:
                body = await request.json()
                name = _normalize_preset_name(body.get("name", ""))
                if not name:
                    return web.json_response({
                        "status": "error",
                        "message": "Invalid profile name",
                    }, status=400)
                saved_name = _save_sorter_preset(name, body if isinstance(body, dict) else {})
                return web.json_response({
                    "status": "success",
                    "profile_name": saved_name,
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                }, status=500)

        @PromptServer.instance.routes.get("/danbooru_tag_gallery/posts")
        async def get_posts_for_gallery(request):
            try:
                tags = str(request.query.get("tags", "")).strip()
                rating = str(request.query.get("rating", "safe")).strip().lower()

                try:
                    limit = int(request.query.get("limit", 20))
                except Exception:
                    limit = 20
                try:
                    page = int(request.query.get("page", 1))
                except Exception:
                    page = 1

                limit = max(1, min(limit, 100))
                page = max(1, min(page, 1000))

                posts = _fetch_gallery_posts(tags=tags, limit=limit, page=page, rating=rating)
                return web.json_response({
                    "status": "success",
                    "posts": posts,
                    "count": len(posts),
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                    "posts": [],
                    "count": 0,
                }, status=500)

        @PromptServer.instance.routes.get("/danbooru_tag_gallery/autocomplete")
        async def get_autocomplete_for_gallery(request):
            try:
                query = str(request.query.get("q", "")).strip()
                try:
                    limit = int(request.query.get("limit", 20))
                except Exception:
                    limit = 20
                limit = max(1, min(limit, 50))

                items = _fetch_gallery_autocomplete(query=query, limit=limit)
                return web.json_response({
                    "status": "success",
                    "items": items,
                    "count": len(items),
                })
            except Exception as e:
                return web.json_response({
                    "status": "error",
                    "message": str(e),
                    "items": [],
                    "count": 0,
                }, status=500)

        @PromptServer.instance.routes.get("/danbooru_tag_gallery/cache/stats")
        async def get_gallery_cache_stats(request):
            _cleanup_expired_cache_items(_gallery_image_cache, _GALLERY_IMAGE_CACHE_TTL)
            return web.json_response({
                "status": "success",
                "stats": {
                    "post_cache": len(_gallery_post_cache),
                    "image_cache": len(_gallery_image_cache),
                    "autocomplete_cache": len(_gallery_autocomplete_cache),
                    "image_cache_limit": _GALLERY_IMAGE_CACHE_LIMIT,
                    "image_cache_ttl_sec": _GALLERY_IMAGE_CACHE_TTL,
                },
            })

        @PromptServer.instance.routes.post("/danbooru_tag_gallery/cache/clear")
        async def clear_gallery_cache(request):
            _gallery_post_cache.clear()
            _gallery_image_cache.clear()
            _gallery_autocomplete_cache.clear()
            return web.json_response({
                "status": "success",
                "message": "Gallery cache cleared.",
                "stats": {
                    "post_cache": 0,
                    "image_cache": 0,
                    "autocomplete_cache": 0,
                },
            })
    except Exception as e:
        print(f"[DanbooruTagToolkit] Failed to register selector API routes: {e}")


# Registration 我的回合！注册！
NODE_CLASS_MAPPINGS = {
    "DanbooruTagSorterSelectorNode": DanbooruTagSorterSelectorNode,
    "DanbooruTagGalleryLiteNode": DanbooruTagGalleryLiteNode,
    "DanbooruTagSpecificCleanerNode": DanbooruTagSpecificCleanerNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruTagSorterSelectorNode": "Danbooru Tag Toolkit - All-in-One",
    "DanbooruTagGalleryLiteNode": "Danbooru Tag Toolkit - Danbooru Gallery Lite",
    "DanbooruTagSpecificCleanerNode": "Danbooru Tag Toolkit - Specific Tag Cleaner",
}

# 都看到这里了球球给我点点Star吧...(哭

