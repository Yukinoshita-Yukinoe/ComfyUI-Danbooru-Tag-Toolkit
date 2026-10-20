import json
import os
import re
import threading
import time
from typing import Any, Dict, List, Tuple

import torch
import torch.nn.functional as F

import comfy.model_management
import comfy.utils
import folder_paths

try:
    from .vendor.pixai_tagger.tagger_pipeline import ViTDetCls, ViTDetClsConfig
except Exception as import_error:
    ViTDetCls = None
    ViTDetClsConfig = None
    PIXAI_IMPORT_ERROR = f"{type(import_error).__name__}: {import_error}"
else:
    PIXAI_IMPORT_ERROR = ""

TAGGER_FOLDER_NAME = "taggers"
TAGGER_INPUT_SIZE = 1008
MISSING_MODEL_ENTRY = "(no model in models/taggers)"
MAX_TAGS_PER_CATEGORY_LIMIT = 500
DEFAULT_EXCLUDE_CATEGORIES = "meta, rating"

# Per-category macro-F1 thresholds recommended by the model card.
TAGGER_CATEGORY_THRESHOLDS = {
    "general": 0.17,
    "character": 0.27,
    "copyright": 0.24,
    "style": 0.15,
    "meta": 0.17,
    "rating": 0.41,
}

# One loaded tagger at a time keeps VRAM predictable next to the diffusion model.
_tagger_models: Dict[str, Any] = {}
_tagger_lock = threading.Lock()

folder_paths.add_model_folder_path(TAGGER_FOLDER_NAME, os.path.join(folder_paths.models_dir, TAGGER_FOLDER_NAME))


def _first(value: Any) -> Any:
    # INPUT_IS_LIST hands every input over as a list; widgets carry a single value.
    while isinstance(value, (list, tuple)):
        if not value:
            return None
        value = value[0]
    return value


def _safetensors_in(model_dir: str) -> str:
    for name in sorted(os.listdir(model_dir)):
        if name.endswith(".safetensors"):
            return os.path.join(model_dir, name)
    return ""


def _is_tagger_model_dir(path: str) -> bool:
    return (
        os.path.isdir(path)
        and os.path.isfile(os.path.join(path, "config.json"))
        and bool(_safetensors_in(path))
    )


def _list_tagger_models() -> List[str]:
    names: List[str] = []
    for base_dir in folder_paths.get_folder_paths(TAGGER_FOLDER_NAME):
        if not os.path.isdir(base_dir):
            continue
        for name in sorted(os.listdir(base_dir)):
            if name in names:
                continue
            if _is_tagger_model_dir(os.path.join(base_dir, name)):
                names.append(name)
    return names


def _resolve_tagger_dir(model_name: str) -> str:
    name = str(model_name or "").strip()
    if not name or name != os.path.basename(name) or name in {".", ".."}:
        return ""
    for base_dir in folder_paths.get_folder_paths(TAGGER_FOLDER_NAME):
        candidate = os.path.join(base_dir, name)
        if _is_tagger_model_dir(candidate):
            return candidate
    return ""


def _pick_device(device: Any) -> torch.device:
    if str(device or "auto").strip().lower() == "cpu":
        return torch.device("cpu")
    return comfy.model_management.get_torch_device()


def _pick_dtype(dtype: Any, device: torch.device) -> torch.dtype:
    requested = str(dtype or "auto").strip().lower()
    if requested == "fp32":
        return torch.float32
    if requested == "fp16":
        return torch.float16
    if requested == "bf16":
        return torch.bfloat16
    if device.type != "cuda":
        return torch.float32
    return torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16


def _load_tagger(model_dir: str, device: torch.device, dtype: torch.dtype):
    cache_key = f"{model_dir}|{device}|{dtype}"
    loaded = _tagger_models.get(cache_key)
    if loaded is not None:
        return loaded

    _unload_tagger_models()
    started = time.perf_counter()
    config = ViTDetClsConfig.from_pretrained(model_dir)
    tagger = ViTDetCls.from_pretrained(model_dir, config=config, dtype=dtype)
    tagger.eval()
    # Inference only: ComfyUI already runs prompts inside torch.inference_mode, this keeps a 486M model
    # from building an autograd graph when the node runs outside that context.
    tagger.requires_grad_(False)
    tagger.to(device)
    _tagger_models[cache_key] = tagger
    print(
        f"[DanbooruTagToolkit] PixAI Tagger loaded {os.path.basename(model_dir)} "
        f"({str(dtype).replace('torch.', '')}) on {device} in {time.perf_counter() - started:.1f}s"
    )
    return tagger


def _unload_tagger_models() -> None:
    if not _tagger_models:
        return
    _tagger_models.clear()
    comfy.model_management.soft_empty_cache()


