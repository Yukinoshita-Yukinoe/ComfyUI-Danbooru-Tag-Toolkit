import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.DanbooruPromptMixer";
const NODE_NAME = "DanbooruPromptMixerNode";
const STYLE_ID = "danbooru-prompt-mixer-style";
const TITLE_COLOR = "#264b7a";
const BODY_COLOR = "#1d3148";

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .dtm-root {
            --dtm-root-h: 230px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            max-width: 100%;
            height: var(--dtm-root-h);
            padding: 8px;
            color: #eaf2ff;
            background: linear-gradient(180deg, rgba(10, 20, 34, .82), rgba(14, 24, 40, .92));
            border: 1px solid rgba(91, 126, 170, .45);
            border-radius: 10px;
            overflow: hidden;
        }
        .dtm-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .dtm-title {
            font-size: 13px;
            font-weight: 700;
            color: #f2f7ff;
        }
        .dtm-meta {
            font-size: 11px;
            color: #9eb6d4;
            white-space: nowrap;
        }
        .dtm-actions {
            display: flex;
            gap: 6px;
        }
        .dtm-btn {
            border: 1px solid #4b6991;
            border-radius: 7px;
            background: #19304a;
            color: #eef5ff;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
            line-height: 1;
        }
        .dtm-btn:hover {
            border-color: #7fa7dc;
            background: #24486f;
        }
        .dtm-input {
            width: 100%;
            min-height: 62px;
            max-height: 86px;
            resize: vertical;
            border: 1px solid #4b6790;
            border-radius: 8px;
            background: #0f1d2d;
            color: #edf4ff;
            padding: 8px;
            box-sizing: border-box;
            font: 12px/1.45 monospace;
        }
        .dtm-input:focus {
            outline: none;
            border-color: #7fa7dc;
            box-shadow: 0 0 0 1px rgba(127, 167, 220, .22);
        }
        .dtm-tags {
            flex: 1 1 auto;
            min-height: 78px;
            overflow: auto;
            display: flex;
            flex-wrap: wrap;
            align-content: flex-start;
            gap: 6px;
            padding-right: 2px;
        }
        .dtm-empty {
            font-size: 12px;
            color: #97abc6;
            padding: 2px 0;
        }
        .dtm-chip {
            border: 1px solid #4e6c95;
            border-radius: 999px;
            padding: 3px 8px 3px 9px;
            background: #182b41;
            color: #edf4ff;
            cursor: pointer;
            user-select: none;
            line-height: 1.3;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
        }
        .dtm-chip:hover {
            border-color: #83a9db;
        }
        .dtm-chip.dtm-active {
            border-color: #edb669;
            background: #46331b;
            color: #ffe0ad;
        }
        .dtm-chip.dtm-weighted {
            border-color: #d7a461;
            box-shadow: inset 0 0 0 1px rgba(215, 164, 97, .12);
        }
        .dtm-chip-label {
            min-width: 0;
            word-break: break-word;
        }
        .dtm-chip-badge {
            border-radius: 999px;
            background: #2b4462;
            color: #ffd99e;
            padding: 1px 5px;
            font-size: 10px;
            line-height: 1.2;
            flex: 0 0 auto;
        }
        .dtm-chip-controls {
            width: 14px;
            display: inline-flex;
            flex-direction: column;
            gap: 1px;
            opacity: 0;
            pointer-events: none;
            transform: translateX(2px);
            transition: opacity .12s ease, transform .12s ease;
            flex: 0 0 auto;
        }
        .dtm-chip:hover .dtm-chip-controls,
        .dtm-chip:focus-within .dtm-chip-controls {
            opacity: 1;
            pointer-events: auto;
            transform: translateX(0);
        }
        .dtm-step {
            width: 14px;
            height: 10px;
            padding: 0;
            border: 1px solid #5d7cab;
            border-radius: 4px;
            background: #1d3558;
            color: #eef6ff;
            cursor: pointer;
            font-size: 8px;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .dtm-step:hover {
            border-color: #8ab0e3;
            background: #27456b;
        }
        .dtm-preview {
            min-height: 40px;
            max-height: 72px;
            overflow: auto;
            border-top: 1px solid rgba(88, 118, 157, .45);
            padding-top: 6px;
            color: #d6e6ff;
            font-size: 11px;
            line-height: 1.45;
            word-break: break-word;
        }
    `;
    document.head.appendChild(style);
}

function hideWidget(widget) {
    if (!widget) return;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
}

function compactPromptWidget(widget) {
    if (!widget) return;
    const originalComputeSize = typeof widget.computeSize === "function" ? widget.computeSize.bind(widget) : null;
    widget.computeSize = width => {
        const original = originalComputeSize ? originalComputeSize(width) : [Math.max(220, width || 220), 70];
        return [original[0], 44];
    };
}

function getWidget(node, name) {
    return node.widgets?.find(widget => widget.name === name) || null;
}

function getInputSlot(node, name) {
    return node?.inputs?.find(input => input?.name === name) || null;
}

function getLinkRecord(linkId) {
    const links = app.graph?.links;
    if (!links || linkId == null) return null;
    if (Array.isArray(links)) return links[linkId] || null;
    return links[linkId] || null;
}

function readLinkField(linkRecord, objectKey, arrayIndex) {
    if (!linkRecord) return null;
    if (typeof linkRecord === "object" && !Array.isArray(linkRecord)) {
        return linkRecord[objectKey] ?? null;
    }
    if (Array.isArray(linkRecord)) {
        return linkRecord[arrayIndex] ?? null;
    }
    return null;
}

function tagsSpaceToCommaPrompt(tagString) {
    return String(tagString || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(", ");
}

function looksLikeJsonText(text) {
    const trimmed = String(text || "").trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function extractPromptFromSelectionData(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) return "";
    try {
        const data = JSON.parse(rawValue);
        const prompts = [];
        const collectPrompt = item => {
            if (!item || typeof item !== "object") return;
            const prompt = String(item.prompt || "").trim();
            if (prompt) {
                prompts.push(prompt);
                return;
            }
            const tags = String(item.tags || item.tag_string || "").trim();
            if (tags) {
                prompts.push(tagsSpaceToCommaPrompt(tags));
            }
        };

        if (Array.isArray(data)) {
            data.forEach(collectPrompt);
            return prompts.join(", ");
        }

        if (data && typeof data === "object") {
            if (Array.isArray(data.selections)) {
                data.selections.forEach(collectPrompt);
                return prompts.join(", ");
            }
            collectPrompt(data);
            return prompts.join(", ");
        }
    } catch {
        // ignore json parse errors
    }
    return "";
}

function getLinkedStringValue(node, inputName) {
    const input = getInputSlot(node, inputName);
    if (!input || input.link == null) return null;

    const linkRecord = getLinkRecord(input.link);
    const originId = readLinkField(linkRecord, "origin_id", 1);
    if (originId == null) return null;

    const originNode = app.graph?.getNodeById?.(originId);
    if (!originNode) return null;

    const selectionWidget = originNode.widgets?.find(widget => widget?.name === "selection_data");
    if (typeof selectionWidget?.value === "string") {
        return extractPromptFromSelectionData(selectionWidget.value);
    }

    const preferredNames = ["string", "text", "prompt", "value", "tags"];
    for (const name of preferredNames) {
        const widget = originNode.widgets?.find(w => w?.name === name);
        if (typeof widget?.value === "string" && widget.value.trim()) {
            return widget.value;
        }
    }

    const blockedNames = new Set([
        "selection_data",
        "gallery_state_json",
        "gallery_posts_json",
        "filter_data",
        "selected_tags_json",
        "selected_categories_json",
        "manual_category_tags_json",
        "selected_tag_weights_json",
    ]);

    let longest = "";
    for (const widget of originNode.widgets || []) {
        const name = String(widget?.name || "").toLowerCase();
        if (blockedNames.has(name)) continue;
        if (typeof widget?.value !== "string") continue;
        const value = String(widget.value || "");
        if (!value.trim() || looksLikeJsonText(value)) continue;
        if (value.length > longest.length) {
            longest = value;
        }
    }
    return longest || null;
}

function isPromptLinked(node) {
    return Boolean(getInputSlot(node, "prompt")?.link);
}

async function fetchJsonOrThrow(url, options = undefined) {
    const response = await api.fetchApi(url, options);
    if (!response.ok) {
        let detail = "";
        try {
            const errPayload = await response.json();
            detail = String(errPayload?.message || "");
        } catch {
            // ignore json parse failures
        }
        throw new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`);
    }
    return response.json();
}

