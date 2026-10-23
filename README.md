# ComfyUI-Danbooru-Tag-Toolkit

Danbooru tag workflow tools for ComfyUI: sort/select tags from an Excel database, browse Danbooru posts, resolve
artist tags from external URLs, and manage a personal prompt library.

## Highlights

- **All-in-One tag sorter + visual selector** driven by your own Excel/CSV category database
- **PixAI Tagger v1.0**: tag local images into 30,877 Danbooru tags and feed them into the sorter / dataset saver
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
| `Danbooru Tag Toolkit - Tag Add / Remove` | `DanbooruTagAddRemoveNode` | Adds tags the prompt is missing and removes the ones you list.<br>Outputs: `prompt`, `added_tags`, `removed_tags` |
| `Danbooru Tag Toolkit - PixAI Tagger` | `DanbooruPixAITaggerNode` | Tags local images with PixAI Tagger v1.0 (30,877 Danbooru tags, six categories).<br>Outputs: `tags` (list), `merged_tags`, `scores_json` |
| `Danbooru Tag Toolkit - Lineart Trace` | `DanbooruLineartTraceNode` | Retraces black line art into smooth antialiased curves (Potrace), transparent background by default.<br>Outputs: `image` |
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

`transformers` and `timm` are only needed by the PixAI Tagger node; the rest of the toolkit works
without them. That node also needs its weights, see [PixAI Tagger](#pixai-tagger).

`potracer` is only needed by the Lineart Trace node. It is listed in `requirements.txt`, but the
package also loads without it: the node then reports `pip install potracer` instead of failing.

## Running the tests

```powershell
$env:PYTHONPATH="$PWD/tests"; pytest tests     # PowerShell, from this folder
PYTHONPATH=tests pytest tests                  # bash
```

`tests/sitecustomize.py` stubs ComfyUI's runtime so the node package can be imported outside ComfyUI.
`pytest` on its own would pick up ComfyUI's own test paths, so pass `tests` explicitly.

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

### Ordering and quality floor

Danbooru's bare `order:score` / `order:favcount` / `order:random` searches time out (HTTP 500 `QueryCanceled` on their
side), so the toolbar's `Order` selector adds a quality floor automatically:

| Order | Query sent to Danbooru | On timeout |
|---|---|---|
| `newest` (default) | your tags + rating only | - |
| `best score` | `score:>100 order:score` | retried with `score:>1000` |
| `most favorites` | `favcount:>100 order:favcount` | retried with `favcount:>500` |
| `random` | `score:>200 order:random` | retried with `score:>1000` |

- `Min score` (default `0` = automatic) overrides the floor with `score:>=N`.
- Only browser-displayable still images are requested (`filetype:jpg,png,webp,gif,bmp` is appended automatically).
  This matters a lot for the ordered modes: most all-time high-score posts are `mp4`/`webm` animations, so without the
  filter `best score` only produced a handful of cards per page. Type `filetype:` yourself to override it.
- Slightly more posts than requested are fetched and trimmed, so a page still fills up if a few entries have no preview image.
- If you type `order:` / `score:` / `favcount:` yourself, nothing is added - the search box always wins.
- The status line shows the query that was actually used, e.g. `Loaded 24 posts. · meion score:>100 order:score`.
- Ordered queries that come back empty (Danbooru sometimes swallows a timeout) are retried once.

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

## Tag Add / Remove

`Danbooru Tag Toolkit - Tag Add / Remove` patches a prompt on the way through the graph: tags you list in
`add_tags` are appended when the prompt does not have them yet, and tags you list in `remove_tags` are
deleted when it does. Anything else is passed through untouched.

| Input | Default | Notes |
|---|---|---|
| `prompt` | empty | the prompt to patch; connect a string or type one |
| `add_tags` | empty | comma or newline separated; already-present tags are skipped |
| `remove_tags` | empty | comma or newline separated; absent tags change nothing |
| `add_to_front` | off | on = new tags go to the front instead of the end |

Outputs: `prompt` (the patched prompt), `added_tags` and `removed_tags` (what actually changed, in prompt
order, for logging or a second branch).

How tags are matched, shared with the rest of the toolkit:

