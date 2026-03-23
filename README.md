# ComfyUI-Danbooru-Tag-Toolkit

Danbooru tag workflow tools for ComfyUI.

## Highlights

- All-in-one Danbooru tag sorting + visual selection
- Lightweight Danbooru gallery node (image + prompt list output)
- Flexible category mapping and output order from Excel/CSV database
- Works with both direct input tags and linked upstream prompt sources

## Screenshots

### All-in-One + Gallery Workflow

![Workflow Overview](example/20260302-102438.jpg)

### Node UI in ComfyUI

![Node UI](example/20260302-102453.jpg)

## Example Workflow

- JSON workflow file: [`example/example_worlflow.json`](example/example_worlflow.json)

## Included Nodes

- `Danbooru Tag Toolkit - All-in-One` (`DanbooruTagSorterSelectorNode`)
  - Outputs: `SELECTED_TAGS`, `SELECTED_WITH_PREFIX`, `ALL_TAGS`

- `Danbooru Tag Toolkit - Danbooru Gallery Lite` (`DanbooruTagGalleryLiteNode`)
  - Outputs: `images` (list), `prompts` (list)

## Installation

1. Clone or copy this repo into ComfyUI `custom_nodes`.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Restart ComfyUI.

## Quick Start

1. Add `Danbooru Tag Toolkit - Danbooru Gallery Lite`.
2. Search and select one or multiple posts in gallery.
3. Connect gallery prompt output to `Danbooru Tag Toolkit - All-in-One` `tags` input.
4. Click `Refresh` in All-in-One to preview categories from current selection.
5. Select category rows/tags and use final text outputs.

## Tag Database

Default file:

- `tags_database/danbooru_tags.xlsx`

Required columns:

- `english`
- `category`
- `subcategory`

You can use custom `.xlsx`/`.csv` by setting `excel_file` in node settings.

### Multi-language Workbook Workflow

The toolkit now supports a single-workbook i18n structure for `All-in-One`.

Keep the original `category` / `subcategory` columns for backward compatibility, then add these optional columns through the helper script:

- `category_key`
- `category_zh`
- `category_en`
- `subcategory_key`
- `subcategory_zh`
- `subcategory_en`

Step 1: extract a translation template from your current workbooks:

```bash
python scripts/translate_tag_workbooks.py extract
```

This creates `tags_database/translation_map_i18n.json`.

Step 2: fill the generated JSON with stable keys plus translated `zh` / `en` labels for each `category` and `subcategory`.

Step 3: build migrated workbook copies:

```bash
python scripts/translate_tag_workbooks.py migrate
```

By default, the script keeps the original workbook untouched and writes new copies such as:

- `tags_database/danbooru_tags_i18n.xlsx`
- `tags_database/danbooru_tags_2509_i18n.xlsx`

Benefits of this workflow:

- Old workflows still work because legacy `category` / `subcategory` stay in place
- New workflows can render localized labels from `*_zh` / `*_en`
- Existing mapping / order configs remain compatible because the backend resolves old Chinese aliases to stable keys

Note: the runtime already supports both legacy workbooks and migrated i18n workbooks, so you can adopt this gradually.

## Configuration

- `defaults_config.json`
  - `mapping`: default category mapping
  - `order`: default category output order

### Category Mapping / Order Compatibility

For final output categories, the runtime accepts all of these forms:

- Chinese labels, for example `画师词`
- Short English labels, for example `Artist`
- Internal keys, for example `artist_terms`
- Legacy English labels, for example `Artist Terms`

Examples:

```python
{("人物", "对象"): "Subject"}
{("服饰", "*"): "outfit_terms"}
```

```json
["Background", "Subject", "Uncategorized"]
```

So existing Chinese workflows keep working, and English-based presets can also be used directly.

## License

MIT. See `LICENSE`.
