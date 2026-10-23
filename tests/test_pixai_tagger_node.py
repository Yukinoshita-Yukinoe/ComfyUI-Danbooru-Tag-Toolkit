import importlib
import json
import os
import sys
import types
from pathlib import Path

import pytest
import torch

PACKAGE_DIR = Path(__file__).resolve().parents[1]


def _import_node_module():
    # Import through a package stub so the node's ".vendor.pixai_tagger" import is exercised the same way
    # ComfyUI loads it; importing the file as a top-level module would silently disable that import.
    package = types.ModuleType("danbooru_tag_toolkit")
    package.__path__ = [str(PACKAGE_DIR)]
    sys.modules["danbooru_tag_toolkit"] = package
    return importlib.import_module("danbooru_tag_toolkit.pixai_tagger_node")


tagger_node = _import_node_module()

DEFAULT_EXCLUDE_CATEGORIES = tagger_node.DEFAULT_EXCLUDE_CATEGORIES
DEFAULT_TAGGER_REPO = tagger_node.DEFAULT_TAGGER_REPO
DEFAULT_TAGGER_NAME = tagger_node.DEFAULT_TAGGER_NAME
MISSING_MODEL = "not-installed-model"
DanbooruPixAITaggerNode = tagger_node.DanbooruPixAITaggerNode
_flatten_images = tagger_node._flatten_images
_list_tagger_models = tagger_node._list_tagger_models
_ordered_tag_items = tagger_node._ordered_tag_items
_parse_excluded_categories = tagger_node._parse_excluded_categories
_preprocess_image = tagger_node._preprocess_image
_render_scores = tagger_node._render_scores
_render_tags = tagger_node._render_tags
_resolve_tagger_dir = tagger_node._resolve_tagger_dir
_select_tags = tagger_node._select_tags


def test_node_module_loads_the_vendored_model_code():
    pytest.importorskip("transformers")
    pytest.importorskip("timm")

    assert tagger_node.ViTDetCls is not None
    assert tagger_node.PIXAI_IMPORT_ERROR == ""


def _fake_config():
    tags = [f"g{index}" for index in range(4)] + ["char_a", "char_b"] + ["rating:s"]
    return type("Config", (), {"tags": tags, "tags_split": [("general", 4), ("character", 2), ("rating", 1)]})


def _node_kwargs(**overrides):
    values = {
        "image": [torch.zeros(8, 8, 3)],
        "model": [MISSING_MODEL],
        "device": ["cpu"],
        "dtype": ["fp32"],
        "threshold_general": [0.17],
        "threshold_character": [0.27],
        "threshold_copyright": [0.24],
        "threshold_style": [0.15],
        "threshold_meta": [0.17],
        "threshold_rating": [0.41],
        "exclude_categories": [DEFAULT_EXCLUDE_CATEGORIES],
        "sort_by": ["category"],
        "max_tags_per_category": [0],
        "replace_underscore": [False],
        "free_after_run": [False],
        "auto_download": [False],
        "download_repo": [DEFAULT_TAGGER_REPO],
    }
    values.update(overrides)
    return values


def _official_processor():
    pytest.importorskip("transformers")
    pytest.importorskip("timm")
    pytest.importorskip("torchvision")
    vendor_dir = Path(__file__).resolve().parents[1] / "vendor" / "pixai_tagger"
    if str(vendor_dir) not in sys.path:
        sys.path.insert(0, str(vendor_dir))
    from tagger_pipeline import RescalePadProcessor

    return RescalePadProcessor(size=1008)


def test_node_contract_keeps_the_toolkit_wiring():
    assert DanbooruPixAITaggerNode.RETURN_NAMES == ("tags", "merged_tags", "scores_json")
    assert DanbooruPixAITaggerNode.OUTPUT_IS_LIST == (True, False, True)
    assert DanbooruPixAITaggerNode.INPUT_IS_LIST is True


def test_preprocess_image_matches_the_official_processor():
    numpy = pytest.importorskip("numpy")
    from PIL import Image

    processor = _official_processor()
    array = numpy.random.default_rng(0).integers(0, 256, size=(300, 500, 3), dtype=numpy.uint8)
    expected = processor(Image.fromarray(array), return_tensors="pt")["pixel_values"]

    prepared = _preprocess_image(torch.from_numpy(array).float() / 255.0)

    assert prepared.shape == (1, 3, 1008, 1008)
    assert torch.allclose(prepared, expected, atol=1e-6)


