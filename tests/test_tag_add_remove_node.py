import importlib
import sys
import types
from pathlib import Path

import pytest

PACKAGE_DIR = Path(__file__).resolve().parents[1]


def _import_node_module():
    package = types.ModuleType("danbooru_tag_toolkit")
    package.__path__ = [str(PACKAGE_DIR)]
    sys.modules["danbooru_tag_toolkit"] = package
    return importlib.import_module("danbooru_tag_toolkit.tag_add_remove_node")


node = _import_node_module()
DanbooruTagAddRemoveNode = node.DanbooruTagAddRemoveNode


def run(prompt="", add_tags="", remove_tags="", add_to_front=False):
    return DanbooruTagAddRemoveNode().edit_tags(
        prompt=prompt, add_tags=add_tags, remove_tags=remove_tags, add_to_front=add_to_front,
    )


def test_node_contract():
    assert DanbooruTagAddRemoveNode.RETURN_NAMES == ("prompt", "added_tags", "removed_tags")
    assert DanbooruTagAddRemoveNode.FUNCTION == "edit_tags"


def test_adds_missing_tags_at_the_end():
    prompt, added, removed = run("1girl, solo", add_tags="long hair, smile")

    assert prompt == "1girl, solo, long hair, smile"
    assert added == "long hair, smile"
    assert removed == ""


def test_add_to_front_puts_new_tags_first():
    prompt, added, _ = run("1girl, solo", add_tags="long hair", add_to_front=True)

    assert prompt == "long hair, 1girl, solo"
    assert added == "long hair"


def test_skips_tags_that_are_already_there():
    prompt, added, _ = run("1girl, Long Hair", add_tags="long_hair, smile")

    assert prompt == "1girl, Long Hair, smile", "existing tag is kept as written, only smile is added"
    assert added == "smile"


def test_underscores_and_spaces_are_the_same_tag():
    prompt, added, _ = run("blue eyes", add_tags="blue_eyes")
    assert prompt == "blue eyes" and added == ""

    prompt, added, _ = run("blue_eyes", add_tags="blue eyes")
    assert prompt == "blue_eyes" and added == ""


def test_removes_listed_tags():
    prompt, added, removed = run("1girl, solo, long hair", remove_tags="solo")

    assert prompt == "1girl, long hair"
    assert added == ""
    assert removed == "solo"


def test_removing_something_absent_changes_nothing():
    text = "1girl,  solo ,long hair"
    prompt, added, removed = run(text, remove_tags="smile")

    assert prompt == text, "the prompt passes through byte for byte"
    assert added == "" and removed == ""


def test_matching_ignores_case_and_underscores_when_removing():
    prompt, _, removed = run("1girl, Long_Hair", remove_tags="long hair")

    assert prompt == "1girl"
    assert removed == "Long_Hair"


def test_escaped_parentheses_match_their_bare_form():
    prompt, added, _ = run(r"1girl, utdr_\(toby_fox\)", add_tags="utdr_(toby_fox)")
    assert added == "", "the escaped tag already counts as present"

    prompt, _, removed = run(r"1girl, utdr_\(toby_fox\)", remove_tags="utdr_(toby_fox)")
    assert prompt == "1girl"
    assert removed == r"utdr_\(toby_fox\)", "the removed tag is reported as it appeared"


def test_parenthesis_weight_wrappers_are_not_part_of_the_tag():
    prompt, added, _ = run("1girl, (long hair)", add_tags="long hair")
    assert added == "" and prompt == "1girl, (long hair)"

    prompt, _, _ = run("1girl, ((blue eyes))", remove_tags="blue eyes")
    assert prompt == "1girl"


def test_weighted_group_keeps_its_other_tags_and_weight():
    prompt, _, removed = run("(long hair, blue eyes:1.2), solo", remove_tags="long hair")

    assert prompt == "(blue eyes:1.2), solo"
    assert removed == "long hair"


def test_weighted_group_is_dropped_when_all_its_tags_are_removed():
    prompt, _, removed = run("(long hair:1.2), solo", remove_tags="long hair")

    assert prompt == "solo"
    assert removed == "long hair"


def test_removing_a_tag_inside_a_weighted_group_counts_it_as_present_for_add():
    prompt, added, _ = run("(long hair:1.2), solo", add_tags="long hair")

    assert prompt == "(long hair:1.2), solo" and added == ""