- case-insensitive, and `long_hair` is the same tag as `long hair`
- `(tag)` / `((tag))` weights are wrappers, not part of the name
- `utdr_\(toby_fox\)` and `utdr_(toby_fox)` are the same tag
- `(long hair, blue eyes:1.2)` counts as both inner tags; removing one keeps the group and its weight,
  removing both drops the group
- a tag in both boxes ends up **removed** (the remove box wins)
- when nothing matches, the prompt is returned byte for byte, so it can sit in a graph without reformatting

```
prompt:  1girl, solo, long hair
add:     smile
remove:  solo
result: 1girl, long hair, smile
```

## PixAI Tagger

`Danbooru Tag Toolkit - PixAI Tagger` tags your own images with [PixAI Tagger v1.0](https://huggingface.co/pixai-labs/pixai-tagger-v1.0)
(30,877 Danbooru tags in six categories), so the toolkit works offline on local files instead of only on
Danbooru posts.

### Weights

The node reads `ComfyUI/models/taggers/<name>/` and **downloads the weights on the first run** when that
folder is empty, with a progress bar in the UI. Nothing else in the toolkit downloads anything.

- Only `config.json`, `preprocessor_config.json` and `model.safetensors` (~1.9 GB) are fetched; the model's
  code is vendored in `vendor/pixai_tagger/`, so the node never executes code that came with the weights.
- If huggingface.co is slow or blocked, set `HF_ENDPOINT=https://hf-mirror.com` before starting ComfyUI.
  Downloads resume: an interrupted run continues from the partial file.
- Turn off `auto_download` to stay offline, then place the files yourself:

```bash
hf download pixai-labs/pixai-tagger-v1.0 --local-dir ComfyUI/models/taggers/pixai-tagger-v1.0
```

- `download_repo` points the download at a different Hub repo if you mirror the weights yourself.

Optional: `python scripts/convert_pixai_tagger_bf16.py ComfyUI/models/taggers/pixai-tagger-v1.0` writes a
bfloat16 copy next to it (1.9 GB -> 0.9 GB, identical results, faster first load).

### Inputs

| Input | Default | Notes |
|---|---|---|
| `model` | `pixai-tagger-v1.0` | every folder under `models/taggers/` with `config.json` + a `.safetensors` file. The default name is listed even before it is downloaded, so a workflow saved on another machine still validates. |
| `auto_download` | on | fetches `download_repo` into `models/taggers/` when the selected model is missing |
| `download_repo` | `pixai-labs/pixai-tagger-v1.0` | Hub repo used by `auto_download` |
| `device` / `dtype` | `auto` | `auto` uses ComfyUI's device, bfloat16 on CUDA and float32 on CPU |
| `threshold_general` / `character` / `copyright` / `style` / `meta` / `rating` | `0.17` / `0.27` / `0.24` / `0.15` / `0.17` / `0.41` | the model card's per-category macro-F1 values |
| `exclude_categories` | `meta, rating` | keeps `highres`, `rating:s`, ... out of dataset captions |
| `sort_by` | `category` | `category` = model group order, `score` = most confident first |
| `max_tags_per_category` | `0` | `0` keeps every tag above the threshold |
| `replace_underscore` | off | keep it off: the workbook matches Danbooru's underscore tags |
| `free_after_run` | off | frees the tagger's ~1.1 GB when it competes with the checkpoint for VRAM |

### Outputs

| Output | Type | Use |
|---|---|---|
| `tags` | STRING list, one entry per image | `Dataset Saver` captions, or per image into `All-in-One` |
| `merged_tags` | STRING | one call into `All-in-One` or `CLIPTextEncode` |
| `scores_json` | STRING list | per-image `{"general": {"1girl": 0.98}}` for filtering or your own UI |

Tags are emitted as native Danbooru tags with parentheses escaped (`artoria_pendragon_\(fate\)`), exactly like
the gallery's `prompts` output, so the sorter, the cleaner and the prompt nodes parse them unchanged.

### Workflows

1. **Caption a dataset**: `Gallery Lite.images` (or `LoadImage`) -> `PixAI Tagger` -> `Dataset Saver.prompts`
   writes `image.png` + `image.txt` pairs.
2. **Prompt from a reference image**: `LoadImage` -> `PixAI Tagger.merged_tags` -> `All-in-One.tags`, then pick
   the rows you want in the node UI.
3. **Artist tags**: the model's `style` category contains artist tags, so they land in 画师词 like any other
   artist tag.

The tagger has no UI of its own: `All-in-One` is the place to review, filter and select what it produced.

### Notes

- Cost: ~1.1 GB VRAM in bfloat16 and about 0.25 s per 1008x1008 image on an RTX 5060 Laptop; the first call
  also loads the checkpoint (~2 s warm, longer on a cold disk cache). `fp32` is 2.1 GB / ~0.75 s.
- Images are resized to fit 1008x1008 and centre padded, never stretched.
- 94.8% of the model's tags are already in `tags_database/danbooru_tags.xlsx`. The remaining 1,602 (mostly
  characters and copyrights) fall into 未归类词 until they are added; `python scripts/report_missing_tags.py`
  writes them to `tags_database/reports/missing_tags.csv`.
