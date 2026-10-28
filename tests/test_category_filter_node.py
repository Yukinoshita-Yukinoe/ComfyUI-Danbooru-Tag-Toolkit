import importlib
import json
import sys
import types
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parents[1]


def _import_node_module():
    package = types.ModuleType("danbooru_tag_toolkit")
    package.__path__ = [str(PACKAGE_DIR)]
    sys.modules["danbooru_tag_toolkit"] = package
    return importlib.import_module("danbooru_tag_toolkit.category_filter_node")


node = _import_node_module()
DanbooruTagCategoryFilterNode = node.DanbooruTagCategoryFilterNode

CHARACTER = "character_feature_terms"
SUBJECT = "subject_terms"
BACKGROUND = "background_terms"
UNCATEGORIZED = node.UNCATEGORIZED_KEY

DEFAULT_ORDER = [item["key"] for item in node._default_categories()]


class FakeSorter:
    """Stands in for DanbooruTagSorter so the filtering rules can be checked without the tag database."""

    default_category = UNCATEGORIZED

    def __init__(self, tags):
        self.tag_db = {name: {"original_category": category} for name, category in tags.items()}

    def get_new_category(self, category, subcategory):
        return category


FAKE_TAGS = {"long hair": CHARACTER, "1girl": SUBJECT, "city": BACKGROUND}


def install_fake(monkeypatch, tags=None):
    monkeypatch.setattr(node, "_build_sorter", lambda: FakeSorter(tags if tags is not None else FAKE_TAGS))


def categories_json(selected, order=None):
    items = node._default_categories()
    by_key = {item["key"]: item for item in items}
    if order:
        items = [by_key[key] for key in order]
    for item in items:
        item["selected"] = item["key"] in selected
    return json.dumps(items, ensure_ascii=False)


def run(prompt="", exclude_mode=False, categories=""):
    return DanbooruTagCategoryFilterNode().filter_categories(
        prompt=prompt,
        exclude_mode=exclude_mode,
        categories_json=categories or categories_json(DEFAULT_ORDER),
    )


def test_node_contract():
    assert DanbooruTagCategoryFilterNode.RETURN_NAMES == ("prompt", "removed_tags")
    assert DanbooruTagCategoryFilterNode.FUNCTION == "filter_categories"
    assert DanbooruTagCategoryFilterNode.CATEGORY == "Danbooru Toolkit/Filter"


def test_default_categories_are_the_toolkit_categories_in_order():
    items = node._default_categories()

    assert [item["key"] for item in items] == [
        "artist_terms", "background_terms", "subject_terms", "character_feature_terms",
        "facial_feature_terms", "body_part_terms", "sexual_feature_terms", "outfit_terms",
        "action_terms", "expression_terms", "camera_terms", "uncategorized_terms",
    ]
    assert all(item["selected"] for item in items)
    # Labels come from the same table All-in-One uses, so the chips read the same in both nodes.
    assert items[0]["zh"] == "画师词" and items[0]["en"] == "Artist"
    assert items[-1]["zh"] == "未归类词" and items[-1]["en"] == "Uncategorized"


def test_categories_json_is_the_input_default():
    payload = json.loads(DanbooruTagCategoryFilterNode.INPUT_TYPES()["optional"]["categories_json"][1]["default"])

    assert len(payload) == 12
    assert all(item["selected"] for item in payload)
    assert payload[0]["zh"] == "画师词"


def test_unreadable_list_falls_back_to_every_category():
    # Passing everything through beats silently emptying a prompt.
    order, selected = node._parse_categories("not json at all")

    assert order == DEFAULT_ORDER
    assert selected == set(DEFAULT_ORDER)
    assert node._parse_categories("")[1] == set(DEFAULT_ORDER)
    assert node._parse_categories("[]")[1] == set(DEFAULT_ORDER)


def test_missing_selected_flag_counts_as_selected():
    order, selected = node._parse_categories(json.dumps([{"key": "outfit_terms"}]))

    assert order == ["outfit_terms"]
    assert selected == {"outfit_terms"}