def test_preprocess_image_centers_the_image_on_a_black_canvas():
    prepared = _preprocess_image(torch.ones(504, 1008, 3))

    assert prepared.shape == (1, 3, 1008, 1008)
    assert torch.allclose(prepared[:, :, :252, :], torch.full((1, 3, 252, 1008), -1.0))
    assert torch.allclose(prepared[:, :, 252:756, :], torch.ones(1, 3, 504, 1008))


def test_preprocess_image_survives_extreme_aspect_ratios():
    assert _preprocess_image(torch.ones(2000, 1, 3)).shape == (1, 3, 1008, 1008)


def test_select_tags_thresholds_limits_and_excluded_categories():
    config = _fake_config()
    probabilities = torch.tensor([0.9, 0.5, 0.2, 0.05, 0.8, 0.1, 0.6])
    thresholds = {"general": 0.17, "character": 0.27, "rating": 0.41}

    selected = _select_tags(probabilities, config.tags, config.tags_split, thresholds, [], 0)
    assert [tag for tag, _score in selected["general"]] == ["g0", "g1", "g2"]
    assert [tag for tag, _score in selected["character"]] == ["char_a"]
    assert [tag for tag, _score in selected["rating"]] == ["rating:s"]

    limited = _select_tags(probabilities, config.tags, config.tags_split, thresholds, [], 2)
    assert [tag for tag, _score in limited["general"]] == ["g0", "g1"]

    dropped = _select_tags(probabilities, config.tags, config.tags_split, thresholds, ["character", "rating"], 0)
    assert "character" not in dropped
    assert "rating" not in dropped


def test_ordered_tag_items_can_sort_by_score():
    selected = {"general": [("general_tag", 0.4)], "character": [("character_tag", 0.9)]}

    by_category = _ordered_tag_items(selected, ["general", "character"], "category")
    by_score = _ordered_tag_items(selected, ["general", "character"], "score")

    assert [tag for tag, _score in by_category] == ["general_tag", "character_tag"]
    assert [tag for tag, _score in by_score] == ["character_tag", "general_tag"]


def test_render_tags_escapes_bare_parentheses():
    text = _render_tags([("artoria_pendragon_(fate)", 0.9), ("1girl", 0.8)], False)

    assert text == r"artoria_pendragon_\(fate\), 1girl"


def test_render_tags_can_replace_underscores():
    assert _render_tags([("long_hair", 0.9)], True) == "long hair"


def test_render_scores_is_json_per_category():
    payload = json.loads(_render_scores({"general": [("1girl", 0.5)]}, ["general", "character"]))

    assert payload == {"general": {"1girl": 0.5}, "character": {}}


def test_parse_excluded_categories_ignores_unknown_names(capsys):
    assert _parse_excluded_categories("meta, rating") == ["meta", "rating"]
    assert _parse_excluded_categories("meta rating meta") == ["meta", "rating"]
    assert _parse_excluded_categories("nope") == []
    assert "Unknown tagger category" in capsys.readouterr().out


def test_flatten_images_handles_batches_and_lists():
    batch = torch.zeros(2, 4, 4, 3)
    single = torch.zeros(1, 4, 4, 3)

    assert len(_flatten_images([batch])) == 2
    assert len(_flatten_images([single, single])) == 2
    assert len(_flatten_images([torch.zeros(4, 4, 3)])) == 1


def test_list_tagger_models_needs_config_and_weights(tmp_path, tagger_model_dirs):
    tagger_model_dirs.append(str(tmp_path))
    complete = tmp_path / "pixai-tagger-v1.0"
    complete.mkdir()
    (complete / "config.json").write_text("{}", encoding="utf-8")
    (complete / "model.safetensors").write_bytes(b"")
    incomplete = tmp_path / "half"
    incomplete.mkdir()
    (incomplete / "config.json").write_text("{}", encoding="utf-8")

    assert _list_tagger_models() == ["pixai-tagger-v1.0"]


def test_resolve_tagger_dir_rejects_paths_outside_the_model_folder(tmp_path, tagger_model_dirs):
    tagger_model_dirs.append(str(tmp_path))

    assert _resolve_tagger_dir("../outside") == ""
    assert _resolve_tagger_dir(r"C:\Windows") == ""
    assert _resolve_tagger_dir("..") == ""
    assert _resolve_tagger_dir(MISSING_MODEL) == ""


def test_tag_reports_a_readable_error_when_the_model_is_missing(tagger_model_dirs):
    with pytest.raises(RuntimeError, match="models/taggers"):
        DanbooruPixAITaggerNode().tag(**_node_kwargs())


def test_model_combo_offers_the_default_repo_before_it_is_downloaded(tagger_model_dirs):
    # A workflow saved where the weights exist must still validate where they do not, or the node never
    # gets a chance to download them.
    assert DEFAULT_TAGGER_NAME in DanbooruPixAITaggerNode.INPUT_TYPES()["required"]["model"][0]


