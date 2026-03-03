import pandas as pd
from collections import defaultdict
import os
import ast
import hashlib
import json
import re
import io
import time
import urllib.parse
import urllib.request
import torch
import comfy
import numpy as np
from PIL import Image
from typing import Dict, List, Any

try:
    from server import PromptServer
    from aiohttp import web
except Exception:
    PromptServer = None
    web = None

_tag_cache = {}
_latest_tag_bundle_by_node: Dict[str, Dict[str, List[str]]] = {}
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


def load_defaults_from_json():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(current_dir, "defaults_config.json")

    fallback_mapping = "{}"
    fallback_order = "[]"

    if not os.path.exists(config_path):
        print(f"[DanbooruTagToolkit] Warning喵：未找到配置文件{config_path}喵，将使用空默认值喵。")
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

        print(f"Sorter成功加载配置文件喵: {config_path}")
        return default_mapping_text, default_order_text

    except Exception as e:
        print(f"Sorter读取配置文件失败喵，请检查defaults_config.json路径及语法是否正确喵: {e}")
        return fallback_mapping, fallback_order


# 节点加载时先运行一次初始化默认值
DEFAULT_MAPPING_TEXT, DEFAULT_ORDER_TEXT = load_defaults_from_json()

CATEGORY_MAPPING_PLACEHOLDER = (
    "示例1（精确元组）:\n"
    '{("人物","对象"): "人物对象词"}\n\n'
    "示例2（仅大类）:\n"
    '{"人物": "人物对象词"}\n\n'
    "示例3（大类通配）:\n"
    '{("服饰","*"): "服饰词"}\n\n'
    "可混合使用，优先级: (大类,子类) > 大类 > (大类,*)"
)

CATEGORY_ORDER_PLACEHOLDER = (
    "支持三种写法:\n"
    '1) JSON: ["背景词","人物对象词","未归类词"]\n'
    "2) Python: ['背景词','人物对象词','未归类词']\n"
    "3) 每行一个分类:\n"
    "背景词\n"
    "人物对象词\n"
    "未归类词"
)


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
        category_key = str(category)
        if isinstance(raw_tags, list):
            tags = [str(t).strip() for t in raw_tags if str(t).strip()]
        else:
            tags = _parse_tag_string(str(raw_tags))
        normalized[category_key] = tags
    return normalized