def test_parsing_keeps_order_and_drops_duplicates_and_junk():
    payload = json.dumps([
        {"key": "outfit_terms", "selected": False},
        None,
        {"key": "outfit_terms", "selected": True},
        {"not_a_key": 1},
        {"key": "camera_terms", "selected": True},
    ])
    order, selected = node._parse_categories(payload)

    assert order == ["outfit_terms", "camera_terms"]
    assert selected == {"camera_terms"}


def test_keeps_only_the_selected_categories(monkeypatch):
    install_fake(monkeypatch)
    prompt, removed = run("1girl, city, long hair", categories=categories_json({SUBJECT, CHARACTER}))

    assert prompt == "1girl, long hair"
    assert removed == "city"


def test_output_is_grouped_by_the_category_order(monkeypatch):
    install_fake(monkeypatch)
    # Default order puts the background category before the subject one, whatever the prompt order was.
    prompt, _ = run("long hair, 1girl, city")

    assert prompt == "city, 1girl, long hair"


def test_dragging_categories_changes_the_output_order(monkeypatch):
    install_fake(monkeypatch)
    reordered = [CHARACTER, SUBJECT, BACKGROUND, *DEFAULT_ORDER]
    prompt, _ = run("city, 1girl, long hair", categories=categories_json(set(reordered), order=reordered))

    assert prompt == "long hair, 1girl, city"


def test_exclude_mode_drops_the_selected_categories(monkeypatch):
    install_fake(monkeypatch)
    prompt, removed = run("1girl, city, long hair", exclude_mode=True, categories=categories_json({BACKGROUND}))

    assert prompt == "1girl, long hair"
    assert removed == "city"


def test_exclude_mode_with_everything_selected_empties_the_prompt(monkeypatch):
    install_fake(monkeypatch)
    prompt, removed = run("1girl, city", exclude_mode=True)

    assert prompt == ""
    assert removed == "1girl, city"


def test_unknown_tags_land_in_the_uncategorized_category(monkeypatch):
    install_fake(monkeypatch)
    assert run("1girl, my made up tag", categories=categories_json({SUBJECT})) == ("1girl", "my made up tag")
    assert run("1girl, my made up tag", categories=categories_json({UNCATEGORIZED})) == ("my made up tag", "1girl")

    kept, _ = run("1girl, my made up tag", exclude_mode=True, categories=categories_json({UNCATEGORIZED}))
    assert kept == "1girl"


def test_weighted_groups_are_kept_together_and_classified_by_their_first_tag(monkeypatch):
    install_fake(monkeypatch)
    kept, removed = run("(long hair, blue eyes:1.2), city", categories=categories_json({CHARACTER}))

    assert kept == "(long hair, blue eyes:1.2)"
    assert removed == "city"


def test_underscores_and_case_are_matched_like_all_in_one(monkeypatch):
    install_fake(monkeypatch)
    kept, removed = run("1Girl, LONG_HAIR", categories=categories_json({CHARACTER}))

    assert kept == "LONG_HAIR"
    assert removed == "1Girl"


def test_empty_prompt_and_empty_selection(monkeypatch):
    install_fake(monkeypatch)
    assert run("") == ("", "")

    kept, removed = run("1girl, city", categories=categories_json(set()))
    assert (kept, removed) == ("", "1girl, city")


def test_the_real_database_keeps_every_tag_when_all_categories_are_selected():
    # No monkeypatch here: this runs the real sorter over the real database.
    original = "1girl, solo, long hair, city, masterpiece, very specific unknown tag"
    kept, removed = run(original)

    assert removed == ""
    assert {tag.strip() for tag in kept.split(",")} == {tag.strip() for tag in original.split(",")}


def test_the_real_database_agrees_with_all_in_one_on_known_tags():
    assert run("long hair", categories=categories_json({CHARACTER}))[0] == "long hair"
    assert run("school uniform", categories=categories_json({"outfit_terms"}))[0] == "school uniform"
    assert run("long hair", categories=categories_json({BACKGROUND})) == ("", "long hair")
