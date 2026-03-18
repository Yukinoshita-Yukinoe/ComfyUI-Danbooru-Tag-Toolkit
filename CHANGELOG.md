# Changelog

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
