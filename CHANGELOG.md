# Changelog

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
