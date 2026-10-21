"""Smooth line art by tracing it with potrace and rasterizing the curves with Pillow.

The tracing step needs the pure-Python ``potracer`` package (GPLv2+); it is imported lazily so the
rest of the toolkit keeps working without it. No third-party code is vendored here: potracer does
the curve fitting, this module only flattens the curves and draws them.

SPDX-License-Identifier: MIT
"""

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter

import comfy.model_management
import comfy.utils

try:
    import potrace
except ModuleNotFoundError:
    potrace = None

CURVE_SAMPLES = 10
INSTALL_HINT = "pip install potracer"


def _flatten_curves(curves, samples=CURVE_SAMPLES):
    """Turn potrace's corner / cubic segments into closed polygons in pixel units."""
    polygons = []
    for curve in curves:
        start = curve.start_point
        points = [(start.x, start.y)]
        for segment in curve.segments:
            if segment.is_corner:
                corner, end = segment.c, segment.end_point
                points.append((corner.x, corner.y))
                points.append((end.x, end.y))
                continue
            p0 = np.array(points[-1], dtype=np.float64)
            p1 = np.array((segment.c1.x, segment.c1.y), dtype=np.float64)
            p2 = np.array((segment.c2.x, segment.c2.y), dtype=np.float64)
            p3 = np.array((segment.end_point.x, segment.end_point.y), dtype=np.float64)
            for step in range(1, samples + 1):
                t = step / samples
                u = 1.0 - t
                point = u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3
                points.append((float(point[0]), float(point[1])))
        if len(points) >= 3:
            polygons.append(points)
    return polygons


def _rasterize(polygons, width, height, scale):
    """Even-odd fill, so a curve that encloses a hole leaves that hole empty."""
    canvas = np.zeros((height * scale, width * scale), dtype=bool)
    for polygon in polygons:
        points = np.asarray(polygon, dtype=np.float64) * scale
        x0 = max(0, int(np.floor(points[:, 0].min())) - 1)
        x1 = min(canvas.shape[1], int(np.ceil(points[:, 0].max())) + 2)
        y0 = max(0, int(np.floor(points[:, 1].min())) - 1)
        y1 = min(canvas.shape[0], int(np.ceil(points[:, 1].max())) + 2)
        if x1 <= x0 or y1 <= y0:
            continue
        tile = Image.new("L", (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(tile).polygon((points - np.array([x0, y0])).ravel().tolist(), fill=255)
        canvas[y0:y1, x0:x1] ^= np.asarray(tile) > 127
    return Image.fromarray(np.where(canvas, 0, 255).astype(np.uint8), "L")


def _binarize(frame, threshold, median_filter, pre_blur):
    rgb = Image.fromarray(np.rint(np.clip(frame[..., :3], 0, 1) * 255).astype(np.uint8), "RGB")
    gray = rgb.convert("L")
    if median_filter:
        gray = gray.filter(ImageFilter.MedianFilter(3))
    if pre_blur > 0:
        gray = gray.filter(ImageFilter.GaussianBlur(pre_blur))
    return Image.fromarray(np.where(np.asarray(gray) < threshold * 255, 0, 255).astype(np.uint8), "L")


def _trace_frame(frame, threshold, despeckle, smoothness, antialias, pre_blur,
                 median_filter, output_scale, transparent_background):
    height, width = frame.shape[:2]
    binary = _binarize(frame, threshold, median_filter, pre_blur)
    curves = potrace.Bitmap(binary).trace(
        turdsize=despeckle,
        alphamax=smoothness,
        opticurve=True,
        opttolerance=0.2,
    )
    canvas = _rasterize(_flatten_curves(curves), width, height, antialias)
    if antialias != output_scale:
        canvas = canvas.resize((width * output_scale, height * output_scale), Image.Resampling.LANCZOS)

    if transparent_background:
        alpha = Image.fromarray(255 - np.asarray(canvas), "L")
        render = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        render.putalpha(alpha)
    else:
        render = canvas.convert("RGB")
    return np.asarray(render, dtype=np.float32) / 255.0


class DanbooruLineartTraceNode:
    DESCRIPTION = (
        "Retraces black line art into smooth curves (Potrace) and returns an antialiased image, "
        "optionally with a transparent background. Needs the optional 'potracer' package."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "threshold": ("FLOAT", {"default": 0.70, "min": 0.0, "max": 1.0, "step": 0.001, "tooltip": "Pixels darker than this count as line. Raise it when thin lines disappear."}),
                "despeckle": ("INT", {"default": 3, "min": 0, "max": 100, "step": 1, "tooltip": "Speckle area to drop. Lower it when fine details vanish."}),
                "smoothness": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.34, "step": 0.05, "tooltip": "Corner sharpness, 0 keeps corners and higher values round them."}),
                "antialias": ("INT", {"default": 3, "min": 1, "max": 4, "step": 1, "tooltip": "Internal rendering scale, independent of output_scale."}),
                "pre_blur": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 4.0, "step": 0.1}),
                "median_filter": ("BOOLEAN", {"default": False, "label": "3x3 中值滤波"}),
                "output_scale": ("INT", {"default": 1, "min": 1, "max": 4, "step": 1}),
                "transparent_background": ("BOOLEAN", {"default": True, "label": "透明背景"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "trace"
    CATEGORY = "Danbooru Toolkit/Image"

    def trace(self, image, threshold=0.70, despeckle=3, smoothness=1.0, antialias=3,
              pre_blur=0.0, median_filter=False, output_scale=1, transparent_background=True):
        if potrace is None:
            raise RuntimeError(f"Lineart Trace needs the optional 'potracer' package: {INSTALL_HINT}")

        frames = image if isinstance(image, torch.Tensor) and image.dim() == 4 else image[None]
        progress = comfy.utils.ProgressBar(frames.shape[0])
        results = []
        for frame in frames.detach().cpu().numpy():
            comfy.model_management.throw_exception_if_processing_interrupted()
            results.append(_trace_frame(
                frame, threshold, despeckle, smoothness, antialias, pre_blur,
                median_filter, output_scale, transparent_background,
            ))
            progress.update(1)

        return (torch.from_numpy(np.stack(results)),)


NODE_CLASS_MAPPINGS = {
    "DanbooruLineartTraceNode": DanbooruLineartTraceNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DanbooruLineartTraceNode": "Danbooru Tag Toolkit - Lineart Trace",
}
