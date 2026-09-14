# ComfyUI-Danbooru-Tag-Toolkit

Danbooru tag workflow tools for ComfyUI: sort/select tags from an Excel database, browse Danbooru posts, resolve
artist tags from external URLs, and manage a personal prompt library.

## Highlights

- **All-in-One tag sorter + visual selector** driven by your own Excel/CSV category database
- **Danbooru Gallery Lite**: search posts, pick images + prompts, paste a URL to jump straight to a post or artist
- **Artist Lookup**: external URL -> Danbooru artist tag (`source`, `md5`, artist page URLs; fully anonymous)
- **Prompt Selector / Prompt Mixer**: local prompt library with preview images, weights and drag reordering
- **Dataset Saver**: save gallery images together with same-name `.txt` caption sidecars
- Flexible category mapping / output order, and a multi-language workbook workflow

## Screenshots

### All-in-One + Gallery Workflow

![Workflow Overview](example/20260302-102438.jpg)

### Node UI in ComfyUI

![Node UI](example/20260302-102453.jpg)

## Example Workflow

- JSON workflow file: [`example/example_worlflow.json`](example/example_worlflow.json)

## Included Nodes

| Node | Class | What it does |
|---|---|---|
| `Danbooru Tag Toolkit - All-in-One` | `DanbooruTagSorterSelectorNode` | Sorts input tags against your database, shows category rows + visual selection.<br>Outputs: `SELECTED_TAGS`, `SELECTED_WITH_PREFIX`, `ALL_TAGS` |
| `Danbooru Tag Toolkit - Danbooru Gallery Lite` | `DanbooruTagGalleryLiteNode` | Browses Danbooru posts (tag search, rating, paging), pick posts for images + prompts.<br>Outputs: `images` (list), `prompts` (list), `merged_prompt` |
| `Danbooru Tag Toolkit - Artist Lookup` | `DanbooruArtistLookupNode` | Resolves artist tags from a post source URL, an artist page URL or the original file md5.<br>Outputs: `artist_tags`, `artists` (list), `source`, `post_id`, `matched_by` |
| `Danbooru Tag Toolkit - Specific Tag Cleaner` | `DanbooruTagSpecificCleanerNode` | Removes tags covered by a more specific tag (`jacket` vs `white jacket`).<br>Outputs: `cleaned_prompt`, `removed_tags`, `cleaned_prompt_list`, `removed_tags_list` |
| `Danbooru Tag Toolkit - Dataset Saver` | `DanbooruDatasetSaverNode` | Saves images with matching `.txt` caption files (optional previews, optional embedded workflow). |
| `Toolkit Prompt Selector` | `DanbooruPromptSelector` | Local prompt library: categories, preview images, search, batch operations; exposes a side preview panel. |
| `Toolkit Prompt Mixer` | `DanbooruPromptMixerNode` | Mixes / reorders / weights prompt fragments into one text output. |

## Installation

1. Clone or copy this repo into ComfyUI `custom_nodes`.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Restart ComfyUI, then hard-refresh the browser (`Ctrl+F5`) after updates.

## Quick Start

1. Add `Danbooru Tag Toolkit - Danbooru Gallery Lite`.
2. Search for tags (or paste a URL, see below) and select one or more posts.
3. Connect the gallery `prompts` output to the `Danbooru Tag Toolkit - All-in-One` `tags` input.
4. Click `Refresh` in All-in-One to preview categories from the current selection.
5. Select category rows/tags and use the final text outputs.

## Danbooru Gallery Lite

### Search box

- Plain text is a normal Danbooru tag search (`meion 1girl`, `rating:safe`, `id:...` are passed through as tags).
- `Rating`, `Limit` and paging (`Load`, `Prev`, `Next`, page + `Go`) work as expected.
- `Select Page` selects every loaded post, `Clear Selection` clears, `Clear Cache` drops the server-side post/image caches.

### Pasting a URL into the search box

Only inputs starting with `http(s)://` (or `//`) are treated as URLs; everything else stays a tag search.