def _safe_parse_json_list(raw_value: Any, fallback: List[str] = None) -> List[str]:
    if fallback is None:
        fallback = []
    if isinstance(raw_value, list):
        return [str(i).strip() for i in raw_value if str(i).strip()]
    if not isinstance(raw_value, str):
        return fallback
    text = raw_value.strip()
    if not text:
        return fallback
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return [str(i).strip() for i in data if str(i).strip()]
    except Exception:
        pass
    return fallback


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
    返回 (all_str, cat_dict, final_excel_path, cat_map, cat_order)。
    """
    t0 = time.perf_counter()
    default_category = str(default_category or "").strip() or "未归类词"
    final_excel_path = _resolve_excel_path(excel_file)

    cat_map = _parse_input_data(category_mapping, DEFAULT_MAPPING_TEXT, dict)
    parsed_order = _parse_input_data(new_category_order, DEFAULT_ORDER_TEXT, list)
    cat_order = _build_category_order(parsed_order, default_category)
    t1 = time.perf_counter()

    if validation:
        used = set(cat_map.values())
        defined = set(cat_order)
        missing = used - defined
        if missing:
            print(
                f"[DanbooruTagToolkit] Validation warning: mapping中存在未在order定义的分类 {list(missing)}，"
                f"这些tag会在排序阶段落入默认分类 {default_category!r}。"
            )

    if force_reload:
        global _tag_cache
        _tag_cache.clear()
    t2 = time.perf_counter()

    sorter = DanbooruTagSorter(final_excel_path, cat_map, cat_order, default_category)
    t3 = time.perf_counter()
    all_str, cat_dict = sorter.process_tags(
        tags,
        is_comment,
        regex_blacklist,
        tag_blacklist,
        deduplicate_tags
    )
    t4 = time.perf_counter()
    for category in cat_order:
        cat_dict.setdefault(category, "")
    t5 = time.perf_counter()
    try:
        print(
            "[DanbooruTagToolkit] Sorting timing: "
            f"parse={((t1 - t0) * 1000):.1f}ms, "
            f"reload_check={((t2 - t1) * 1000):.1f}ms, "
            f"sorter_init={((t3 - t2) * 1000):.1f}ms, "
            f"process={((t4 - t3) * 1000):.1f}ms, "
            f"post={((t5 - t4) * 1000):.1f}ms, "
            f"total={((t5 - t0) * 1000):.1f}ms, "
            f"cache_hit={getattr(sorter, '_last_cache_hit', None)}, "
            f"tags_chars={len(str(tags or ''))}"
        )
    except Exception:
        pass
    return all_str, cat_dict, final_excel_path, cat_map, cat_order


def _select_from_bundle(
    tag_bundle: Dict[str, Any],
    selected_tags_json: Any,
    selected_categories_json: Any,
    separator: str,
    use_all_when_empty: bool,
    deduplicate_selected: bool,
    keep_trailing_comma: bool,
):
    normalized_bundle = _normalize_bundle_for_ui(tag_bundle)
    selected_list = _safe_parse_json_list(selected_tags_json, [])
    selected_categories = _safe_parse_json_list(selected_categories_json, [])
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
    for _, tags in normalized_bundle.items():
        for tag in tags:
            key = tag.lower()
            if key not in available_map:
                available_map[key] = tag
                all_tags.append(tag)

    category_name_map: Dict[str, str] = {}
    for category in normalized_bundle.keys():
        normalized_key = str(category).strip().lower()
        if normalized_key and normalized_key not in category_name_map:
            category_name_map[normalized_key] = category

    resolved_categories: List[str] = []
    for category in selected_categories:
        normalized_key = str(category).strip().lower()
        if normalized_key in category_name_map:
            resolved_categories.append(category_name_map[normalized_key])

    if selected_list:
        merged_tags = []
        for item in selected_list:
            normalized_item = _unescape_comfy_parentheses(item).strip().lower()
            if normalized_item in available_map:
                merged_tags.append(available_map[normalized_item])
            else:
                fallback_tag = _escape_unescaped_parentheses(str(item).strip())
                if fallback_tag:
                    merged_tags.append(fallback_tag)
    elif resolved_categories:
        merged_tags = []
        for category in resolved_categories:
            merged_tags.extend(normalized_bundle.get(category, []))
    elif use_all_when_empty:
        merged_tags = list(all_tags)
    else:
        merged_tags = []

    if merged_tags:
        merged_tags = [
            _escape_unescaped_parentheses(str(tag).strip())
            for tag in merged_tags
            if str(tag).strip()
        ]

    if deduplicate_selected and merged_tags:
        seen = set()
        deduplicated = []
        for tag in merged_tags:
            key = _unescape_comfy_parentheses(tag).lower()
            if key in seen:
                continue
            seen.add(key)
            deduplicated.append(tag)
        merged_tags = deduplicated

    sep_map = {
        "comma": ", ",
        "newline": "\n",
        "space": " ",
    }
    joiner = sep_map.get(normalized_separator, ", ")
    selected_text = joiner.join(merged_tags) if merged_tags else ""

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


def _fetch_gallery_posts(tags: str, limit: int, page: int, rating: str = "all") -> List[Dict[str, Any]]:
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
    def __init__(self, excel_path, category_mapping, new_category_order, default_category="未归类词"):
        self.excel_path = excel_path
        self.category_mapping = category_mapping  # 映射规则 {('原有大类', '原有小类'): '新分类名'}
        self.new_category_order = new_category_order  # 定义输出时各个分类及各个分类的顺序
        self.default_category = default_category
        self._last_cache_hit = False
        self.tag_db = self._load_database_with_cache()  # 初始化立刻先尝试加载或从缓存获取数据库

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
        abs_excel_path = os.path.abspath(self.excel_path or "")
        params = {
            "excel_path": abs_excel_path,
        }
        try:
            st = os.stat(abs_excel_path)
            params["excel_mtime_ns"] = int(st.st_mtime_ns)
            params["excel_size"] = int(st.st_size)
        except Exception:
            pass
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
            print(f"从缓存加载数据库喵:{self.excel_path}")
            return _tag_cache[cache_key]
        self._last_cache_hit = False
        print(f"正在读取数据库喵:{self.excel_path} ...")  # 如果缓存未命中，则读取数据库

        # 基础校验
        if not self.excel_path or not os.path.exists(self.excel_path):
            print(f"警告喵：找不到文件或路径为空喵 {self.excel_path}")
            return {}

        try:
            #读取csv或者excel文件
            if self.excel_path.endswith('.csv'):
                df = pd.read_csv(self.excel_path)
            else:
                df = pd.read_excel(self.excel_path)

            tag_db = {}
            #遍历每一行，构建哈希表查询
            for index, row in df.iterrows():
                #清洗，转小写、去空格
                eng_tag = _clean_sheet_text(row.get('english', '')).lower()
                cat = _clean_sheet_text(row.get('category', ''))
                sub = _clean_sheet_text(row.get('subcategory', ''))
                if not eng_tag:
                    continue

                #所有的下划线都替换为空格以匹配输入习惯
                clean_key = eng_tag.replace('_', ' ')
                tag_db[clean_key] = {
                    'original': eng_tag,
                    'original_category': cat,
                    'original_subcategory': sub,
                    'rank': index
                }
            print(f"数据库加载完成喵，共索引{len(tag_db)}个 Tags喵。")

            # 存入全局缓存dict
            _tag_cache[cache_key] = tag_db
            return tag_db
        except Exception as e:
            print(f"读取数据库文件失败喵，请检查路径是否填写正确喵: {e}")
            return {}

    # 处理输入的Prompt字符串
    def process_tags(self, raw_string, add_category_comment=True,
                     regex_blacklist="", tag_blacklist="",
                     deduplicate=False):
        raw_string = _extract_tags_text_from_payload(raw_string)
        print(
            f"[DanbooruTagToolkit] Sorter input debug: chars={len(raw_string)}, "
            f"preview={raw_string[:120]!r}"
        )
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
                print(f"正则表达式写错了喵:{e}")
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
                    final_lines.append(f"{category}:")  # 添加 "新分类名:" 注释
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
                final_lines.append(f"{target_unk}:")
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
        unique_id=None,
    ):
        all_str, cat_dict, _, _, _ = _execute_sorting(
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
            separator=separator,
            use_all_when_empty=use_all_when_empty,
            deduplicate_selected=deduplicate_selected,
            keep_trailing_comma=keep_trailing_comma,
        )

        if unique_id is not None:
            _latest_tag_bundle_by_node[str(unique_id)] = normalized_bundle

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
        raw_count = len(selections)
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
        merged_prompt_list: List[str] = []
        seen_prompt = set()
        for prompt in normalized_prompts:
            text = str(prompt or "").strip()
            if not text:
                continue
            key = _unescape_comfy_parentheses(text).lower()
            if key in seen_prompt:
                continue
            seen_prompt.add(key)
            merged_prompt_list.append(text)
        merged_prompt = ", ".join(merged_prompt_list)
        first_prompt = normalized_prompts[0] if normalized_prompts else ""
        print(
            f"[DanbooruTagToolkit] Gallery output debug: raw_selections={raw_count}, "
            f"used={len(selections)}, prompts_out={len(prompts)}, "
            f"first_prompt_preview={first_prompt[:120]!r}"
        )
        return (images, normalized_prompts, merged_prompt)


# Selector 前端拉取最新 TAG_BUNDLE 的 API
if PromptServer is not None and web is not None:
    try:
        @PromptServer.instance.routes.get("/danbooru_tag_picker/latest")
        async def get_latest_bundle_for_selector(request):
            node_id = str(request.query.get("node_id", "")).strip()
            categories = _latest_tag_bundle_by_node.get(node_id, {})
            return web.json_response({
                "status": "success",
                "node_id": node_id,
                "categories": categories,
                "category_count": len(categories),
            })

        @PromptServer.instance.routes.post("/danbooru_tag_picker/preview")
        async def preview_bundle_for_selector(request):
            try:
                preview_t0 = time.perf_counter()
                data = await request.json()
                preview_t1 = time.perf_counter()
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

                all_str, cat_dict, _, _, _ = _execute_sorting(
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
                preview_t2 = time.perf_counter()
                if node_id:
                    _latest_tag_bundle_by_node[node_id] = normalized
                preview_t3 = time.perf_counter()
                try:
                    total_tags = sum(len(v) for v in normalized.values())
                    print(
                        "[DanbooruTagToolkit] Preview API timing: "
                        f"json={((preview_t1 - preview_t0) * 1000):.1f}ms, "
                        f"sort+normalize={((preview_t2 - preview_t1) * 1000):.1f}ms, "
                        f"cache_store={((preview_t3 - preview_t2) * 1000):.1f}ms, "
                        f"total={((preview_t3 - preview_t0) * 1000):.1f}ms, "
                        f"cats={len(normalized)}, tags={total_tags}, node={node_id or '-'}"
                    )
                except Exception:
                    pass

                return web.json_response({
                    "status": "success",
                    "node_id": node_id,
                    "categories": normalized,
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
                rating = str(request.query.get("rating", "all")).strip().lower()

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
        print(f"[DanbooruTagToolkit] selector API 注册失败: {e}")


# Registration 我的回合！注册！
NODE_CLASS_MAPPINGS = {
    "DanbooruTagSorterSelectorNode": DanbooruTagSorterSelectorNode,
    "DanbooruTagGalleryLiteNode": DanbooruTagGalleryLiteNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruTagSorterSelectorNode": "Danbooru Tag Toolkit - All-in-One",
    "DanbooruTagGalleryLiteNode": "Danbooru Tag Toolkit - Danbooru Gallery Lite",
}

# 都看到这里了球球给我点点Star吧...(哭