class _FakeTagger:
    """Returns one flat logit per tag so the tag assembly can be tested without weights."""

    def __init__(self, config, logit=-10.0):
        self.config = config
        self.logit = logit

    def __call__(self, pixels):
        return torch.full((1, len(self.config.tags)), self.logit)


def test_tag_downloads_the_model_on_first_run(monkeypatch, tmp_path, tagger_model_dirs):
    tagger_model_dirs.append(str(tmp_path))
    requested = []

    def fake_download(repo_id, target_dir, files=tagger_node.TAGGER_REPO_FILES):
        requested.append((repo_id, target_dir))
        os.makedirs(target_dir, exist_ok=True)
        Path(target_dir, "config.json").write_text("{}", encoding="utf-8")
        Path(target_dir, "model.safetensors").write_bytes(b"")
        return target_dir

    monkeypatch.setattr(tagger_node, "_download_model", fake_download)
    monkeypatch.setattr(tagger_node, "_load_tagger", lambda *args: _FakeTagger(_fake_config()))

    kwargs = _node_kwargs(auto_download=[True], download_repo=["someone/other-tagger"])
    tags, merged_tags, scores_json = DanbooruPixAITaggerNode().tag(**kwargs)

    assert requested == [("someone/other-tagger", os.path.join(str(tmp_path), "other-tagger"))]
    assert tags == [""] and merged_tags == ""
    assert json.loads(scores_json[0]) == {"general": {}, "character": {}, "rating": {}}


def test_tag_rejects_a_download_that_produced_no_model(monkeypatch, tmp_path, tagger_model_dirs):
    tagger_model_dirs.append(str(tmp_path))
    monkeypatch.setattr(tagger_node, "_download_model", lambda *args, **kwargs: str(tmp_path / "empty"))

    with pytest.raises(RuntimeError, match="did not provide config.json"):
        DanbooruPixAITaggerNode().tag(**_node_kwargs(auto_download=[True]))


def test_download_model_fetches_every_needed_file(monkeypatch, tmp_path):
    # huggingface_hub is imported inside the helper, so a stub module is enough to test the wiring.
    fetched = []

    class _Sibling:
        def __init__(self, name, size):
            self.rfilename = name
            self.size = size

    class _Info:
        siblings = [_Sibling("config.json", 10), _Sibling("model.safetensors", 990), _Sibling("banner.png", 5000)]

    class _Api:
        def model_info(self, repo_id, files_metadata=False):
            assert repo_id == "owner/repo"
            return _Info()

    def fake_hf_hub_download(repo_id, filename, local_dir):
        fetched.append((repo_id, filename))
        path = Path(local_dir) / filename
        path.write_bytes(b"x" * 10)
        return str(path)

    module = types.ModuleType("huggingface_hub")
    module.HfApi = _Api
    module.hf_hub_download = fake_hf_hub_download
    monkeypatch.setitem(sys.modules, "huggingface_hub", module)

    target = str(tmp_path / "downloaded")
    assert tagger_node._download_model("owner/repo", target) == target

    assert fetched == [("owner/repo", "config.json"), ("owner/repo", "preprocessor_config.json"), ("owner/repo", "model.safetensors")]
    assert (Path(target) / "config.json").is_file()


def test_vendored_model_code_exposes_what_the_node_imports():
    processor = _official_processor()
    import tagger_pipeline

    assert hasattr(tagger_pipeline, "ViTDetClsConfig")
    assert hasattr(tagger_pipeline, "ViTDetCls")
    assert processor.size == 1008


@pytest.mark.skipif(not os.environ.get("DTT_PIXAI_MODEL_DIR"), reason="set DTT_PIXAI_MODEL_DIR to run real inference")
def test_real_inference_runs_on_cpu(tagger_model_dirs):
    model_dir = Path(os.environ["DTT_PIXAI_MODEL_DIR"]).resolve()
    tagger_model_dirs.append(str(model_dir.parent))
    thresholds = {
        name: [0.05]
        for name in (
            "threshold_general",
            "threshold_character",
            "threshold_copyright",
            "threshold_style",
            "threshold_meta",
            "threshold_rating",
        )
    }
    kwargs = _node_kwargs(image=[torch.rand(1, 64, 64, 3)], model=[model_dir.name], **thresholds)

    tags, merged_tags, scores_json = DanbooruPixAITaggerNode().tag(**kwargs)

    assert tags[0] and merged_tags
    assert isinstance(json.loads(scores_json[0]), dict)
