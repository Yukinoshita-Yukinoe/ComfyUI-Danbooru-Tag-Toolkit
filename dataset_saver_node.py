import json
import os
from typing import Any, List

DEFAULT_PREVIEW_LIMIT = 24


def _first_scalar(value: Any, default: str = "") -> str:
    if isinstance(value, list):
        if not value:
            return default
        return _first_scalar(value[0], default)
    if value is None:
        return default
    return str(value)


def _normalize_prompts(prompts: Any, image_count: int) -> List[str]:
    def flatten(items: Any) -> List[Any]:
        if items is None:
            return []
        if isinstance(items, tuple):
            return flatten(list(items))
        if not isinstance(items, list):
            return [items]

        flattened: List[Any] = []
        for item in items:
            flattened = [*flattened, *flatten(item)]
        return flattened

    prompt_items = flatten(prompts)

    normalized = [str(item or "").strip() for item in prompt_items]
    if len(normalized) >= image_count:
        return normalized[:image_count]

    return [*normalized, *([""] * (image_count - len(normalized)))]


def _caption_path_for_image(image_path: str) -> str:
    base_path, _ = os.path.splitext(image_path)
    return f"{base_path}.txt"


def _build_saved_file_name(filename: str, counter: int, batch_number: int, extension: str) -> str:
    filename_with_batch_num = filename.replace("%batch_num%", str(batch_number))
    return f"{filename_with_batch_num}_{counter:05}_.{extension}"


def _image_to_pil(image: Any):
    import numpy as np
    from PIL import Image

    i = 255.0 * image.cpu().numpy()
    return Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))


def _flatten_image_inputs(images: Any) -> List[Any]:
    if images is None:
        return []

    if isinstance(images, tuple):
        return _flatten_image_inputs(list(images))
    if isinstance(images, list):
        flattened: List[Any] = []
        for image_group in images:
            flattened = [*flattened, *_flatten_image_inputs(image_group)]
        return flattened
    if hasattr(images, "shape") and len(images.shape) == 4:
        return [images[index] for index in range(images.shape[0])]
    return [images]


def _write_caption_file(path: str, prompt: str, overwrite_mode: str) -> None:
    if overwrite_mode == "new only" and os.path.exists(path):
        raise FileExistsError(f"{path} already exists and 'new only' is selected.")

    with open(path, "w", encoding="utf-8") as caption_file:
        caption_file.write(prompt)


def _as_int(value: Any, default: int) -> int:
    try:
        return int(_first_scalar(value, str(default)))
    except (TypeError, ValueError):
        return default


def _should_return_previews(preview_mode: Any, image_count: int, preview_limit: Any) -> bool:
    mode = _first_scalar(preview_mode, "auto").strip().lower()
    if mode == "off":
        return False
    if mode == "on":
        return True

    limit = max(0, _as_int(preview_limit, DEFAULT_PREVIEW_LIMIT))
    return image_count <= limit


class DanbooruDatasetSaverNode:
    def __init__(self):
        import folder_paths

        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Images to save as dataset files."}),
                "prompts": ("STRING", {"forceInput": True, "multiline": True}),
                "filename_prefix": ("STRING", {"default": "danbooru/data"}),
                "caption_mode": (["overwrite", "new only"], {"default": "overwrite"}),
                "preview_mode": (["auto", "off", "on"], {"default": "auto"}),
                "preview_limit": ("INT", {"default": DEFAULT_PREVIEW_LIMIT, "min": 0, "max": 500, "step": 1}),
                "embed_workflow": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_dataset"
    INPUT_IS_LIST = True
    OUTPUT_NODE = True
    CATEGORY = "Danbooru Toolkit/Gallery"
    DESCRIPTION = "Save Danbooru gallery images with same-name .txt sidecar captions."

    def save_dataset(
        self,
        images: Any,
        prompts: Any,
        filename_prefix: Any = "danbooru/data",
        caption_mode: Any = "overwrite",
        preview_mode: Any = "auto",
        preview_limit: Any = DEFAULT_PREVIEW_LIMIT,
        embed_workflow: Any = False,
        prompt: Any = None,
        extra_pnginfo: Any = None,
    ):
        import folder_paths
        from PIL.PngImagePlugin import PngInfo

        image_items = _flatten_image_inputs(images)
        if not image_items:
            return {"ui": {"images": []}}

        prefix = _first_scalar(filename_prefix, "danbooru/data")
        mode = _first_scalar(caption_mode, "overwrite")
        should_embed_workflow = _first_scalar(embed_workflow, "False").lower() == "true"
        should_return_previews = _should_return_previews(preview_mode, len(image_items), preview_limit)
        prompt_items = _normalize_prompts(prompts, len(image_items))

        first_image = image_items[0]
        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            prefix,
            self.output_dir,
            first_image.shape[1],
            first_image.shape[0],
        )
        os.makedirs(full_output_folder, exist_ok=True)

        results = []
        for batch_number, image in enumerate(image_items):
            image_file = _build_saved_file_name(filename, counter, batch_number, "png")
            image_path = os.path.join(full_output_folder, image_file)
            caption_path = _caption_path_for_image(image_path)

            metadata = None
            if should_embed_workflow:
                metadata = PngInfo()
                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt))
                if extra_pnginfo is not None:
                    for key, value in extra_pnginfo.items():
                        metadata.add_text(key, json.dumps(value))

            _image_to_pil(image).save(image_path, pnginfo=metadata, compress_level=self.compress_level)
            _write_caption_file(caption_path, prompt_items[batch_number], mode)

            if should_return_previews:
                results.append({
                    "filename": image_file,
                    "subfolder": subfolder,
                    "type": self.type,
                })
            counter += 1

        return {"ui": {"images": results}}


NODE_CLASS_MAPPINGS = {
    "DanbooruDatasetSaverNode": DanbooruDatasetSaverNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruDatasetSaverNode": "Danbooru Tag Toolkit - Dataset Saver",
}