| Paste this | What happens |
|---|---|
| `danbooru.donmai.us/posts/1234567` | Loads and shows exactly that post, with a link to its Danbooru page |
| A pixiv / twitter artwork page or image URL | Matched by the post `source` (Danbooru CDN image links use `md5`) and shown as a single post |
| An artist page URL such as `pixiv.net/users/12345` | Switches the search box to that artist's tag, lists their posts and offers a link to the artist page |
| Anything else | A status line explains that Danbooru has no post or artist for that URL |

Artist tags under each card and in the selected list are clickable and open that artist's posts on Danbooru.

### Behaviour notes

- Thumbnails are fetched through the local ComfyUI server (`/danbooru_tag_gallery/image`), so the browser never hotlinks
  the CDN. Big files are streamed and capped (32 MB), and unsupported content types are downgraded to
  `application/octet-stream`.
- A thumbnail that fails is retried (400 ms / 800 ms backoff, then the fallback URL). If it still fails, the card shows a
  `Retry` placeholder instead of deleting the post - a transient network error no longer removes images from the page.
- Cards are sized from the post aspect ratio and take the canvas zoom into account, so images are not cropped at any
  zoom level.
- The selected list uses compact 56x56 square crops (`object-fit: cover`) - that is intentional.

## Artist Lookup (anonymous)

`Danbooru Tag Toolkit - Artist Lookup` covers the "external URL -> Danbooru" direction. It tries three anonymous
queries, in order:

1. `posts.json?tags=source:<url>` - the exact post source shown on Danbooru (most accurate).
2. `posts.json?tags=md5:<hash>` - exact same file; only works for the **original file** (re-encoded / re-saved images do not match).
3. `artists.json?search[url_matches]=<url>` - artist page URLs such as `pixiv.net/users/12345`.

The same lookups power the gallery search box (see the table above).

Notes:

- All requests share a global throttle (1 request/second) plus a 15-minute cache, because anonymous Danbooru API access
  is rate limited.
- A descriptive `User-Agent` is always sent. If your network blocks it, set the environment variable
  `DTT_DANBOORU_USER_AGENT` to override it (an empty value disables the custom header entirely).
- Reverse image search (Danbooru IQDB) needs a logged-in account with an API key, so it is **not** used here; only exact
  md5 / source matching is supported.
- URLs are normalized before matching (`/en/` prefix, trailing slash, `#fragment`, host case).
- A `403 Forbidden` from Danbooru is usually Cloudflare rate limiting: the node reports it as a temporary limit and
  falls back to a plain request when only the custom `User-Agent` was rejected.

## Tag Database

Default file:

- `tags_database/danbooru_tags.xlsx`

Required columns:

- `english`
- `category`
- `subcategory`

You can use a custom `.xlsx` / `.csv` by setting `excel_file` in the node settings. Parsed workbooks are cached (memory +
`.tag_db_cache` on disk) and re-read only when the file changes.

### Multi-language Workbook Workflow

The toolkit supports a single-workbook i18n structure for `All-in-One`.

Keep the original `category` / `subcategory` columns for backward compatibility, then add these optional columns through
the helper script:

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

## Networking / Privacy

- All Danbooru access is anonymous; no API key is required and nothing is uploaded.
- The only outbound requests are to `danbooru.donmai.us` (API + images) issued from your own ComfyUI server.
- Danbooru API calls are throttled to 1 request/second and cached (posts 2 min, autocomplete 5 min, artist lookups 15 min).
- Image bytes are streamed through the local server instead of being embedded from the CDN in the browser.
- Prompt-library data stays in `prompt_selector/data.json` inside this node folder.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Gallery shows `Load failed: HTTP 403` / `临时限流` | Anonymous Danbooru rate limit (Cloudflare). Wait a few minutes; requests are already throttled. Try `DTT_DANBOORU_USER_AGENT=""` if you suspect the custom User-Agent. |
| A card shows `Retry` | The thumbnail could not be fetched after retries - click `Retry`; the post itself stays selected/usable. |
| Images look cropped | Check the canvas zoom; the gallery now compensates for it. If it still happens, please report the post URL. |
| Pasting a URL finds nothing | That artwork was likely never uploaded to Danbooru; the status line will say so. |
| Node UI looks stale after updating | Hard-refresh the browser (`Ctrl+F5`) and restart ComfyUI. |

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT. See `LICENSE`.
