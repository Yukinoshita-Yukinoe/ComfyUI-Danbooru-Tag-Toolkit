// Node parameter presets in a sidebar tab: save several parameter sets per node (grouped by node type
// plus the node's title), then bring them back with one click, across workflows.
//
// Presets live in the ComfyUI user directory through api.storeUserData, so they survive browser cache
// clearing and are shared by every workflow. localStorage is the fallback when the frontend stores user
// data in the browser instead.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
    PRESET_STORE_FILE,
    captureValues,
    findPreset,
    formatValue,
    listWidgets,
    matchGroups,
    nodeGroupKey,
    nodeSignature,
    normalizeStore,
    planApply,
    removePreset,
    renamePreset,
    uniquePresetName,
    upsertPreset,
    valuesSummary,
} from "./node_presets_logic.js";

const EXT_NAME = "DanbooruTagToolkit.NodePresets";
const STYLE_ID = "dntp-style";
const TAB_ID = "danbooru-node-presets";
const LOCAL_STORAGE_KEY = `${EXT_NAME}.store`;
const REFRESH_INTERVAL = 1500;

let store = null;
const panels = new Set();

function usesServerStorage() {
    return app.storageLocation === "server";
}

async function loadStore() {
    if (usesServerStorage()) {
        try {
            const response = await api.getUserData(PRESET_STORE_FILE);
            if (response.status === 200) return normalizeStore(await response.json());
            if (response.status !== 404) console.error(`[NodePresets] load failed: ${response.status}`);
        } catch (error) {
            console.error("[NodePresets] load failed", error);
        }
        return normalizeStore(null);
    }
    try {
        return normalizeStore(JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? "null"));
    } catch (error) {
        console.error("[NodePresets] local store is unreadable", error);
        return normalizeStore(null);
    }
}