def _preprocess_image(image: torch.Tensor) -> torch.Tensor:
    # Mirrors the model's RescalePadProcessor: fit inside 1008x1008, center pad with black, normalize to [-1, 1].
    pixels = image.permute(2, 0, 1).unsqueeze(0).float()
    height, width = pixels.shape[-2:]
    if height != TAGGER_INPUT_SIZE or width != TAGGER_INPUT_SIZE:
        scale = min(TAGGER_INPUT_SIZE / height, TAGGER_INPUT_SIZE / width)
        resized_h = max(1, int(height * scale))
        resized_w = max(1, int(width * scale))
        pixels = F.interpolate(
            pixels, size=(resized_h, resized_w), mode="bilinear", align_corners=False, antialias=True
        )
        pad_h = TAGGER_INPUT_SIZE - resized_h
        pad_w = TAGGER_INPUT_SIZE - resized_w
        left = pad_w // 2
        top = pad_h // 2
        pixels = F.pad(pixels, (left, pad_w - left, top, pad_h - top))
    return (pixels - 0.5) / 0.5


def _select_tags(
    probabilities: torch.Tensor,
    tags: List[str],
    tags_split: Any,
    thresholds: Dict[str, float],
    excluded: List[str],
    limit: int,
) -> Dict[str, List[Tuple[str, float]]]:
    selected: Dict[str, List[Tuple[str, float]]] = {}
    offset = 0
    for category, count in tags_split:
        threshold = thresholds.get(category)
        if threshold is not None and category not in excluded:
            scores = probabilities[offset:offset + count]
            hits = torch.nonzero(scores > threshold, as_tuple=False).flatten()
            if hits.numel() > 0:
                hit_scores = scores[hits]
                order = torch.argsort(hit_scores, descending=True)
                if limit > 0:
                    order = order[:limit]
                selected[category] = [
                    (tags[offset + int(hits[index])], float(hit_scores[index])) for index in order
                ]
        offset += count
    return selected


def _parse_excluded_categories(raw: Any) -> List[str]:
    excluded: List[str] = []
    for token in re.split(r"[,\s]+", str(raw or "")):
        name = token.strip().lower()
        if not name or name in excluded:
            continue
        if name not in TAGGER_CATEGORY_THRESHOLDS:
            print(f"[DanbooruTagToolkit] Unknown tagger category ignored: {token!r}")
            continue
        excluded.append(name)
    return excluded


def _escape_unescaped_parentheses(text: Any) -> str:
    # Same rule as node.py: ComfyUI reads a bare "()" group as a 1.1 weight, so Danbooru tags such as
    # artoria_pendragon_(fate) have to travel through the graph escaped.
    value = str(text or "")
    value = re.sub(r'(?<!\\)\(', r'\\(', value)
    value = re.sub(r'(?<!\\)\)', r'\\)', value)
    return value


def _tag_text(tag: str, replace_underscore: bool) -> str:
    return tag.replace("_", " ") if replace_underscore else tag


def _ordered_tag_items(
    selected: Dict[str, List[Tuple[str, float]]],
    categories: List[str],
    sort_by: str,
) -> List[Tuple[str, float]]:
    items: List[Tuple[str, float]] = []
    for category in categories:
        items.extend(selected.get(category, []))
    if sort_by == "score":
        items.sort(key=lambda item: item[1], reverse=True)
    return items


def _render_tags(items: List[Tuple[str, float]], replace_underscore: bool) -> str:
    return ", ".join(_escape_unescaped_parentheses(_tag_text(tag, replace_underscore)) for tag, _score in items)


def _render_scores(selected: Dict[str, List[Tuple[str, float]]], categories: List[str]) -> str:
    payload = {
        category: {tag: round(score, 4) for tag, score in selected.get(category, [])}
        for category in categories
    }
    return json.dumps(payload, ensure_ascii=False)


def _flatten_images(images: Any) -> List[torch.Tensor]:
    if images is None:
        return []
    if isinstance(images, tuple):
        return _flatten_images(list(images))
    if isinstance(images, list):
        flattened: List[torch.Tensor] = []
        for item in images:
            flattened = [*flattened, *_flatten_images(item)]
        return flattened
    if hasattr(images, "shape") and len(images.shape) == 4:
        return [images[index] for index in range(images.shape[0])]
    return [images]