def test_duplicate_entries_in_the_boxes_are_added_once():
    prompt, added, _ = run("1girl", add_tags="smile, Smile, smile")

    assert prompt == "1girl, smile"
    assert added == "smile"


def test_remove_wins_when_a_tag_is_in_both_boxes():
    prompt, added, removed = run("1girl", add_tags="smile", remove_tags="smile")

    assert prompt == "1girl"
    assert added == "" and removed == ""


def test_add_and_remove_together():
    prompt, added, removed = run("1girl, solo, long hair", add_tags="smile", remove_tags="long hair, solo")

    assert prompt == "1girl, smile"
    assert added == "smile"
    assert removed == "solo, long hair", "removed tags are reported in the order the prompt had them"


def test_boxes_accept_newlines_and_messy_separators():
    prompt, added, _ = run("1girl", add_tags="smile\n  long hair ,\nblush")

    assert prompt == "1girl, smile, long hair, blush"
    assert added == "smile, long hair, blush"


def test_empty_inputs_return_the_prompt_untouched():
    prompt, added, removed = run()
    assert (prompt, added, removed) == ("", "", "")

    text = "1girl, solo"
    assert run(text) == (text, "", "")


def test_adding_to_an_empty_prompt_just_returns_the_new_tags():
    assert run(add_tags="1girl, solo") == ("1girl, solo", "1girl, solo", "")


def test_a_tag_containing_a_comma_cannot_be_split_out():
    # Commas separate tags everywhere else in the toolkit, so this is expected, not silent data loss.
    prompt, added, _ = run("1girl", add_tags="bow, ribbon")

    assert prompt == "1girl, bow, ribbon"
    assert added == "bow, ribbon"

def test_full_width_commas_separate_the_input_boxes():
    prompt, added, removed = run("1girl, solo", add_tags="微笑，长发", remove_tags="")

    assert added == "微笑, 长发"
    assert prompt == "1girl, solo, 微笑, 长发"

    prompt, _, removed = run("1girl, solo, 微笑, 长发", remove_tags="微笑；长发")
    assert prompt == "1girl, solo"
    assert removed == "微笑, 长发"


def test_full_width_commas_inside_a_weighted_group_are_left_alone():
    prompt, added, _ = run("1girl", add_tags="(blue eyes:1.2)，smile")

    assert added == "(blue eyes:1.2), smile"
    assert prompt == "1girl, (blue eyes:1.2), smile"
    assert "blue eyes:1.2" in prompt


def test_the_prompt_keeps_its_own_full_width_commas():
    # A Chinese sentence is one part, not a tag list: nothing is added or removed, so it passes through
    # byte for byte instead of being rewritten with half-width commas.
    original = "真实Cosplay摄影风格，亚洲coser，cos的角色是explicit"
    prompt, added, removed = run(original)

    assert prompt == original
    assert (added, removed) == ("", "")


def test_a_tag_glued_into_longer_text_is_reported_not_removed(capsys):
    # The reported case: "explicit" is the tail of a Chinese sentence, with no separator before it, so it
    # is not a tag at all and removing it by substring would leave broken text behind.
    original = "真实Cosplay摄影风格，亚洲coser，cos的角色是explicit, normal quality"
    prompt, _, removed = run(original, remove_tags="explicit, normal quality")

    assert removed == "normal quality"
    assert "explicit" in prompt
    assert "cos的角色是explicit" in prompt
    assert "explicit" in capsys.readouterr().out


def test_tags_that_are_simply_absent_are_not_reported(capsys):
    prompt, _, removed = run("1girl, solo", remove_tags="worst quality, censored")

    assert removed == ""
    assert prompt == "1girl, solo"
    assert capsys.readouterr().out == ""

def test_a_danbooru_tag_with_parentheses_is_still_escaped():
    _, added, _ = run("1girl", add_tags="utdr_(toby_fox)")

    assert added == "utdr_\\(toby_fox\\)"

def test_a_tag_that_is_a_substring_of_another_tag_is_not_reported(capsys):
    # "censored" lives inside "uncensored", which is a different tag, not text glued to it.
    prompt, _, removed = run("1girl, uncensored", remove_tags="censored")

    assert (prompt, removed) == ("1girl, uncensored", "")
    assert capsys.readouterr().out == ""


def test_a_tag_glued_to_chinese_is_reported_once(capsys):
    prompt, _, _ = run("cos的角色是explicit, 1girl", remove_tags="explicit, explicit")

    assert "cos的角色是explicit" in prompt
    assert capsys.readouterr().out.count("explicit") == 1
