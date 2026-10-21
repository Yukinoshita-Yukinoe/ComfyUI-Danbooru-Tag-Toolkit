import importlib
import sys
import types
from pathlib import Path

import numpy as np
import pytest
import torch

PACKAGE_DIR = Path(__file__).resolve().parents[1]


def _import_node_module():
    package = types.ModuleType("danbooru_tag_toolkit")
    package.__path__ = [str(PACKAGE_DIR)]
    sys.modules["danbooru_tag_toolkit"] = package
    return importlib.import_module("danbooru_tag_toolkit.lineart_trace_node")


node = _import_node_module()
DanbooruLineartTraceNode = node.DanbooruLineartTraceNode

requires_potracer = pytest.mark.skipif(node.potrace is None, reason="potracer is an optional dependency")


class _Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y


class _Segment:
    def __init__(self, is_corner, end, c=None, c1=None, c2=None):
        self.is_corner = is_corner
        self.end_point = _Point(*end)
        if c is not None:
            self.c = _Point(*c)
        if c1 is not None:
            self.c1 = _Point(*c1)
            self.c2 = _Point(*c2)


class _Curve:
    def __init__(self, start, segments):
        self.start_point = _Point(*start)
        self.segments = segments


def test_flatten_curves_keeps_corners_and_samples_cubics():
    curve = _Curve(
        (0.0, 0.0),
        [
            _Segment(True, (1.0, 0.0), c=(1.0, 0.5)),
            _Segment(False, (0.0, 1.0), c1=(1.0, 1.5), c2=(0.0, 1.5)),
        ],
    )

    polygons = node._flatten_curves([curve], samples=4)

    assert len(polygons) == 1
    points = polygons[0]
    assert points[0] == (0.0, 0.0)
    assert points[1] == (1.0, 0.5)
    assert points[2] == (1.0, 0.0)
    # 1 start + 2 corner points + 4 cubic samples
    assert len(points) == 7
    assert points[-1] == (0.0, 1.0)


def test_flatten_curves_drops_curves_without_enough_points():
    assert node._flatten_curves([_Curve((0.0, 0.0), [])]) == []


def test_rasterize_uses_even_odd_so_inner_loops_stay_empty():
    outer = [(0, 0), (10, 0), (10, 10), (0, 10)]
    inner = [(3, 3), (7, 3), (7, 7), (3, 7)]

    canvas = np.asarray(node._rasterize([outer, inner], width=12, height=12, scale=1))

    assert canvas[1, 1] == 0, "the ring between the two loops is line"
    assert canvas[5, 5] == 255, "the enclosed hole stays empty"
    assert canvas[11, 11] == 255, "outside the shape stays empty"


def test_rasterize_clips_polygons_that_leave_the_canvas():
    polygon = [(-5, -5), (6, -5), (6, 6), (-5, 6)]

    canvas = np.asarray(node._rasterize([polygon], width=4, height=4, scale=1))

    assert canvas.shape == (4, 4)
    assert canvas[2, 2] == 0


def test_binarize_marks_pixels_darker_than_the_threshold():
    frame = np.zeros((2, 2, 3), dtype=np.float32)
    frame[0, 0] = 0.1
    frame[0, 1] = 0.9

    binary = np.asarray(node._binarize(frame, threshold=0.5, median_filter=False, pre_blur=0.0))

    assert binary[0, 0] == 0 and binary[0, 1] == 255


def test_trace_reports_a_readable_error_without_potracer(monkeypatch):
    monkeypatch.setattr(node, "potrace", None)

    with pytest.raises(RuntimeError, match="pip install potracer"):
        DanbooruLineartTraceNode().trace(torch.zeros(1, 8, 8, 3))


def test_trace_needs_no_tracer_for_the_shape_contract(monkeypatch):
    assert DanbooruLineartTraceNode.RETURN_TYPES == ("IMAGE",)
    assert DanbooruLineartTraceNode.RETURN_NAMES == ("image",)


@requires_potracer
def test_trace_returns_transparent_line_art():
    # White canvas with a black ring drawn on it.
    frame = np.ones((64, 64, 3), dtype=np.float32)
    frame[16:48, 16:20] = 0.0
    frame[16:48, 44:48] = 0.0
    frame[16:20, 16:48] = 0.0
    frame[44:48, 16:48] = 0.0

    (result,) = DanbooruLineartTraceNode().trace(torch.from_numpy(frame)[None])

    assert result.shape == (1, 64, 64, 4)
    array = result[0].numpy()
    alpha = array[..., 3]
    assert alpha.max() > 0.5, "the ring becomes opaque"
    assert alpha[32, 32] < 0.1, "the hole in the middle stays transparent"
    assert np.allclose(array[..., :3], 0.0), "lines are black, only alpha carries the shape"


@requires_potracer
def test_trace_can_return_white_background_and_scale_up():
    frame = np.ones((32, 32, 3), dtype=np.float32)
    frame[10:22, 10:14] = 0.0

    (result,) = DanbooruLineartTraceNode().trace(
        torch.from_numpy(frame)[None],
        threshold=0.5,
        output_scale=2,
        transparent_background=False,
    )

    assert result.shape == (1, 64, 64, 3)
    array = result[0].numpy()
    assert array.min() < 0.2, "the line is drawn"
    assert array.max() > 0.9, "the background stays white"