function setWidgetValue(widget, value) {
    if (!widget) return;
    widget.value = value;
    if (typeof widget.callback === "function") {
        widget.callback(value);
    }
}

function normalizeBooleanValue(rawValue, fallback = false) {
    if (typeof rawValue === "boolean") return rawValue;
    if (typeof rawValue === "number") return Boolean(rawValue);
    if (typeof rawValue === "string") {
        const value = rawValue.trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(value)) return true;
        if (["0", "false", "no", "off", ""].includes(value)) return false;
    }
    return fallback;
}

function normalizeTag(tag) {
    return String(tag || "")
        .replaceAll("\\(", "(")
        .replaceAll("\\)", ")")
        .trim()
        .toLowerCase();
}

function escapePromptParentheses(text) {
    return String(text || "")
        .replace(/(?<!\\)\(/g, "\\(")
        .replace(/(?<!\\)\)/g, "\\)");
}

function normalizeWeightValue(rawValue, fallback = 1) {
    if (rawValue === "" || rawValue == null) return fallback;
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(20, Math.round(parsed * 100) / 100));
}

function formatWeightValue(rawValue, fallback = "1") {
    const normalized = normalizeWeightValue(rawValue, Number.NaN);
    if (!Number.isFinite(normalized)) return fallback;
    return normalized.toFixed(2).replace(/\.?0+$/, "") || fallback;
}