class DanbooruPixAITaggerNode:
    DESCRIPTION = (
        "Tags local images with PixAI Tagger v1.0 (30,877 Danbooru tags in six categories) and feeds the "
        "Danbooru Tag Toolkit sorter. Weights go into ComfyUI/models/taggers/<name>/."
    )

    @classmethod
    def INPUT_TYPES(cls):
        models = _list_tagger_models()
        return {
            "required": {
                "image": ("IMAGE",),
                "model": (models or [MISSING_MODEL_ENTRY], {"tooltip": "Folder inside ComfyUI/models/taggers/."}),
                "device": (["auto", "cuda", "cpu"], {"default": "auto"}),
                "dtype": (["auto", "bf16", "fp16", "fp32"], {"default": "auto"}),
                "threshold_general": ("FLOAT", {"default": TAGGER_CATEGORY_THRESHOLDS["general"], "min": 0.0, "max": 1.0, "step": 0.01}),
                "threshold_character": ("FLOAT", {"default": TAGGER_CATEGORY_THRESHOLDS["character"], "min": 0.0, "max": 1.0, "step": 0.01}),
                "threshold_copyright": ("FLOAT", {"default": TAGGER_CATEGORY_THRESHOLDS["copyright"], "min": 0.0, "max": 1.0, "step": 0.01}),
                "threshold_style": ("FLOAT", {"default": TAGGER_CATEGORY_THRESHOLDS["style"], "min": 0.0, "max": 1.0, "step": 0.01}),
                "threshold_meta": ("FLOAT", {"default": TAGGER_CATEGORY_THRESHOLDS["meta"], "min": 0.0, "max": 1.0, "step": 0.01}),
                "threshold_rating": ("FLOAT", {"default": TAGGER_CATEGORY_THRESHOLDS["rating"], "min": 0.0, "max": 1.0, "step": 0.01}),
                "exclude_categories": ("STRING", {"default": DEFAULT_EXCLUDE_CATEGORIES, "tooltip": "Comma separated: general, character, copyright, style, meta, rating."}),
                "sort_by": (["category", "score"], {"default": "category"}),
                "max_tags_per_category": ("INT", {"default": 0, "min": 0, "max": MAX_TAGS_PER_CATEGORY_LIMIT, "step": 1}),
                "replace_underscore": ("BOOLEAN", {"default": False, "label": "空格替换下划线"}),
                "free_after_run": ("BOOLEAN", {"default": False, "label": "跑完释放显存"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("tags", "merged_tags", "scores_json")
    OUTPUT_IS_LIST = (True, False, True)
    INPUT_IS_LIST = True
    FUNCTION = "tag"
    CATEGORY = "Danbooru Toolkit/Tagger"

    def tag(
        self,
        image,
        model,
        device="auto",
        dtype="auto",
        threshold_general=TAGGER_CATEGORY_THRESHOLDS["general"],
        threshold_character=TAGGER_CATEGORY_THRESHOLDS["character"],
        threshold_copyright=TAGGER_CATEGORY_THRESHOLDS["copyright"],
        threshold_style=TAGGER_CATEGORY_THRESHOLDS["style"],
        threshold_meta=TAGGER_CATEGORY_THRESHOLDS["meta"],
        threshold_rating=TAGGER_CATEGORY_THRESHOLDS["rating"],
        exclude_categories=DEFAULT_EXCLUDE_CATEGORIES,
        sort_by="category",
        max_tags_per_category=0,
        replace_underscore=False,
        free_after_run=False,
    ):
        if ViTDetCls is None:
            raise RuntimeError(f"PixAI Tagger needs transformers and timm: {PIXAI_IMPORT_ERROR}")

        images = _flatten_images(image)
        if not images:
            raise RuntimeError("PixAI Tagger received no image.")

        model_name = str(_first(model) or "")
        model_dir = _resolve_tagger_dir(model_name)
        if not model_dir:
            raise RuntimeError(
                f"PixAI Tagger model {model_name!r} not found. Put the weights in "
                "ComfyUI/models/taggers/pixai-tagger-v1.0 (see the PixAI Tagger section in README.md)."
            )

        torch_device = _pick_device(_first(device))
        torch_dtype = _pick_dtype(_first(dtype), torch_device)
        thresholds = {
            "general": float(_first(threshold_general)),
            "character": float(_first(threshold_character)),
            "copyright": float(_first(threshold_copyright)),
            "style": float(_first(threshold_style)),
            "meta": float(_first(threshold_meta)),
            "rating": float(_first(threshold_rating)),
        }
        excluded = _parse_excluded_categories(_first(exclude_categories))
        order = "score" if str(_first(sort_by) or "category").strip().lower() == "score" else "category"
        tag_limit = max(0, int(_first(max_tags_per_category)))
        underscore = bool(_first(replace_underscore))

        progress = comfy.utils.ProgressBar(len(images))
        per_image_tags: List[str] = []
        scores_json: List[str] = []
        merged_tags: List[str] = []
        seen_merged = set()

        with _tagger_lock:
            tagger = _load_tagger(model_dir, torch_device, torch_dtype)
            config = tagger.config
            categories = [category for category, _count in config.tags_split]

            for pixels in images:
                comfy.model_management.throw_exception_if_processing_interrupted()
                prepared = _preprocess_image(pixels).to(device=torch_device, dtype=torch_dtype)
                probabilities = tagger(prepared).sigmoid()[0]
                selected = _select_tags(probabilities, config.tags, config.tags_split, thresholds, excluded, tag_limit)
                items = _ordered_tag_items(selected, categories, order)

                per_image_tags.append(_render_tags(items, underscore))
                scores_json.append(_render_scores(selected, categories))
                for tag, _score in items:
                    text = _tag_text(tag, underscore)
                    key = text.lower()
                    if key not in seen_merged:
                        seen_merged.add(key)
                        merged_tags.append(text)
                progress.update(1)

            if bool(_first(free_after_run)):
                _unload_tagger_models()

        merged_text = ", ".join(_escape_unescaped_parentheses(tag) for tag in merged_tags)
        return (per_image_tags, merged_text, scores_json)


NODE_CLASS_MAPPINGS = {
    "DanbooruPixAITaggerNode": DanbooruPixAITaggerNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruPixAITaggerNode": "Danbooru Tag Toolkit - PixAI Tagger",
}
