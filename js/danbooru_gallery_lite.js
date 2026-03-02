import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.DanbooruTagGalleryLite";
const STYLE_ID = "dtg-lite-style";

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .dtg-root {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px;
            box-sizing: border-box;
            height: 100%;
            min-height: 360px;
            overflow: hidden;
            background: #171717;
            border: 1px solid #303030;
            border-radius: 8px;
            color: #e8e8e8;
            font-size: 12px;
        }
        .dtg-toolbar {
            display: grid;
            grid-template-columns: minmax(220px, 1fr) 120px 90px auto auto auto;
            gap: 8px;
            align-items: center;
        }
        .dtg-search-wrap {
            position: relative;
            min-width: 220px;
        }
        .dtg-search-wrap .dtg-input {
            width: 100%;
            box-sizing: border-box;
        }
        .dtg-suggest {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            max-height: 220px;
            overflow: auto;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            background: #0f0f0f;
            z-index: 1200;
            display: none;
        }
        .dtg-suggest.open {
            display: block;
        }
        .dtg-suggest-item {
            padding: 7px 8px;
            border-bottom: 1px solid #262626;
            cursor: pointer;
            color: #dfdfdf;
            display: flex;
            justify-content: space-between;
            gap: 8px;
        }
        .dtg-suggest-item:last-child {
            border-bottom: 0;
        }
        .dtg-suggest-item:hover {
            background: #1f2a38;
        }
        .dtg-categories {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            padding: 2px 2px 0;
            color: #d7d7d7;
            font-size: 12px;
        }
        .dtg-categories label {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }
        .dtg-input,
        .dtg-select,
        .dtg-number {
            height: 30px;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            background: #101010;
            color: #f0f0f0;
            padding: 0 8px;
            font-size: 12px;
        }
        .dtg-btn {
            height: 30px;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            background: #222;
            color: #f0f0f0;
            padding: 0 10px;
            cursor: pointer;
            font-size: 12px;
        }
        .dtg-btn:hover {
            background: #2c2c2c;
        }
        .dtg-status {
            color: #9fb6d9;
            min-height: 18px;
        }
        .dtg-content {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 230px;
            gap: 10px;
            flex: 1 1 auto;
            min-height: 220px;
            max-height: none;
            overflow: hidden;
        }
        .dtg-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            grid-auto-rows: 1px;
            align-content: start;
            overflow-y: scroll;
            overflow-x: hidden;
            scrollbar-gutter: stable;
            padding-right: 2px;
            min-height: 0;
            height: 100%;
        }
        .dtg-card {
            position: relative;
            display: block;
            border: 1px solid #343434;
            border-radius: 8px;
            background: #121212;
            overflow: hidden;
            cursor: pointer;
        }
        .dtg-card:hover {
            border-color: #5477a7;
        }
        .dtg-card.selected {
            border-color: #25dd63;
            box-shadow: 0 0 0 2px rgba(37, 221, 99, 0.75) inset, 0 0 0 1px rgba(37, 221, 99, 0.55);
            background: #102417;
        }
        .dtg-card.selected .dtg-meta {
            color: #d6ffe2;
        }
        .dtg-check {
            position: absolute;
            top: 6px;
            right: 6px;
            z-index: 2;
            padding: 2px 6px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.2px;
            color: #04230f;
            background: #25dd63;
            border: 1px solid #7ef3ab;
            opacity: 0;
            transform: translateY(-2px);
            transition: opacity 0.15s ease, transform 0.15s ease;
            pointer-events: none;
        }
        .dtg-card.selected .dtg-check {
            opacity: 1;
            transform: translateY(0);
        }
        .dtg-thumb-wrap {
            width: 100%;
            overflow: hidden;
            background: #0b0b0b;
            display: block;
        }
        .dtg-thumb {
            width: 100%;
            height: auto;
            display: block;
        }
        .dtg-meta {
            padding: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
            color: #bdbdbd;
            font-size: 11px;
        }
        .dtg-empty {
            border: 1px dashed #3d3d3d;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            color: #8c8c8c;
        }
        .dtg-bottom {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            color: #c8c8c8;
        }
        .dtg-actions {
            display: flex;
            gap: 8px;
        }
        .dtg-picked {
            display: flex;
            flex-direction: column;
            min-height: 0;
            height: 100%;
            border: 1px solid #343434;
            border-radius: 8px;
            background: #121212;
            overflow: hidden;
        }
        .dtg-picked-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            padding: 8px;
            border-bottom: 1px solid #2a2a2a;
            color: #d8d8d8;
            font-size: 12px;
            flex-shrink: 0;
        }
        .dtg-picked-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 8px;
            overflow: auto;
            min-height: 0;
        }
        .dtg-picked-empty {
            color: #8c8c8c;
            border: 1px dashed #3d3d3d;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
            font-size: 11px;
        }
        .dtg-picked-item {
            display: grid;
            grid-template-columns: 56px minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
            border: 1px solid #343434;
            border-radius: 8px;
            background: #151515;
            padding: 6px;
        }
        .dtg-picked-thumb {
            width: 56px;
            height: 56px;
            border-radius: 6px;
            object-fit: cover;
            background: #0b0b0b;
        }
        .dtg-picked-meta {
            min-width: 0;
            color: #cfcfcf;
            font-size: 11px;
        }
        .dtg-picked-id {
            font-weight: 600;
            color: #f2f2f2;
            margin-bottom: 2px;
        }
        .dtg-picked-prompt {
            color: #bdbdbd;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .dtg-picked-remove {
            border: 1px solid #3a3a3a;
            background: #222;
            color: #ececec;
            border-radius: 6px;
            width: 26px;
            height: 26px;
            cursor: pointer;
            flex-shrink: 0;
        }
        .dtg-picked-remove:hover {
            background: #2c2c2c;
        }
        @media (max-width: 760px) {
            .dtg-toolbar {
                grid-template-columns: 1fr 1fr 1fr;
            }
        }
        @media (max-width: 980px) {
            .dtg-content {
                grid-template-columns: 1fr;
            }
            .dtg-picked {
                max-height: 220px;
            }
        }
    `;
    document.head.appendChild(style);
}

function getWidget(node, name) {
    return node?.widgets?.find(w => w?.name === name);
}

function hideWidget(widget) {
    if (!widget) return;
    widget.computeSize = () => [0, -4];
    widget.type = "hidden";
    widget.hidden = true;
    widget.serialize = true;
    widget.draw = () => {};
}

function parseSelectionData(rawValue) {
    const fallback = [];
    const isSelectionItem = item =>
        item &&
        typeof item === "object" &&
        String(item.post_id ?? "").trim().length > 0;
    if (!rawValue || typeof rawValue !== "string") return fallback;
    try {
        const data = JSON.parse(rawValue);
        if (!data || typeof data !== "object") return fallback;
        if (Array.isArray(data.selections)) {
            return data.selections.filter(isSelectionItem);
        }
        if (Array.isArray(data)) {
            return data.filter(isSelectionItem);
        }
        if (isSelectionItem(data)) {
            return [data];
        }
        return fallback;
    } catch {
        return fallback;
    }
}

function parseJsonObject(rawValue, fallback = {}) {
    if (!rawValue || typeof rawValue !== "string") return fallback;
    try {
        const data = JSON.parse(rawValue);
        return data && typeof data === "object" && !Array.isArray(data) ? data : fallback;
    } catch {
        return fallback;
    }
}

function parseJsonArray(rawValue, fallback = []) {
    if (!rawValue || typeof rawValue !== "string") return fallback;
    try {
        const data = JSON.parse(rawValue);
        return Array.isArray(data) ? data : fallback;
    } catch {
        return fallback;
    }
}

function parseTagString(tagString) {
    return String(tagString || "")
        .split(" ")
        .map(t => t.trim())
        .filter(Boolean);
}

function buildPromptLikeReference(postData, selectedCategories) {
    const filterTags = new Set([
        "watermark",
        "sample_watermark",
        "weibo_username",
        "weibo",
        "weibo_logo",
        "weibo_watermark",
        "censored",
        "mosaic_censoring",
        "artist_name",
        "twitter_username",
    ]);
    const categories = Array.isArray(selectedCategories) ? selectedCategories : [];
    const outputTags = [];

    categories.forEach(category => {
        const tags = parseTagString(postData?.[`tag_string_${category}`]);
        if (tags.length) {
            outputTags.push(...tags);
        }
    });

    let tagsToProcess = outputTags.length ? outputTags : parseTagString(postData?.tag_string);
    if (!tagsToProcess.length) return "";

    const deduped = [];
    const seen = new Set();
    tagsToProcess.forEach(tag => {
        const key = String(tag || "").trim().toLowerCase();
        if (!key || seen.has(key) || filterTags.has(key)) return;
        seen.add(key);
        deduped.push(tag);
    });
    return deduped.map(tag => String(tag).replaceAll("_", " ")).join(", ");
}

function toPrompt(tagString) {
    const tokens = String(tagString || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!tokens.length) return "";
    return tokens.map(token => token.replaceAll("_", " ")).join(", ");
}

function normalizePost(raw) {
    const post = raw && typeof raw === "object" ? raw : {};
    return {
        id: String(post.id ?? ""),
        score: Number(post.score ?? 0),
        rating: String(post.rating ?? ""),
        file_ext: String(post.file_ext ?? ""),
        md5: String(post.md5 ?? ""),
        preview_url: String(post.preview_url ?? ""),
        image_url: String(post.image_url ?? ""),
        display_url: String(post.display_url ?? ""),
        preview_width: Number(post.preview_width ?? 0),
        preview_height: Number(post.preview_height ?? 0),
        image_width: Number(post.image_width ?? 0),
        image_height: Number(post.image_height ?? 0),
        tag_string: String(post.tag_string ?? ""),
        tag_string_artist: String(post.tag_string_artist ?? ""),
        tag_string_copyright: String(post.tag_string_copyright ?? ""),
        tag_string_character: String(post.tag_string_character ?? ""),
        tag_string_general: String(post.tag_string_general ?? ""),
        tag_string_meta: String(post.tag_string_meta ?? ""),
        prompt: String(post.prompt ?? "") || toPrompt(post.tag_string),
    };
}

function syncSelectionWidget(node, selectionWidget, selectedMap) {
    if (!selectionWidget) return;
    const selections = Array.from(selectedMap.values());
    selectionWidget.value = JSON.stringify({ selections });
    if (typeof selectionWidget.callback === "function") {
        selectionWidget.callback(selectionWidget.value);
    }
    node?.setDirtyCanvas?.(true, true);
}

function setWidgetValue(widget, value) {
    if (!widget) return;
    widget.value = value;
    if (typeof widget.callback === "function") {
        widget.callback(value);
    }
}

app.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DanbooruTagGalleryLiteNode") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            injectStyle();

            this.setSize([860, 760]);
            let selectionWidget = getWidget(this, "selection_data");
            if (!selectionWidget) {
                selectionWidget = this.addWidget(
                    "text",
                    "selection_data",
                    JSON.stringify({ selections: [] }),
                    () => {},
                    { serialize: true }
                );
            }
            let stateWidget = getWidget(this, "gallery_state_json");
            if (!stateWidget) {
                stateWidget = this.addWidget("text", "gallery_state_json", "{}", () => {}, { serialize: true });
            }
            let postsWidget = getWidget(this, "gallery_posts_json");
            if (!postsWidget) {
                postsWidget = this.addWidget("text", "gallery_posts_json", "[]", () => {}, { serialize: true });
            }
            if (selectionWidget && (typeof selectionWidget.value !== "string" || !selectionWidget.value.trim())) {
                selectionWidget.value = JSON.stringify({ selections: [] });
            }
            if (stateWidget && (typeof stateWidget.value !== "string" || !stateWidget.value.trim())) {
                stateWidget.value = "{}";
            }
            if (postsWidget && (typeof postsWidget.value !== "string" || !postsWidget.value.trim())) {
                postsWidget.value = "[]";
            }
            hideWidget(selectionWidget);
            hideWidget(stateWidget);
            hideWidget(postsWidget);

            const root = document.createElement("div");
            root.className = "dtg-root";

            const toolbar = document.createElement("div");
            toolbar.className = "dtg-toolbar";

            const searchWrap = document.createElement("div");
            searchWrap.className = "dtg-search-wrap";
            const searchInput = document.createElement("input");
            searchInput.className = "dtg-input";
            searchInput.placeholder = "Search tags (comma separated)";
            const suggestBox = document.createElement("div");
            suggestBox.className = "dtg-suggest";
            searchWrap.appendChild(searchInput);
            searchWrap.appendChild(suggestBox);

            const ratingSelect = document.createElement("select");
            ratingSelect.className = "dtg-select";
            ratingSelect.innerHTML = `
                <option value="all">all</option>
                <option value="safe">safe</option>
                <option value="questionable">questionable</option>
                <option value="explicit">explicit</option>
            `;

            const limitInput = document.createElement("input");
            limitInput.className = "dtg-number";
            limitInput.type = "number";
            limitInput.min = "1";
            limitInput.max = "100";
            limitInput.value = "24";
            limitInput.title = "1 - 100";

            const loadBtn = document.createElement("button");
            loadBtn.className = "dtg-btn";
            loadBtn.textContent = "Load";

            const prevBtn = document.createElement("button");
            prevBtn.className = "dtg-btn";
            prevBtn.textContent = "Prev";

            const nextBtn = document.createElement("button");
            nextBtn.className = "dtg-btn";
            nextBtn.textContent = "Next";

            toolbar.appendChild(searchWrap);
            toolbar.appendChild(ratingSelect);
            toolbar.appendChild(limitInput);
            toolbar.appendChild(loadBtn);
            toolbar.appendChild(prevBtn);
            toolbar.appendChild(nextBtn);

            const categoryBar = document.createElement("div");
            categoryBar.className = "dtg-categories";
            const categoryTitle = document.createElement("span");
            categoryTitle.textContent = "Prompt categories:";
            categoryBar.appendChild(categoryTitle);
            const categoryCheckboxes = new Map();
            ["artist", "copyright", "character", "general", "meta"].forEach(key => {
                const label = document.createElement("label");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = key;
                checkbox.checked = ["copyright", "character", "general"].includes(key);
                categoryCheckboxes.set(key, checkbox);
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(key));
                categoryBar.appendChild(label);
            });

            const statusEl = document.createElement("div");
            statusEl.className = "dtg-status";
            statusEl.textContent = "Enter tags and click Load. (build hf8)";

            const content = document.createElement("div");
            content.className = "dtg-content";

            const grid = document.createElement("div");
            grid.className = "dtg-grid";

            const pickedPanel = document.createElement("div");
            pickedPanel.className = "dtg-picked";
            const pickedHead = document.createElement("div");
            pickedHead.className = "dtg-picked-head";
            const pickedTitle = document.createElement("div");
            pickedTitle.textContent = "Selected Images";
            const pickedCount = document.createElement("div");
            pickedCount.textContent = "0";
            pickedHead.appendChild(pickedTitle);
            pickedHead.appendChild(pickedCount);
            const pickedList = document.createElement("div");
            pickedList.className = "dtg-picked-list";
            pickedPanel.appendChild(pickedHead);
            pickedPanel.appendChild(pickedList);

            content.appendChild(grid);
            content.appendChild(pickedPanel);

            const bottom = document.createElement("div");
            bottom.className = "dtg-bottom";
            const summaryEl = document.createElement("div");
            const actionWrap = document.createElement("div");
            actionWrap.className = "dtg-actions";
            const clearCacheBtn = document.createElement("button");
            clearCacheBtn.className = "dtg-btn";
            clearCacheBtn.textContent = "Clear Cache";
            const clearBtn = document.createElement("button");
            clearBtn.className = "dtg-btn";
            clearBtn.textContent = "Clear Selection";
            bottom.appendChild(summaryEl);
            actionWrap.appendChild(clearCacheBtn);
            actionWrap.appendChild(clearBtn);
            bottom.appendChild(actionWrap);

            root.appendChild(toolbar);
            root.appendChild(categoryBar);
            root.appendChild(statusEl);
            root.appendChild(content);
            root.appendChild(bottom);

            const uiWidget = this.addDOMWidget("danbooru_gallery_lite_ui", "div", root, { serialize: false });

            const state = {
                node: this,
                selectionWidget,
                stateWidget,
                postsWidget,
                statusEl,
                summaryEl,
                searchInput,
                ratingSelect,
                limitInput,
                categoryCheckboxes,
                suggestBox,
                content,
                grid,
                pickedList,
                pickedCount,
                page: 1,
                loading: false,
                posts: [],
                selectedMap: new Map(),
                autocompleteReqId: 0,
                autocompleteTimer: null,
                scrollTimer: null,
                pendingScrollTop: 0,
                syncGridLayout: null,
            };
            this.__dtgState = state;

            const originalOnResize = this.onResize;
            const syncGridLayout = (size = this.size) => {
                const nodeHeight = Math.max(360, Number(Array.isArray(size) ? size[1] : this.size?.[1]) || 760);
                const nodeWidth = Math.max(360, Number(Array.isArray(size) ? size[0] : this.size?.[0]) || 720);
                const rootStyle = window.getComputedStyle(root);
                const paddingTop = parseFloat(rootStyle.paddingTop || "0");
                const paddingBottom = parseFloat(rootStyle.paddingBottom || "0");
                const gap = parseFloat(rootStyle.gap || "0");
                const nonGridHeight =
                    paddingTop +
                    paddingBottom +
                    (toolbar.offsetHeight || 0) +
                    (categoryBar.offsetHeight || 0) +
                    (statusEl.offsetHeight || 0) +
                    (bottom.offsetHeight || 0) +
                    (gap * 4) +
                    56;
                const contentHeight = Math.max(180, Math.floor(nodeHeight - nonGridHeight));
                content.style.height = `${contentHeight}px`;
                if (uiWidget?.element) {
                    uiWidget.element.style.height = `${Math.max(320, nodeHeight - 46)}px`;
                }

                const narrow = nodeWidth <= 980;
                const sidebarWidth = narrow ? 0 : 230;
                const contentGap = 10;
                const gridWidth = Math.max(180, nodeWidth - 30 - sidebarWidth - (narrow ? 0 : contentGap));
                const minCardWidth = 260;
                const maxColumns = narrow ? 2 : 3;
                const columns = Math.max(1, Math.min(maxColumns, Math.floor(gridWidth / minCardWidth) || 1));
                grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
                requestAnimationFrame(() => resizeAllMasonryCards());
            };
            this.onResize = size => {
                originalOnResize?.call(this, size);
                syncGridLayout(size);
            };
            state.syncGridLayout = syncGridLayout;

            function updateSummary() {
                state.summaryEl.textContent = `Page: ${state.page} | Posts: ${state.posts.length} | Selected: ${state.selectedMap.size}`;
            }

            function getSelectedCategories() {
                const selected = [];
                ["artist", "copyright", "character", "general", "meta"].forEach(key => {
                    const cb = state.categoryCheckboxes.get(key);
                    if (cb?.checked) selected.push(key);
                });
                return selected.length ? selected : ["copyright", "character", "general"];
            }

            function syncStateWidget(includePosts = false) {
                const payload = {
                    search: String(state.searchInput.value || ""),
                    rating: String(state.ratingSelect.value || "all"),
                    limit: Math.max(1, Math.min(100, Number(state.limitInput.value || 24))),
                    page: Math.max(1, Number(state.page || 1)),
                    scroll_top: Math.max(0, Number(state.grid.scrollTop || 0)),
                    selected_categories: getSelectedCategories(),
                };
                setWidgetValue(state.stateWidget, JSON.stringify(payload));
                if (includePosts) {
                    setWidgetValue(state.postsWidget, JSON.stringify(state.posts));
                }
            }

            function normalizeSearchForApi(raw) {
                const parts = String(raw || "")
                    .split(",")
                    .map(x => x.trim())
                    .filter(Boolean);
                if (!parts.length) return "";
                return parts.map(tag => (tag.includes(":") ? tag : tag.replace(/\s+/g, "_"))).join(" ");
            }

            function closeSuggest() {
                state.suggestBox.classList.remove("open");
                state.suggestBox.innerHTML = "";
            }

            function applyAutocompleteTag(tagName) {
                const raw = String(state.searchInput.value || "");
                const parts = raw.split(",");
                const leftParts = parts.slice(0, -1).map(x => x.trim()).filter(Boolean);
                leftParts.push(tagName);
                state.searchInput.value = `${leftParts.join(", ")}, `;
                syncStateWidget(false);
                closeSuggest();
                state.searchInput.focus();
            }

            function renderSuggestions(items) {
                state.suggestBox.innerHTML = "";
                if (!Array.isArray(items) || !items.length) {
                    closeSuggest();
                    return;
                }

                items.forEach(item => {
                    const name = String(item?.name || "").trim();
                    if (!name) return;
                    const row = document.createElement("div");
                    row.className = "dtg-suggest-item";
                    row.innerHTML = `<span>${name}</span><span>${Number(item?.post_count || 0).toLocaleString()}</span>`;
                    row.onmousedown = event => {
                        event.preventDefault();
                        applyAutocompleteTag(name);
                    };
                    state.suggestBox.appendChild(row);
                });

                if (!state.suggestBox.children.length) {
                    closeSuggest();
                    return;
                }
                state.suggestBox.classList.add("open");
            }

            async function requestAutocomplete() {
                const raw = String(state.searchInput.value || "");
                const parts = raw.split(",");
                const token = String(parts[parts.length - 1] || "").trim();
                if (token.length < 2) {
                    closeSuggest();
                    return;
                }

                const reqId = ++state.autocompleteReqId;
                try {
                    const query = new URLSearchParams({
                        q: token,
                        limit: "20",
                    });
                    const response = await api.fetchApi(`/danbooru_tag_gallery/autocomplete?${query.toString()}`, { cache: "no-store" });
                    if (!response.ok) {
                        closeSuggest();
                        return;
                    }
                    const payload = await response.json();
                    if (reqId !== state.autocompleteReqId) return;
                    renderSuggestions(Array.isArray(payload?.items) ? payload.items : []);
                } catch {
                    if (reqId !== state.autocompleteReqId) return;
                    closeSuggest();
                }
            }

            function updateSelectedPromptsByCategory() {
                if (!state.selectedMap.size) return;
                const selectedCategories = getSelectedCategories();
                const postMap = new Map(state.posts.map(post => [post.id, post]));
                let changed = false;
                state.selectedMap.forEach((value, key) => {
                    const post = postMap.get(String(key)) || value;
                    if (!post) return;
                    const prompt = buildPromptLikeReference(post, selectedCategories);
                    if (value.prompt !== prompt) {
                        value.prompt = prompt;
                        changed = true;
                    }
                });
                if (changed) {
                    saveSelection();
                }
            }

            function renderSelectedSidebar() {
                state.pickedList.innerHTML = "";
                const selectedItems = Array.from(state.selectedMap.values());
                state.pickedCount.textContent = String(selectedItems.length);
                if (!selectedItems.length) {
                    const empty = document.createElement("div");
                    empty.className = "dtg-picked-empty";
                    empty.textContent = "No selected images.";
                    state.pickedList.appendChild(empty);
                    return;
                }

                selectedItems.forEach(item => {
                    const postId = String(item?.post_id || "");
                    const row = document.createElement("div");
                    row.className = "dtg-picked-item";

                    const thumb = document.createElement("img");
                    thumb.className = "dtg-picked-thumb";
                    thumb.loading = "lazy";
                    thumb.src = String(item?.display_url || item?.preview_url || item?.image_url || "");
                    thumb.alt = postId || "selected";

                    const meta = document.createElement("div");
                    meta.className = "dtg-picked-meta";
                    const idLine = document.createElement("div");
                    idLine.className = "dtg-picked-id";
                    idLine.textContent = postId ? `#${postId}` : "(no id)";
                    const promptLine = document.createElement("div");
                    promptLine.className = "dtg-picked-prompt";
                    promptLine.textContent = String(item?.prompt || item?.tag_string || "").trim() || "(empty prompt)";
                    meta.appendChild(idLine);
                    meta.appendChild(promptLine);

                    const removeBtn = document.createElement("button");
                    removeBtn.className = "dtg-picked-remove";
                    removeBtn.textContent = "x";
                    removeBtn.title = "Remove";
                    removeBtn.onclick = event => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!postId) return;
                        state.selectedMap.delete(postId);
                        saveSelection();
                        renderPosts();
                    };

                    row.appendChild(thumb);
                    row.appendChild(meta);
                    row.appendChild(removeBtn);
                    state.pickedList.appendChild(row);
                });
            }

            function saveSelection() {
                syncSelectionWidget(state.node, state.selectionWidget, state.selectedMap);
                renderSelectedSidebar();
                updateSummary();
            }

            function resizeMasonryCard(card) {
                if (!card) return;
                const gridStyle = window.getComputedStyle(state.grid);
                const rowGap =
                    Number.parseInt(gridStyle.getPropertyValue("row-gap"), 10) ||
                    Number.parseInt(gridStyle.getPropertyValue("grid-row-gap"), 10) ||
                    8;
                const rowHeight = Number.parseInt(gridStyle.getPropertyValue("grid-auto-rows"), 10) || 1;
                const img = card.querySelector(".dtg-thumb");
                const meta = card.querySelector(".dtg-meta");
                const imgHeight = img?.getBoundingClientRect?.().height || img?.clientHeight || 0;
                const metaHeight = meta?.getBoundingClientRect?.().height || meta?.clientHeight || 0;
                const total = Math.ceil(imgHeight + metaHeight + 2);
                if (total <= 0) return;
                const span = Math.max(1, Math.ceil((total + rowGap) / (rowHeight + rowGap)));
                card.style.gridRowEnd = `span ${span}`;
            }

            function resizeAllMasonryCards() {
                state.grid.querySelectorAll(".dtg-card").forEach(card => resizeMasonryCard(card));
            }

            function renderPosts() {
                state.grid.innerHTML = "";
                if (!state.posts.length) {
                    state.grid.style.gridAutoRows = "auto";
                    const empty = document.createElement("div");
                    empty.className = "dtg-empty";
                    empty.textContent = "No posts loaded.";
                    empty.style.gridColumn = "1 / -1";
                    state.grid.appendChild(empty);
                    updateSummary();
                    return;
                }
                state.grid.style.gridAutoRows = "1px";

                const selectedCategories = getSelectedCategories();
                state.posts.forEach(post => {
                    const card = document.createElement("div");
                    card.className = "dtg-card";
                    if (state.selectedMap.has(post.id)) {
                        card.classList.add("selected");
                    }

                    const img = document.createElement("img");
                    img.className = "dtg-thumb";
                    const primaryThumbUrl = post.display_url || post.preview_url || "";
                    const fallbackThumbUrl = post.preview_url || "";
                    img.src = primaryThumbUrl;
                    img.alt = String(post.id || "");
                    img.loading = "lazy";
                    img.onload = () => {
                        resizeMasonryCard(card);
                    };
                    const thumbWrap = document.createElement("div");
                    thumbWrap.className = "dtg-thumb-wrap";
                    img.onerror = () => {
                        if (img.dataset.fallbackTried !== "1" && fallbackThumbUrl && fallbackThumbUrl !== primaryThumbUrl) {
                            img.dataset.fallbackTried = "1";
                            img.src = fallbackThumbUrl;
                            return;
                        }
                        state.posts = state.posts.filter(p => p.id !== post.id);
                        if (state.selectedMap.has(post.id)) {
                            state.selectedMap.delete(post.id);
                            saveSelection();
                        } else {
                            updateSummary();
                        }
                        syncStateWidget(true);
                        card.remove();
                    };

                    const meta = document.createElement("div");
                    meta.className = "dtg-meta";
                    meta.innerHTML = `<span>#${post.id || "?"}</span><span>${post.rating || ""} ${post.score || 0}</span>`;
                    const checkBadge = document.createElement("div");
                    checkBadge.className = "dtg-check";
                    checkBadge.textContent = "Selected";

                    card.dataset.postId = String(post.id || "");
                    thumbWrap.appendChild(img);
                    card.appendChild(thumbWrap);
                    card.appendChild(checkBadge);
                    card.appendChild(meta);
                    card.title = buildPromptLikeReference(post, selectedCategories) || post.prompt || "(empty prompt)";

                    card.onclick = () => {
                        const alreadySelected = state.selectedMap.has(post.id);
                        const prompt = buildPromptLikeReference(post, getSelectedCategories());
                        const payload = {
                            post_id: post.id,
                            image_url: post.image_url || post.preview_url || "",
                            display_url: post.display_url || post.preview_url || post.image_url || "",
                            preview_url: post.preview_url || "",
                            tag_string: post.tag_string || "",
                            tag_string_artist: post.tag_string_artist || "",
                            tag_string_copyright: post.tag_string_copyright || "",
                            tag_string_character: post.tag_string_character || "",
                            tag_string_general: post.tag_string_general || "",
                            tag_string_meta: post.tag_string_meta || "",
                            prompt,
                        };

                        if (alreadySelected) {
                            state.selectedMap.delete(post.id);
                            card.classList.remove("selected");
                        } else {
                            state.selectedMap.set(post.id, payload);
                            card.classList.add("selected");
                        }
                        saveSelection();
                    };

                    state.grid.appendChild(card);
                    requestAnimationFrame(() => resizeMasonryCard(card));
                });

                requestAnimationFrame(() => resizeAllMasonryCards());
                updateSummary();
                if (state.pendingScrollTop > 0) {
                    requestAnimationFrame(() => {
                        state.grid.scrollTop = state.pendingScrollTop;
                    });
                }
            }

            async function loadPosts(page) {
                if (state.loading) return;
                state.loading = true;
                state.page = Math.max(1, Number(page || 1));

                const tags = normalizeSearchForApi(state.searchInput.value || "");
                const rating = state.ratingSelect.value || "all";
                const limit = Math.max(1, Math.min(100, Number(state.limitInput.value || 24)));
                state.limitInput.value = String(limit);

                closeSuggest();
                state.statusEl.textContent = "Loading posts...";
                syncStateWidget(false);
                try {
                    const query = new URLSearchParams({
                        tags,
                        rating,
                        limit: String(limit),
                        page: String(state.page),
                    });
                    const response = await api.fetchApi(`/danbooru_tag_gallery/posts?${query.toString()}`, { cache: "no-store" });
                    if (!response.ok) {
                        let detail = "";
                        try {
                            const payload = await response.json();
                            detail = String(payload?.message || "");
                        } catch {
                            // ignore parse errors
                        }
                        throw new Error(detail || `HTTP ${response.status}`);
                    }
                    const payload = await response.json();
                    const posts = Array.isArray(payload?.posts) ? payload.posts : [];
                    const dedup = new Map();
                    posts
                        .map(normalizePost)
                        .filter(p => p.id && (p.display_url || p.preview_url || p.image_url))
                        .forEach(p => {
                            if (!dedup.has(p.id)) {
                                dedup.set(p.id, p);
                            }
                        });
                    state.posts = Array.from(dedup.values());
                    state.pendingScrollTop = 0;
                    state.statusEl.textContent = `Loaded ${state.posts.length} posts.`;
                    renderPosts();
                    syncStateWidget(true);
                } catch (error) {
                    state.posts = [];
                    state.pendingScrollTop = 0;
                    renderPosts();
                    state.statusEl.textContent = `Load failed: ${error?.message || "unknown error"}`;
                    syncStateWidget(true);
                } finally {
                    state.loading = false;
                }
            }

            async function clearServerCache() {
                try {
                    state.statusEl.textContent = "Clearing gallery cache...";
                    const response = await api.fetchApi("/danbooru_tag_gallery/cache/clear", {
                        method: "POST",
                        cache: "no-store",
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const payload = await response.json();
                    const imageCount = Number(payload?.stats?.image_cache || 0);
                    state.statusEl.textContent = `Cache cleared. Image cache: ${imageCount}`;
                } catch (error) {
                    state.statusEl.textContent = `Cache clear failed: ${error?.message || "unknown error"}`;
                }
            }

            state.renderPosts = renderPosts;
            state.updateSelectedPromptsByCategory = updateSelectedPromptsByCategory;

            const restoredSelection = parseSelectionData(selectionWidget?.value);
            restoredSelection.forEach(item => {
                const key = String(item.post_id ?? "");
                if (!key) return;
                state.selectedMap.set(key, item);
            });

            const uiState = parseJsonObject(stateWidget?.value, {});
            const restoredCategories = Array.isArray(uiState.selected_categories)
                ? uiState.selected_categories.map(x => String(x || "")).filter(Boolean)
                : ["copyright", "character", "general"];
            ["artist", "copyright", "character", "general", "meta"].forEach(key => {
                const cb = categoryCheckboxes.get(key);
                if (cb) cb.checked = restoredCategories.includes(key);
            });
            searchInput.value = String(uiState.search || "");
            const rating = String(uiState.rating || "all");
            ratingSelect.value = ["all", "safe", "questionable", "explicit"].includes(rating) ? rating : "all";
            const limit = Math.max(1, Math.min(100, Number(uiState.limit || 24)));
            limitInput.value = String(limit);
            state.page = Math.max(1, Number(uiState.page || 1));
            state.pendingScrollTop = Math.max(0, Number(uiState.scroll_top || 0));

            const restoredPosts = parseJsonArray(postsWidget?.value, []);
            const restoredDedup = new Map();
            restoredPosts
                .map(normalizePost)
                .filter(p => p.id && (p.display_url || p.preview_url || p.image_url))
                .forEach(p => {
                    if (!restoredDedup.has(p.id)) {
                        restoredDedup.set(p.id, p);
                    }
                });
            state.posts = Array.from(restoredDedup.values());
            if (state.posts.length) {
                state.statusEl.textContent = `Restored ${state.posts.length} posts.`;
            }
            updateSelectedPromptsByCategory();
            saveSelection();

            loadBtn.onclick = () => loadPosts(1);
            prevBtn.onclick = () => loadPosts(Math.max(1, state.page - 1));
            nextBtn.onclick = () => loadPosts(state.page + 1);
            clearCacheBtn.onclick = () => {
                clearServerCache();
            };
            clearBtn.onclick = () => {
                state.selectedMap.clear();
                saveSelection();
                syncStateWidget(false);
                renderPosts();
            };
            searchInput.addEventListener("input", () => {
                syncStateWidget(false);
                if (state.autocompleteTimer) clearTimeout(state.autocompleteTimer);
                state.autocompleteTimer = setTimeout(() => {
                    requestAutocomplete();
                }, 150);
            });
            searchInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    closeSuggest();
                    loadPosts(1);
                }
                if (event.key === "Escape") {
                    closeSuggest();
                }
            });
            searchInput.addEventListener("blur", () => {
                setTimeout(() => closeSuggest(), 120);
            });
            ratingSelect.addEventListener("change", () => syncStateWidget(false));
            limitInput.addEventListener("change", () => {
                const limit = Math.max(1, Math.min(100, Number(limitInput.value || 24)));
                limitInput.value = String(limit);
                syncStateWidget(false);
            });
            categoryCheckboxes.forEach(checkbox => {
                checkbox.addEventListener("change", () => {
                    updateSelectedPromptsByCategory();
                    renderPosts();
                    syncStateWidget(false);
                });
            });
            grid.addEventListener("scroll", () => {
                if (state.scrollTimer) clearTimeout(state.scrollTimer);
                state.scrollTimer = setTimeout(() => syncStateWidget(false), 120);
            });
            root.addEventListener("mouseleave", () => {
                closeSuggest();
            });

            renderPosts();
            requestAnimationFrame(() => syncGridLayout(this.size));
            if (!state.posts.length) {
                syncStateWidget(false);
            }
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, [info]);
            const state = this.__dtgState;
            if (!state) return result;

            const restored = parseSelectionData(state.selectionWidget?.value);
            state.selectedMap.clear();
            restored.forEach(item => {
                const key = String(item.post_id ?? "");
                if (!key) return;
                state.selectedMap.set(key, item);
            });

            const uiState = parseJsonObject(state.stateWidget?.value, {});
            state.searchInput.value = String(uiState.search || "");
            const rating = String(uiState.rating || "all");
            state.ratingSelect.value = ["all", "safe", "questionable", "explicit"].includes(rating) ? rating : "all";
            const limit = Math.max(1, Math.min(100, Number(uiState.limit || 24)));
            state.limitInput.value = String(limit);
            state.page = Math.max(1, Number(uiState.page || 1));
            state.pendingScrollTop = Math.max(0, Number(uiState.scroll_top || 0));
            const restoredCategories = Array.isArray(uiState.selected_categories)
                ? uiState.selected_categories.map(x => String(x || "")).filter(Boolean)
                : ["copyright", "character", "general"];
            ["artist", "copyright", "character", "general", "meta"].forEach(key => {
                const cb = state.categoryCheckboxes.get(key);
                if (cb) cb.checked = restoredCategories.includes(key);
            });

            const restoredPosts = parseJsonArray(state.postsWidget?.value, []);
            const dedup = new Map();
            restoredPosts
                .map(normalizePost)
                .filter(p => p.id && (p.display_url || p.preview_url || p.image_url))
                .forEach(p => {
                    if (!dedup.has(p.id)) {
                        dedup.set(p.id, p);
                    }
                });
            state.posts = Array.from(dedup.values());
            state.updateSelectedPromptsByCategory?.();
            state.renderPosts?.();
            state.syncGridLayout?.(this.size);
            syncSelectionWidget(state.node, state.selectionWidget, state.selectedMap);
            return result;
        };
    },
});