function parseSelected(rawValue) {
    if (!rawValue) return [];
    let parsed = rawValue;
    if (typeof rawValue === "string") {
        try {
            parsed = JSON.parse(rawValue);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) return [];
    const result = [];
    const seen = new Set();
    parsed.forEach(tag => {
        const text = String(tag || "").trim();
        const key = normalizeTag(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(text);
    });
    return result;
}

function parseSelectedTagWeights(rawValue) {
    if (!rawValue) return {};
    let parsed = rawValue;
    if (typeof rawValue === "string") {
        try {
            parsed = JSON.parse(rawValue);
        } catch {
            return {};
        }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result = {};
    for (const [tag, weight] of Object.entries(parsed)) {
        const text = String(tag || "").trim();
        if (!text) continue;
        result[text] = normalizeWeightValue(weight, 1);
    }
    return result;
}

function splitTopLevelPromptParts(rawValue) {
    const text = String(rawValue || "");
    if (!text) return [];

    const parts = [];
    let current = "";
    let depth = 0;
    let escaped = false;

    for (const char of text) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\") {
            current += char;
            escaped = true;
            continue;
        }
        if (char === "(") {
            depth += 1;
            current += char;
            continue;
        }
        if (char === ")") {
            if (depth > 0) depth -= 1;
            current += char;
            continue;
        }
        if (depth === 0 && [",", "\n", "\r"].includes(char)) {
            const part = current.trim();
            if (part) parts.push(part);
            current = "";
            continue;
        }
        current += char;
    }

    const lastPart = current.trim();
    if (lastPart) parts.push(lastPart);
    return parts;
}

function parseWeightedPromptPart(rawValue) {
    const text = String(rawValue || "").trim();
    if (!text) return null;
    const match = text.match(/^\((.*):\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\)$/s);
    if (!match) return null;

    const innerText = String(match[1] || "").trim();
    const weight = normalizeWeightValue(match[2], 1);
    const tags = splitTopLevelPromptParts(innerText);
    if (!tags.length) return null;
    return { tags, weight };
}

function parsePromptItems(rawPrompt) {
    const items = [];
    const indexMap = new Map();

    splitTopLevelPromptParts(rawPrompt).forEach(part => {
        const weighted = parseWeightedPromptPart(part);
        const rawTags = weighted ? weighted.tags : [part];
        const baseWeight = weighted ? normalizeWeightValue(weighted.weight, 1) : 1;

        rawTags.forEach(rawTag => {
            const tag = escapePromptParentheses(String(rawTag || "").trim());
            const key = normalizeTag(tag);
            if (!key) return;

            if (indexMap.has(key)) {
                const existing = items[indexMap.get(key)];
                if (normalizeWeightValue(existing.baseWeight, 1) === 1 && baseWeight !== 1) {
                    existing.baseWeight = baseWeight;
                }
                return;
            }

            indexMap.set(key, items.length);
            items.push({ tag, key, baseWeight });
        });
    });

    return items;
}

function buildPromptOutput(state) {
    const parts = [];
    const selectedSet = new Set((state.selected || []).map(normalizeTag));
    const weightLookup = getResolvedSelectedTagWeights(state);

    (state.parsedItems || []).forEach(item => {
        if (!selectedSet.has(item.key)) return;
        const effectiveWeight = normalizeWeightValue(weightLookup[item.tag], item.baseWeight);
        if (effectiveWeight !== 1) {
            parts.push(`(${item.tag}:${formatWeightValue(effectiveWeight)})`);
        } else {
            parts.push(item.tag);
        }
    });

    return parts.join(", ");
}

function getResolvedSelectedTagWeights(state) {
    const lookup = {};
    for (const item of state.parsedItems || []) {
        lookup[item.key] = item;
    }

    const resolved = {};
    for (const [tag, rawWeight] of Object.entries(state.selectedTagWeights || {})) {
        const key = normalizeTag(tag);
        const item = lookup[key];
        if (!item) continue;
        const weight = normalizeWeightValue(rawWeight, item.baseWeight);
        if (weight !== item.baseWeight) {
            resolved[item.tag] = weight;
        }
    }
    return resolved;
}

function syncStateWidgets(node, markDirty = true) {
    const state = node.__dtmState;
    if (!state) return;

    const lookup = new Map((state.parsedItems || []).map(item => [item.key, item]));
    const orderedSelected = [];
    const seen = new Set();
    for (const item of state.parsedItems || []) {
        if (!state.selectedSet.has(item.key) || seen.has(item.key)) continue;
        seen.add(item.key);
        orderedSelected.push(item.tag);
    }

    const resolvedWeights = getResolvedSelectedTagWeights(state);
    const orderedWeights = {};
    for (const item of state.parsedItems || []) {
        const weight = normalizeWeightValue(resolvedWeights[item.tag], item.baseWeight);
        if (weight !== item.baseWeight) {
            orderedWeights[item.tag] = weight;
        }
    }

    state.selected = orderedSelected;
    state.selectedTagWeights = orderedWeights;
    setWidgetValue(state.selectedWidget, JSON.stringify(orderedSelected));
    setWidgetValue(state.selectedTagWeightsWidget, JSON.stringify(orderedWeights));
    setWidgetValue(state.selectionInitializedWidget, Boolean(state.selectionInitialized && (state.parsedItems || []).length > 0));

    if (markDirty) {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function getPromptSourceText(node) {
    const state = node.__dtmState;
    if (!state) return "";
    if (isPromptLinked(node)) {
        return String(state.latestPrompt || "");
    }
    return String(state.promptWidget?.value || "");
}

async function refreshPromptPreview(node) {
    const state = node.__dtmState;
    if (!state) return;

    if (!isPromptLinked(node)) {
        state.latestPrompt = "";
        reconcileStateFromPrompt(node);
        return;
    }

    const linkedText = getLinkedStringValue(node, "prompt");
    if (linkedText !== null) {
        state.latestPrompt = String(linkedText || "");
        reconcileStateFromPrompt(node);
        return;
    }

    await loadLatestLinkedPrompt(node);
}

async function loadLatestLinkedPrompt(node) {
    const state = node.__dtmState;
    if (!state) return;
    if (!isPromptLinked(node)) {
        state.latestPrompt = "";
        reconcileStateFromPrompt(node);
        return;
    }
    try {
        const payload = await fetchJsonOrThrow(`/danbooru_prompt_mixer/latest?node_id=${encodeURIComponent(String(node.id))}`, { cache: "no-store" });
        state.latestPrompt = String(payload?.prompt || "");
    } catch (error) {
        console.error("[DanbooruPromptMixer] failed to load latest prompt:", error);
        state.latestPrompt = "";
    }
    reconcileStateFromPrompt(node);
}

function reconcileStateFromPrompt(node) {
    const state = node.__dtmState;
    if (!state) return;

    const previousKeys = new Set((state.parsedItems || []).map(item => item.key));
    const previousSelected = new Set((state.selected || []).map(normalizeTag));
    const parsedItems = parsePromptItems(getPromptSourceText(node));
    const itemLookup = new Map(parsedItems.map(item => [item.key, item]));

    state.parsedItems = parsedItems;

    if (!parsedItems.length) {
        state.selectionInitialized = false;
        state.selectedSet = new Set();
        state.selected = [];
        state.selectedTagWeights = {};
        syncStateWidgets(node, false);
        renderAll(node);
        return;
    }

    if (!state.selectionInitialized) {
        state.selectedSet = new Set(parsedItems.map(item => item.key));
        state.selectionInitialized = true;
    } else {
        const nextSelected = new Set();
        parsedItems.forEach(item => {
            if (previousSelected.has(item.key) || !previousKeys.has(item.key)) {
                nextSelected.add(item.key);
            }
        });
        state.selectedSet = nextSelected;
    }

    const nextWeights = {};
    for (const [tag, rawWeight] of Object.entries(state.selectedTagWeights || {})) {
        const key = normalizeTag(tag);
        const item = itemLookup.get(key);
        if (!item) continue;
        const weight = normalizeWeightValue(rawWeight, item.baseWeight);
        if (weight !== item.baseWeight) {
            nextWeights[item.tag] = weight;
        }
    }
    state.selectedTagWeights = nextWeights;

    syncStateWidgets(node, false);
    renderAll(node);
}

function getEmptyMixerMessage(node) {
    return isPromptLinked(node) ? "Click Refresh to load linked tags." : "Connect a prompt and click Refresh.";
}

function renderAll(node) {
    const state = node.__dtmState;
    if (!state) return;

    const parsedItems = state.parsedItems || [];
    state.tagsEl.innerHTML = "";

    const resolvedWeights = getResolvedSelectedTagWeights(state);
    const selectedCount = parsedItems.filter(item => state.selectedSet.has(item.key)).length;
    state.metaEl.textContent = `${selectedCount} / ${parsedItems.length}`;
    state.previewEl.textContent = buildPromptOutput(state) || getEmptyMixerMessage(node);

    if (!parsedItems.length) {
        const empty = document.createElement("div");
        empty.className = "dtm-empty";
        empty.textContent = getEmptyMixerMessage(node);
        state.tagsEl.appendChild(empty);
        return;
    }

    parsedItems.forEach(item => {
        const currentWeight = normalizeWeightValue(resolvedWeights[item.tag], item.baseWeight);
        const chip = document.createElement("span");
        chip.className = "dtm-chip";
        if (state.selectedSet.has(item.key)) chip.classList.add("dtm-active");
        if (currentWeight !== 1) chip.classList.add("dtm-weighted");
        chip.onclick = () => {
            if (state.selectedSet.has(item.key)) state.selectedSet.delete(item.key);
            else state.selectedSet.add(item.key);
            syncStateWidgets(node, false);
            renderAll(node);
        };

        const label = document.createElement("span");
        label.className = "dtm-chip-label";
        label.textContent = item.tag;
        chip.appendChild(label);

        if (currentWeight !== 1) {
            const badge = document.createElement("span");
            badge.className = "dtm-chip-badge";
            badge.textContent = formatWeightValue(currentWeight);
            chip.appendChild(badge);
        }

        const controls = document.createElement("span");
        controls.className = "dtm-chip-controls";

        const plusBtn = document.createElement("button");
        plusBtn.type = "button";
        plusBtn.className = "dtm-step";
        plusBtn.textContent = "+";
        plusBtn.title = "Increase weight";
        plusBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const nextWeight = normalizeWeightValue(currentWeight + 0.05, item.baseWeight);
            if (nextWeight === item.baseWeight) delete state.selectedTagWeights[item.tag];
            else state.selectedTagWeights[item.tag] = nextWeight;
            syncStateWidgets(node, false);
            renderAll(node);
        };

        const minusBtn = document.createElement("button");
        minusBtn.type = "button";
        minusBtn.className = "dtm-step";
        minusBtn.textContent = "-";
        minusBtn.title = "Decrease weight";
        minusBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const nextWeight = normalizeWeightValue(currentWeight - 0.05, item.baseWeight);
            if (nextWeight === item.baseWeight) delete state.selectedTagWeights[item.tag];
            else state.selectedTagWeights[item.tag] = nextWeight;
            syncStateWidgets(node, false);
            renderAll(node);
        };

        [plusBtn, minusBtn].forEach(button => {
            ["mousedown", "click", "pointerdown", "dblclick"].forEach(eventName => {
                button.addEventListener(eventName, event => event.stopPropagation());
            });
        });

        controls.appendChild(plusBtn);
        controls.appendChild(minusBtn);
        chip.appendChild(controls);
        state.tagsEl.appendChild(chip);
    });
}

function syncRootLayout(node) {
    const state = node.__dtmState;
    if (!state?.rootEl) return;

    const width = Math.max(280, Math.floor(node.size?.[0] || 430));
    const height = Math.max(220, Math.floor(node.size?.[1] || 320));
    const innerWidth = Math.max(260, width - 22);
    const innerHeight = Math.max(180, height - 22);
    state.rootEl.style.width = `${innerWidth}px`;
    state.rootEl.style.maxWidth = `${innerWidth}px`;
    state.rootEl.style.setProperty("--dtm-root-h", `${innerHeight}px`);
}

app.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            injectStyle();

            const promptWidget = getWidget(this, "prompt");
            const selectedWidget = getWidget(this, "selected_tags_json");
            const selectedTagWeightsWidget = getWidget(this, "selected_tag_weights_json");
            const selectionInitializedWidget = getWidget(this, "selection_initialized");

            [selectedWidget, selectedTagWeightsWidget, selectionInitializedWidget].forEach(hideWidget);
            hideWidget(promptWidget);

            const root = document.createElement("div");
            root.className = "dtm-root";

            const head = document.createElement("div");
            head.className = "dtm-head";
            const title = document.createElement("div");
            title.className = "dtm-title";
            title.textContent = "Prompt Mixer";
            const meta = document.createElement("div");
            meta.className = "dtm-meta";
            meta.textContent = "0 / 0";
            head.appendChild(title);
            head.appendChild(meta);

            const actions = document.createElement("div");
            actions.className = "dtm-actions";
            const refreshBtn = document.createElement("button");
            refreshBtn.className = "dtm-btn";
            refreshBtn.textContent = "Refresh";
            const allBtn = document.createElement("button");
            allBtn.className = "dtm-btn";
            allBtn.textContent = "All";
            const noneBtn = document.createElement("button");
            noneBtn.className = "dtm-btn";
            noneBtn.textContent = "None";
            actions.appendChild(refreshBtn);
            actions.appendChild(allBtn);
            actions.appendChild(noneBtn);

            const tagsEl = document.createElement("div");
            tagsEl.className = "dtm-tags";
            const previewEl = document.createElement("div");
            previewEl.className = "dtm-preview";
            previewEl.textContent = "Connect a prompt and click Refresh.";

            root.appendChild(head);
            root.appendChild(actions);
            root.appendChild(tagsEl);
            root.appendChild(previewEl);

            const domWidget = this.addDOMWidget("prompt_mixer_ui", "div", root, { serialize: false });
            if (Array.isArray(this.widgets)) {
                const domIndex = this.widgets.indexOf(domWidget);
                if (domIndex >= 0) this.widgets.splice(domIndex, 1);
                let insertAt = 0;
                const promptIndex = this.widgets.indexOf(promptWidget);
                if (promptIndex >= 0) {
                    insertAt = promptIndex + 1;
                }
                this.widgets.splice(insertAt, 0, domWidget);
            }

            this.color = TITLE_COLOR;
            this.bgcolor = BODY_COLOR;
            if ((this.size?.[0] || 0) < 380 || (this.size?.[1] || 0) < 240) {
                this.size = [380, 240];
            }

            this.__dtmState = {
                rootEl: root,
                promptWidget,
                selectedWidget,
                selectedTagWeightsWidget,
                selectionInitializedWidget,
                tagsEl,
                previewEl,
                metaEl: meta,
                parsedItems: [],
                selected: parseSelected(selectedWidget?.value),
                selectedSet: new Set(parseSelected(selectedWidget?.value).map(normalizeTag)),
                selectedTagWeights: parseSelectedTagWeights(selectedTagWeightsWidget?.value),
                selectionInitialized: normalizeBooleanValue(selectionInitializedWidget?.value, false),
                latestPrompt: "",
            };

            refreshBtn.onclick = () => {
                refreshPromptPreview(this);
            };

            allBtn.onclick = () => {
                const state = this.__dtmState;
                state.selectedSet = new Set((state.parsedItems || []).map(item => item.key));
                state.selectionInitialized = (state.parsedItems || []).length > 0;
                syncStateWidgets(this, false);
                renderAll(this);
            };
            noneBtn.onclick = () => {
                const state = this.__dtmState;
                state.selectedSet = new Set();
                state.selectionInitialized = (state.parsedItems || []).length > 0;
                syncStateWidgets(this, false);
                renderAll(this);
            };

            reconcileStateFromPrompt(this);
            if (isPromptLinked(this)) {
                refreshPromptPreview(this);
            }
            syncRootLayout(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, [info]);
            const state = this.__dtmState;
            if (!state) return result;

            state.selected = parseSelected(state.selectedWidget?.value);
            state.selectedSet = new Set(state.selected.map(normalizeTag));
            state.selectedTagWeights = parseSelectedTagWeights(state.selectedTagWeightsWidget?.value);
            state.selectionInitialized = normalizeBooleanValue(state.selectionInitializedWidget?.value, false);
            reconcileStateFromPrompt(this);
            if (isPromptLinked(this)) {
                refreshPromptPreview(this);
            }
            syncRootLayout(this);
            return result;
        };

        const onWidgetChanged = nodeType.prototype.onWidgetChanged;
        nodeType.prototype.onWidgetChanged = function (widget, value, oldValue, event) {
            const result = onWidgetChanged?.apply(this, [widget, value, oldValue, event]);
            const state = this.__dtmState;
            if (!state) return result;

            if (widget?.name === "prompt") {
                if (!isPromptLinked(this)) {
                    reconcileStateFromPrompt(this);
                }
                return result;
            }

            if (widget?.name === "selected_tags_json") {
                state.selected = parseSelected(state.selectedWidget?.value);
                state.selectedSet = new Set(state.selected.map(normalizeTag));
                renderAll(this);
                return result;
            }

            if (widget?.name === "selected_tag_weights_json") {
                state.selectedTagWeights = parseSelectedTagWeights(state.selectedTagWeightsWidget?.value);
                renderAll(this);
                return result;
            }

            if (widget?.name === "selection_initialized") {
                state.selectionInitialized = normalizeBooleanValue(state.selectionInitializedWidget?.value, false);
                reconcileStateFromPrompt(this);
                return result;
            }

            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function () {
            const result = onExecuted?.apply(this, arguments);
            if (this.__dtmState && isPromptLinked(this)) {
                refreshPromptPreview(this);
            }
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            if (this.__dtmState) {
                if (isPromptLinked(this)) {
                    refreshPromptPreview(this);
                } else {
                    this.__dtmState.latestPrompt = "";
                    reconcileStateFromPrompt(this);
                }
            }
            return result;
        };

        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            const result = onResize?.apply(this, [size]);
            if (this.__dtmState) {
                syncRootLayout(this);
            }
            return result;
        };
    },
});
