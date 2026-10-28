"""Keep or drop whole categories of tags, in the order the categories are arranged.

The categories are the ones All-in-One uses: same danbooru_tags.xlsx, same default mapping and order from
defaults_config.json, so 服饰词 means the same set of tags in both nodes. Tags are grouped in the output by
the category order, which is what the node's draggable category list controls.
"""

import json
from typing import Any, Dict, List, Set, Tuple

from .node import (
    DEFAULT_MAPPING_TEXT,
    DEFAULT_ORDER_TEXT,
    DanbooruTagSorter,
    _build_category_order,
    _build_output_category_labels,
    _join_tag_text,
    _normalize_output_category_sequence,
    _parse_input_data,
    _parse_weighted_prompt_part,
    _resolve_excel_path,
    _split_top_level_prompt_parts,
    _unescape_comfy_parentheses,
)

TAG_DATABASE_FILE = "danbooru_tags.xlsx"
UNCATEGORIZED_KEY = "uncategorized_terms"


def _default_categories() -> List[Dict[str, Any]]:
    # The configured order holds labels; the sorter and this node both work in canonical keys such as
    # outfit_terms, so resolve them here once.
    keys = _normalize_output_category_sequence(_parse_input_data(DEFAULT_ORDER_TEXT, DEFAULT_ORDER_TEXT, list))
    if UNCATEGORIZED_KEY not in keys:
        keys.append(UNCATEGORIZED_KEY)
    labels = _build_output_category_labels([*keys, UNCATEGORIZED_KEY])
    return [
        {
            "key": key,
            "zh": str(labels.get(key, {}).get("zh") or key),
            "en": str(labels.get(key, {}).get("en") or key),
            "selected": True,
        }
        for key in keys
    ]


def _parse_categories(raw_value: Any) -> Tuple[List[str], Set[str]]:
    """Ordered category keys plus the selected subset. An unreadable list falls back to every category, so a
    broken workflow passes tags through instead of silently emptying the prompt."""
    try:
        payload = json.loads(str(raw_value or ""))
    except ValueError:
        payload = None

    order: List[str] = []
    selected: Set[str] = set()
    if isinstance(payload, list):
        for item in payload:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "").strip()
            if not key or key in order:
                continue
            order.append(key)
            if item.get("selected", True):
                selected.add(key)

    if order:
        return order, selected
    fallback = _default_categories()
    return [item["key"] for item in fallback], {item["key"] for item in fallback}


def _build_sorter() -> DanbooruTagSorter:
    mapping = _parse_input_data(DEFAULT_MAPPING_TEXT, DEFAULT_MAPPING_TEXT, dict)
    order = _build_category_order(_parse_input_data(DEFAULT_ORDER_TEXT, DEFAULT_ORDER_TEXT, list), UNCATEGORIZED_KEY)
    return DanbooruTagSorter(
        _resolve_excel_path(TAG_DATABASE_FILE),
        mapping,
        order,
        UNCATEGORIZED_KEY,
        output_category_labels=_build_output_category_labels([UNCATEGORIZED_KEY, *order, *mapping.values()]),
        comment_language="zh",
    )


def _category_of(part: str, sorter: DanbooruTagSorter) -> str:
    """Category of one prompt part. A weighted group counts as its first inner tag, and anything the database
    does not know lands in the uncategorized category, as it does in All-in-One."""
    weighted = _parse_weighted_prompt_part(part)
    entries = weighted["tags"] if weighted else [part]
    lookup = _unescape_comfy_parentheses(str(entries[0] if entries else "")).strip().lower().replace("_", " ")
    info = sorter.tag_db.get(lookup)
    if not info:
        return sorter.default_category
    return sorter.get_new_category(info.get("original_category", ""), info.get("original_subcategory", ""))


class DanbooruTagCategoryFilterNode:
    DESCRIPTION = (
        "Keeps or drops whole categories of tags and groups the output by category. Turn exclude_mode on to "
        "drop the selected categories instead of keeping them."
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
                "exclude_mode": ("BOOLEAN", {"default": False, "label": "排除模式（去掉选中的分类）"}),
            },
            "optional": {
                # Owned by Python and rendered by the frontend, so the category list cannot drift between the
                # two. Serialized with the workflow, which is where the selection and the order live.
                "categories_json": ("STRING", {
                    "multiline": True,
                    "default": json.dumps(_default_categories(), ensure_ascii=False),
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "removed_tags")
    FUNCTION = "filter_categories"
    CATEGORY = "Danbooru Toolkit/Filter"

    def filter_categories(self, prompt="", exclude_mode=False, categories_json=""):
        order, selected = _parse_categories(categories_json)
        sorter = _build_sorter()

        buckets: Dict[str, List[str]] = {key: [] for key in order}
        removed: List[str] = []
        for part in _split_top_level_prompt_parts(prompt):
            category = _category_of(part, sorter)
            keep = category not in selected if exclude_mode else category in selected
            if not keep:
                removed.append(part)
                continue
            buckets.setdefault(category, []).append(part)

        grouped = [part for key in order for part in buckets.get(key, [])]
        grouped.extend(part for key, parts in buckets.items() if key not in order for part in parts)
        return (_join_tag_text(grouped), _join_tag_text(removed))


NODE_CLASS_MAPPINGS = {
    "DanbooruTagCategoryFilterNode": DanbooruTagCategoryFilterNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruTagCategoryFilterNode": "Danbooru Tag Toolkit - Category Filter",
}