async function persistStore() {
    if (usesServerStorage()) {
        try {
            await api.storeUserData(PRESET_STORE_FILE, store);
        } catch (error) {
            console.error("[NodePresets] save failed", error);
        }
        return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
}

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .dntp-host { height: 100%; }
        .dntp-root {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
            height: 100%;
            padding: 8px;
            color: var(--fg-color, #eaf2ff);
            font-size: 12px;
            overflow: hidden;
        }
        .dntp-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .dntp-head-title { font-weight: 600; margin-right: auto; }
        .dntp-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .dntp-btn {
            font: inherit;
            color: inherit;
            background: var(--comfy-input-bg, rgba(90, 120, 160, .25));
            border: 1px solid var(--border-color, rgba(120, 160, 205, .45));
            border-radius: 6px;
            padding: 2px 7px;
            cursor: pointer;
        }
        .dntp-btn:hover { background: rgba(120, 160, 205, .35); }
        .dntp-btn:disabled { opacity: .45; cursor: default; }
        .dntp-btn.danger { color: #ff9b9b; }
        .dntp-input {
            font: inherit;
            color: inherit;
            background: var(--comfy-input-bg, rgba(0, 0, 0, .25));
            border: 1px solid var(--border-color, rgba(120, 160, 205, .45));
            border-radius: 6px;
            padding: 3px 6px;
            min-width: 0;
            flex: 1 1 90px;
        }
        .dntp-status { min-height: 16px; opacity: .85; }
        .dntp-status.warn { color: #ffcf7a; }
        .dntp-status.ok { color: #9be2b0; }
        .dntp-body { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .dntp-card {
            border: 1px solid var(--border-color, rgba(120, 160, 205, .35));
            border-radius: 8px;
            padding: 6px 8px;
            background: rgba(20, 30, 45, .35);
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .dntp-card.foreign { opacity: .7; }
        .dntp-card-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .dntp-card-title { font-weight: 600; }
        .dntp-preset-name { font-weight: 600; text-align: left; }
        .dntp-tag { opacity: .7; }
        .dntp-preset { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .dntp-preset + .dntp-preset { border-top: 1px dashed rgba(120, 160, 205, .2); padding-top: 5px; }
        .dntp-meta { opacity: .7; flex: 1 1 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dntp-empty { opacity: .7; line-height: 1.6; }
        .dntp-section { opacity: .8; margin-top: 4px; }
        .dntp-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .55);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        .dntp-dialog {
            background: var(--comfy-menu-bg, #20242c);
            color: var(--fg-color, #eaf2ff);
            border: 1px solid var(--border-color, rgba(120, 160, 205, .45));
            border-radius: 10px;
            padding: 12px;
            width: min(460px, 92vw);
            max-height: 82vh;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 12px;
        }
        .dntp-dialog h3 { margin: 0; font-size: 13px; }
        .dntp-widgets { overflow-y: auto; max-height: 44vh; display: flex; flex-direction: column; gap: 3px; }
        .dntp-widget { display: flex; align-items: center; gap: 6px; }
        .dntp-widget-name { flex: 0 0 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dntp-widget-value { opacity: .7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dntp-widget.disabled { opacity: .5; }
    `;
    document.head.appendChild(style);
}

function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function makeButton(label, className, onClick, title) {
    const button = make("button", className ? `dntp-btn ${className}` : "dntp-btn", label);
    button.type = "button";
    if (title) button.title = title;
    button.addEventListener("click", onClick);
    return button;
}

function canvasNodes() {
    return app.graph?._nodes ?? [];
}

function nodeLabel(node) {
    return node?.title || node?.type || "未命名节点";
}

function setStatus(state, text, tone = "") {
    state.status.textContent = text;
    state.status.className = tone ? `dntp-status ${tone}` : "dntp-status";
    clearTimeout(state.statusTimer);
    if (text) {
        state.statusTimer = setTimeout(() => {
            if (state.status.textContent === text) setStatus(state, "");
        }, 6000);
    }
}

function applyPreset(state, group, nodes, preset) {
    const applied = new Set();
    const skipped = [];
    const linked = [];
    for (const node of nodes) {
        const plan = planApply(node, preset.values);
        for (const entry of plan.apply) {
            const widget = (node.widgets ?? []).find(item => item?.name === entry.name);
            if (widget) widget.value = entry.value;
            applied.add(entry.name);
            if (entry.linked) linked.push(entry.name);
        }
        for (const entry of plan.skipped) skipped.push(entry);
        node.setDirtyCanvas?.(true, true);
    }
    app.graph?.change?.();

    const parts = [`已套用「${preset.name}」到 ${nodes.length} 个节点：${applied.size} 项生效`];
    if (linked.length) parts.push(`${[...new Set(linked)].join("、")} 被连线占用，实际取值来自上游`);
    if (skipped.length) {
        const detail = [...new Set(skipped.map(entry => `${entry.name}（${entry.reason}）`))].join("；");
        parts.push(`跳过 ${skipped.length} 项：${detail}`);
    }
    setStatus(state, parts.join(" · "), skipped.length || linked.length ? "warn" : "ok");
    scheduleRender(state);
}

function overwritePreset(state, groupKey, nodes, preset) {
    const node = nodes[0];
    const values = captureValues(node, Object.keys(preset.values));
    preset.values = values;
    preset.updatedAt = Date.now();
    void persistStore();
    setStatus(state, `已用「${nodeLabel(node)}」的当前值更新「${preset.name}」`, "ok");
    scheduleRender(state);
}

function openRecordDialog(state, groupKey, group, nodes) {
    const node = nodes[0];
    const widgets = listWidgets(node);
    if (!widgets.length) {
        setStatus(state, `「${nodeLabel(node)}」没有可记录的参数`, "warn");
        return;
    }

    const overlay = make("div", "dntp-overlay");
    const dialog = make("div", "dntp-dialog");
    const title = make("h3", null, `记录「${nodeLabel(node)}」的当前参数`);
    const subtitle = make("div", "dntp-meta", `节点 #${node.id} · ${node.type}${nodes.length > 1 ? ` · 同名节点 ${nodes.length} 个，记录第一个` : ""}`);

    const nameRow = make("div", "dntp-row");
    nameRow.appendChild(make("span", null, "预设名"));
    const nameInput = make("input", "dntp-input");
    nameInput.value = uniquePresetName(group, "新预设");
    nameRow.appendChild(nameInput);

    const list = make("div", "dntp-widgets");
    const checkboxes = [];
    for (const widget of widgets) {
        const row = make("div", widget.selectable ? "dntp-widget" : "dntp-widget disabled");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = widget.selectable;
        box.disabled = !widget.selectable;
        const name = make("span", "dntp-widget-name", `${widget.name} (${widget.type})`);
        const value = make("span", "dntp-widget-value", widget.selectable ? formatValue(widget.value) : widget.reason);
        row.append(box, name, value);
        list.appendChild(row);
        checkboxes.push({ box, widget });
    }

    const actions = make("div", "dntp-row");
    const actionsRight = make("div", "dntp-row");
    actionsRight.style.marginLeft = "auto";

    const close = () => overlay.remove();
    const save = () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            return;
        }
        const included = checkboxes.filter(entry => entry.box.checked).map(entry => entry.widget.name);
        if (!included.length) {
            setStatus(state, "至少要勾选一个参数", "warn");
            return;
        }
        const preset = { name, values: captureValues(node, included), updatedAt: Date.now() };
        upsertPreset(store, groupKey, { nodeType: node.type, title: node.title }, preset);
        void persistStore();
        setStatus(state, `已保存「${name}」（${included.length} 项）`, "ok");
        close();
        scheduleRender(state);
    };

    actionsRight.append(
        makeButton("保存", null, save),
        makeButton("取消", null, close),
    );
    actions.append(actionsRight);
    dialog.append(title, subtitle, nameRow, list, actions);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
    nameInput.focus();
    nameInput.select();
}

function buildPresetRow(state, groupKey, group, nodes, preset, foreign) {
    const row = make("div", "dntp-preset");

    const applyButton = makeButton(preset.name, "dntp-preset-name", () => {
        if (foreign) return;
        applyPreset(state, group, nodes, preset);
    }, foreign ? "当前工作流里没有这个节点" : "点击套用这套参数");
    if (foreign) applyButton.disabled = true;
    row.appendChild(applyButton);

    row.appendChild(make("span", "dntp-meta", `${Object.keys(preset.values).length} 项 · ${valuesSummary(preset.values)}`));

    const actions = make("span", "dntp-row");
    if (!foreign) {
        actions.appendChild(makeButton("更新", null, () => overwritePreset(state, groupKey, nodes, preset), "用节点当前的值覆盖这套预设"));
    }
    actions.appendChild(makeButton("改名", null, () => {
        const next = window.prompt("新的预设名", preset.name);
        if (next === null) return;
        const outcome = renamePreset(store, groupKey, preset.name, next);
        if (!outcome.ok) {
            setStatus(state, `改名失败：${outcome.reason}`, "warn");
            return;
        }
        void persistStore();
        setStatus(state, `已改名为「${next.trim()}」`, "ok");
        scheduleRender(state);
    }));
    actions.appendChild(makeButton("删除", "danger", () => {
        if (!window.confirm(`删除预设「${preset.name}」？`)) return;
        removePreset(store, groupKey, preset.name);
        void persistStore();
        setStatus(state, `已删除「${preset.name}」`, "ok");
        scheduleRender(state);
    }));
    row.appendChild(actions);
    return row;
}

function buildCard(state, entry, foreign) {
    const card = make("div", foreign ? "dntp-card foreign" : "dntp-card");
    const head = make("div", "dntp-card-head");
    head.appendChild(make("span", "dntp-card-title", entry.group.title || "(未命名)"));

    const types = [...new Set(entry.nodes.map(node => node.type))];
    const suffix = foreign
        ? "当前工作流没有这个节点"
        : `${types.join(", ")}${entry.nodes.length > 1 ? ` ×${entry.nodes.length}` : ""}`;
    head.appendChild(make("span", "dntp-tag", suffix));

    if (!foreign) {
        const actions = make("span", "dntp-row");
        actions.style.marginLeft = "auto";
        actions.appendChild(makeButton("＋ 记录当前", null, () => openRecordDialog(state, entry.key, entry.group, entry.nodes)));
        actions.appendChild(makeButton("定位", null, () => {
            const node = entry.nodes[0];
            app.canvas?.centerOnNode?.(node);
            app.canvas?.selectNode?.(node, false);
        }));
        head.appendChild(actions);
    }
    card.appendChild(head);

    for (const preset of entry.group.presets) {
        card.appendChild(buildPresetRow(state, entry.key, entry.group, entry.nodes, preset, foreign));
    }
    return card;
}

function exportStore(state) {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = make("a");
    link.href = url;
    link.download = "node_presets.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(state, `已导出 ${Object.keys(store.groups).length} 组预设`, "ok");
}

function importStore(state, file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const incoming = normalizeStore(JSON.parse(String(reader.result)));
            let added = 0;
            for (const [key, group] of Object.entries(incoming.groups)) {
                for (const preset of group.presets) {
                    upsertPreset(store, key, group, preset);
                    added += 1;
                }
            }
            void persistStore();
            setStatus(state, `已导入 ${added} 套预设`, "ok");
            scheduleRender(state);
        } catch (error) {
            setStatus(state, `导入失败：${error.message}`, "warn");
        }
    };
    reader.readAsText(file);
}

// The header, the search box and the status line are built once: re-rendering them would drop the
// message the user is reading and steal focus from the search field mid-typing.
function buildChrome(state) {
    const head = make("div", "dntp-head");
    head.appendChild(make("span", "dntp-head-title", "节点参数预设"));
    head.appendChild(makeButton("刷新", null, () => render(state)));
    head.appendChild(makeButton("导出", null, () => exportStore(state)));

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.style.display = "none";
    importInput.addEventListener("change", () => {
        if (importInput.files?.[0]) importStore(state, importInput.files[0]);
        importInput.value = "";
    });
    head.appendChild(makeButton("导入", null, () => importInput.click()));
    head.appendChild(importInput);

    const filters = make("div", "dntp-row");
    const search = make("input", "dntp-input");
    search.placeholder = "搜索节点 / 预设名";
    search.value = state.filter;
    search.addEventListener("input", () => {
        state.filter = search.value;
        render(state);
    });
    filters.appendChild(search);

    const onlyLabel = make("label", "dntp-row");
    const onlyBox = document.createElement("input");
    onlyBox.type = "checkbox";
    onlyBox.checked = state.currentOnly;
    onlyBox.addEventListener("change", () => {
        state.currentOnly = onlyBox.checked;
        render(state);
    });
    onlyLabel.append(onlyBox, make("span", null, "只显示当前工作流"));
    filters.appendChild(onlyLabel);

    state.body = make("div", "dntp-body");
    state.root.append(head, filters, state.status, state.body);
}

function render(state) {
    const nodes = canvasNodes();
    state.signature = nodeSignature(nodes);
    const body = state.body;
    body.textContent = "";

    const { matched, others } = matchGroups(store, nodes);
    const needle = state.filter.trim().toLowerCase();
    const visible = matched.filter(entry => !needle
        || (entry.group.title ?? "").toLowerCase().includes(needle)
        || entry.nodes.some(node => String(node.type).toLowerCase().includes(needle))
        || entry.group.presets.some(preset => preset.name.toLowerCase().includes(needle)));

    if (!visible.length) {
        const empty = make("div", "dntp-empty");
        empty.textContent = Object.keys(store.groups).length
            ? "当前工作流里的节点还没有保存过预设。选中一个节点，用它的「＋ 记录当前」保存第一套。"
            : "还没有任何预设。选中节点后点「＋ 记录当前」保存第一套参数。";
        body.appendChild(empty);
    }
    for (const entry of visible) body.appendChild(buildCard(state, entry, false));

    if (!state.currentOnly) {
        const foreign = others.filter(entry => !needle || (entry.group.title ?? "").toLowerCase().includes(needle));
        if (foreign.length) {
            body.appendChild(make("div", "dntp-section", "其它工作流的预设（当前画布没有对应节点）"));
            for (const entry of foreign) body.appendChild(buildCard(state, { ...entry, nodes: [] }, true));
        }
    }

    const footer = make("div", "dntp-empty");
    footer.textContent = usesServerStorage()
        ? `存于 ComfyUI 用户目录 · ${PRESET_STORE_FILE}（跟工作流无关，跨工作流可用）`
        : "存于浏览器（本机 · 换浏览器会丢）";
    body.appendChild(footer);
}

function scheduleRender(state, immediate = false) {
    if (state.pending && !immediate) return;
    state.pending = true;
    const run = () => {
        state.pending = false;
        render(state);
    };
    if (immediate) run();
    else requestAnimationFrame(run);
}

function renderSidebarTab(element) {
    injectStyle();
    element.classList.add("dntp-host");
    if (element.__dntpState) return;

    const root = make("div", "dntp-root");
    element.textContent = "";
    element.appendChild(root);

    const state = {
        element,
        root,
        status: make("div", "dntp-status"),
        body: null,
        filter: "",
        currentOnly: true,
        signature: "",
        pending: false,
        statusTimer: null,
    };
    element.__dntpState = state;
    panels.add(state);
    buildChrome(state);
    render(state);

    const load = async () => {
        store = await loadStore();
        for (const panel of panels) render(panel);
    };
    load();
}

app.registerExtension({
    name: EXT_NAME,
    async setup() {
        store = await loadStore();

        if (!app.extensionManager?.registerSidebarTab) {
            console.error("[NodePresets] this frontend has no sidebar tab API; presets are saved but unreachable");
            return;
        }

        app.extensionManager.registerSidebarTab({
            id: TAB_ID,
            icon: "pi pi-bookmark",
            title: "参数预设",
            tooltip: "节点参数预设",
            type: "custom",
            render: renderSidebarTab,
        });

        // The canvas changes without telling the sidebar, so poll cheaply while it is on screen.
        setInterval(() => {
            for (const panel of panels) {
                if (!panel.element.isConnected) continue;
                if (panel.signature !== nodeSignature(canvasNodes())) scheduleRender(panel);
            }
        }, REFRESH_INTERVAL);
    },
});
