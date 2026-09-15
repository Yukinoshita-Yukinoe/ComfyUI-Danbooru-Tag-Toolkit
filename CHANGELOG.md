# Changelog

## Unreleased

### Added

- Gallery ordering: `newest` (default) / `best score` / `most favorites` / `random`, plus a `Min score` field.
  Because Danbooru's bare `order:score` / `order:favcount` / `order:random` searches time out, the node adds a quality
  floor automatically (`score:>100`, `favcount:>100`, `score:>200`) and raises it if the API still times out.
- Gallery status line now shows the query that was actually sent (`used_tags`) and any fallback notice.

### Fixed

- Ordered gallery queries that return an empty page (Danbooru occasionally swallows a timeout) are retried once.
- Gallery pages now fill up when ordering: only browser-displayable still images are requested
  (`filetype:jpg,png,webp,gif,bmp`) and slightly more posts are fetched before trimming. Without this, `best score` showed
  only a few cards per page because most all-time high-score posts are `mp4`/`webm` animations (50 fetched -> 8 usable).
- GIF posts are now supported by the gallery (browser displays them; the node output uses the first frame).

## 1.1.0 - 2026-09-14

### Added

- **Artist Lookup node** (`DanbooruArtistLookupNode`): resolves artist tags from a post source URL, an artist page URL,
  or the original file md5 (anonymous Danbooru API, no key required).
- **URL input in the gallery search box**: Danbooru post links open that post directly, artwork URLs are matched by
  `source` (or `md5` for CDN links), artist page URLs switch to that artist's posts, with links to the post / artist page.
- Gallery posts now carry the Danbooru `source` field; artist tags are shown under each card and in the selected list and
  are clickable (they open the artist's posts on Danbooru).
- `Danbooru Tag Toolkit - Dataset Saver` node: saves gallery images together with same-name `.txt` caption sidecars
  (optional previews, optional embedded workflow).
- Gallery thumbnails now retry transient failures with backoff and show a `Retry` placeholder instead of dropping the post.
- New backend endpoints: streaming gallery image proxy, `/danbooru_tag_picker/resolve`,
  `/danbooru_tag_picker/artist/lookup` + `/lookup_batch`, `/danbooru_tag_gallery/cache/stats|clear`.

### Fixed

- **Security**: user-controlled strings are rendered with `textContent` / property assignment instead of `innerHTML`
  (prompt selector, gallery, tag labels, tooltips, image names), so an imported prompt library can no longer inject scripts.
- **Security**: preview uploads are content-sniffed and whitelisted (png/jpg/webp/gif/bmp, 16 MB cap), preview URLs are
  confined to `prompt_selector/preview/`, and zip imports can no longer write outside that folder (zip-slip).
- Gallery cards were cropped at any canvas zoom other than 100% (card heights now account for the canvas scale).
- Gallery cards could be clipped while images were still loading (heights now come from the post aspect ratio).
- Gallery thumbnails that failed once were removed from the page and from the saved state.
- The prompt selector side preview panel could appear in the top-left corner of the canvas after switching workflows.
- Two prompt selector nodes fought over the same tooltip / library window (per-node ownership + per-instance modal).
- Gallery masonry layout re-measured on every image load and could reflow the whole grid dozens of times.
- Prompt preview images were re-downloaded on every hover (cache-buster removed, image element reused).
- Blocking network / file IO inside `aiohttp` handlers (gallery posts, autocomplete, image proxy, pandas parses, profile
  files, artist lookups) now runs in worker threads.
- `403 Forbidden` from Danbooru is reported as a clear rate-limit message (and the request falls back when only the
  custom `User-Agent` was rejected) instead of a bare HTTP error.

### Changed

- All Danbooru API calls share a global 1 request/second throttle plus caches (posts 2 min, autocomplete 5 min, artist
  lookups 15 min); image downloads are not throttled.
- The gallery image proxy streams the response instead of buffering the whole file in memory.
- The prompt selector preview panel only runs its `requestAnimationFrame` loop while it is actually active.
- Removed the redundant `Resolve Artist` gallery button in favour of the URL-aware search box.
- Removed dead code (unused tooltip paths / CSS) and avoided redundant style writes in the gallery grid.

## 1.0.2 - 2026-05-26

### Added
- Added a Gelbooru-backed fallback path for `Danbooru Gallery Lite` when Danbooru gallery requests are not usable in the current environment.
- Added a local gallery image proxy route so preview thumbnails no longer depend on direct browser hotlink access.
- Added per-post detail hydration and cache for gallery category sections (`artist`, `copyright`, `character`, `general`, `meta`).
- Added a small background warmup step after gallery load to reduce first-hover tooltip delay for the first visible posts.

### Fixed
- Fixed gallery tooltip categorization when using the Gelbooru fallback path by loading structured tag sections from post detail pages instead of showing everything as `general`.
- Fixed selected gallery image loading by resolving higher-quality detail/sample/original image URLs from Gelbooru post pages when available.
- Fixed URL-encoded Gelbooru tag text in category sections so values like `%28...%29` display as normal parentheses.
- Fixed rating filter mapping for fallback gallery mode so ComfyUI `safe/questionable` selections align with Gelbooru `general/sensitive` values.

## 1.0.1 - 2026-03-18

### Added
- Added page-level `Select Page` action for the gallery node.
- Added a larger default prompt library window size for `Toolkit Prompt Selector`.

### Fixed
- Fixed `Danbooru Tag Toolkit - All-in-One` layout issues on newer ComfyUI frontends, including unstable bottom spacing, width jumps, and DOM UI overflow past the node bounds.
- Fixed `Selected Category Rows` scrolling so the right-side panel scrolls as a whole and no longer lets the preview block overlap the list.
- Fixed `Toolkit Prompt Mixer` workflow restore behavior so linked prompt selections persist more reliably when switching away and back.
- Fixed `Danbooru Gallery Lite` DOM UI height overflow so the gallery stays clipped to the node bounds.
- Added extra DOM widget sizing guards for ComfyUI Node 2.0-style layout behavior to prevent runaway vertical stretching in `All-in-One` and `Danbooru Gallery Lite`.

### Compatibility
- Verified against `comfyui-frontend-package 1.41.20`.
- Kept compatibility with older ComfyUI frontends in user testing while improving newer frontend and Node 2.0 layout behavior.
