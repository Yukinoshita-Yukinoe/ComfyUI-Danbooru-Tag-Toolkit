import sys
import types
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dataset_saver_node import (  # noqa: E402
    DanbooruDatasetSaverNode,
    _build_saved_file_name,
    _caption_path_for_image,
    _normalize_prompts,
)


class FakeTensor:
    def __init__(self, array):
        self._array = array
        self.shape = array.shape

    def cpu(self):
        return self

    def numpy(self):
        return self._array


def _install_fake_folder_paths(tmp_path):
    fake_folder_paths = types.ModuleType("folder_paths")
    fake_folder_paths.get_output_directory = lambda: str(tmp_path)
    fake_folder_paths.get_save_image_path = lambda prefix, output_dir, width, height: (
        str(Path(output_dir) / Path(prefix).parent),
        Path(prefix).name,
        1,
        str(Path(prefix).parent).replace(".", ""),
        Path(prefix).name,
    )
    sys.modules["folder_paths"] = fake_folder_paths


def test_normalize_prompts_pads_to_image_count():
    assert _normalize_prompts(["tag one", "tag two"], 3) == ["tag one", "tag two", ""]


def test_caption_path_uses_image_stem():
    assert _caption_path_for_image(r"C:\out\data_00001_.png").endswith(r"data_00001_.txt")


def test_build_saved_file_name_matches_comfy_save_image_pattern():
    assert _build_saved_file_name("data", 7, 0, "png") == "data_00007_.png"


def test_dataset_saver_writes_same_name_caption_files(tmp_path):
    _install_fake_folder_paths(tmp_path)
    image_a = FakeTensor(np.zeros((2, 2, 3), dtype=np.float32))
    image_b = FakeTensor(np.ones((2, 2, 3), dtype=np.float32))

    node = DanbooruDatasetSaverNode()
    result = node.save_dataset(
        images=[image_a, image_b],
        prompts=["1girl, blue hair", "solo, red dress"],
        filename_prefix="kiss/data",
        caption_mode="overwrite",
    )

    output_dir = tmp_path / "kiss"
    assert (output_dir / "data_00001_.png").exists()
    assert (output_dir / "data_00001_.txt").read_text(encoding="utf-8") == "1girl, blue hair"
    assert (output_dir / "data_00002_.png").exists()
    assert (output_dir / "data_00002_.txt").read_text(encoding="utf-8") == "solo, red dress"
    assert result["ui"]["images"][0]["filename"] == "data_00001_.png"


def test_dataset_saver_can_disable_preview_images(tmp_path):
    _install_fake_folder_paths(tmp_path)
    image = FakeTensor(np.zeros((2, 2, 3), dtype=np.float32))

    node = DanbooruDatasetSaverNode()
    result = node.save_dataset(
        images=[image],
        prompts=["1girl, blue hair"],
        filename_prefix="kiss/data",
        caption_mode="overwrite",
        preview_mode="off",
    )

    assert (tmp_path / "kiss" / "data_00001_.png").exists()
    assert result["ui"]["images"] == []


def test_dataset_saver_auto_disables_preview_above_limit(tmp_path):
    _install_fake_folder_paths(tmp_path)
    image_a = FakeTensor(np.zeros((2, 2, 3), dtype=np.float32))
    image_b = FakeTensor(np.ones((2, 2, 3), dtype=np.float32))

    node = DanbooruDatasetSaverNode()
    result = node.save_dataset(
        images=[image_a, image_b],
        prompts=["first", "second"],
        filename_prefix="kiss/data",
        caption_mode="overwrite",
        preview_mode="auto",
        preview_limit=1,
    )

    assert (tmp_path / "kiss" / "data_00002_.png").exists()
    assert result["ui"]["images"] == []