- `rating` uses Danbooru's own `rating:g` / `rating:s` / `rating:q` / `rating:e`.
- Thresholds are image dependent; treat the defaults as starting points and lower them for more, noisier tags.

## Lineart Trace

`Danbooru Tag Toolkit - Lineart Trace` smooths black line art: it binarizes the image, retraces the
shapes with [Potrace](https://potrace.sourceforge.net/), and renders the resulting curves back to an
antialiased image (transparent by default). Useful after an AI lineart / coloring pass whose lines are
jagged, or to clean a sketch before a ControlNet or img2img run.

Needs the optional `potracer` package (pure Python): `pip install potracer`.

### Inputs

| Input | Default | Notes |
|---|---|---|
| `threshold` | `0.70` | pixels darker than this count as line; raise it when thin lines disappear |
| `despeckle` | `3` | area of the specks Potrace drops; lower it when fine details vanish |
| `smoothness` | `1.0` | `0` keeps hard corners, higher values round them (Potrace's `alphamax`) |
| `antialias` | `3` | internal render scale, independent of `output_scale` |
| `pre_blur` | `0.0` | Gaussian radius applied before binarizing |
| `median_filter` | off | 3x3 median, suppresses noise; leave it off if thin lines disappear |
| `output_scale` | `1` | output size multiplier (`2` turns 1024x1536 into 2048x3072) |
| `transparent_background` | on | lines become alpha; turn it off for black-on-white |

### Output

`image` is `RGBA` when `transparent_background` is on (black pixels + alpha, so `Save Image` writes a
transparent PNG) and `RGB` when it is off. A batch is processed frame by frame.

### Notes

- ~2 s for a 1024x1536 line art on CPU; cost grows with `antialias` and `output_scale` squared.
- Potrace traces the shapes it is given; it cannot recover detail that the binarization already lost.
  Lower `threshold` or disable `median_filter` first when lines break up.
- This node is an independent implementation: `potracer` does the curve fitting and the rendering uses
  Pillow, so no third-party source is vendored. `potracer` is GPLv2+ and is shipped as a dependency, not
  as part of this MIT package. Compared with the original
  [ComfyUI-potrace_Line](https://github.com/tori29umai0123/ComfyUI-potrace_Line) on its example image, the
  output differs by 0.62/255 on average (0.46% of pixels differ by more than 32).

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
- The only outbound requests are to `danbooru.donmai.us` (API + images) issued from your own ComfyUI server,
  plus the one-time PixAI Tagger weight download from huggingface.co (or your `HF_ENDPOINT` mirror).
  Turn off `auto_download` and the node never reaches the network.
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
| PixAI Tagger says the model is missing | `auto_download` is off, or the download failed. Turn it on, or put `config.json` + a `.safetensors` file in `ComfyUI/models/taggers/<name>/` and hard-refresh so the node list rebuilds. |
| PixAI Tagger download stalls on a fresh machine | huggingface.co is slow or blocked; set `HF_ENDPOINT=https://hf-mirror.com` and restart ComfyUI. Re-running resumes the partial download. |
| PixAI Tagger runs out of VRAM next to the checkpoint | Turn on `free_after_run` (releases ~1.1 GB after each run) or set `device=cpu` (slower). |
| Node UI looks stale after updating | Hard-refresh the browser (`Ctrl+F5`) and restart ComfyUI. |

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT. See `LICENSE`.
