// Pure helpers behind the Node Presets sidebar. No ComfyUI imports live here so the rules
// (grouping, what gets captured, what applying skips) can be unit tested outside the browser.

export const PRESET_STORE_FILE = "node_presets.json";
export const STORE_VERSION = 1;
// Values longer than this are almost always an embedded JSON blob rather than a parameter.
export const MAX_VALUE_LENGTH = 4000;

export function presetKey(nodeType, title) {
    return `${nodeType || ""}::${title || ""}`;
}

export function nodeGroupKey(node) {
    return presetKey(node?.type, node?.title);
}

export function isLinkOccupied(node, widgetName) {
    const input = (node?.inputs ?? []).find(entry => entry?.widget?.name === widgetName);
    return Boolean(input && input.link != null);
}

function comboChoices(widget, node) {
    const values = widget?.options?.values;
    if (typeof values === "function") {
        try {
            const list = values(widget, node);
            return Array.isArray(list) ? list : null;
        } catch (error) {
            return null;
        }
    }
    return Array.isArray(values) ? values : null;
}

function choiceValue(choice) {
    if (choice && typeof choice === "object") return choice.value ?? choice.text ?? choice.name;
    return choice;
}

// Widgets offered in the "record current" dialog: hidden widgets and oversized values are left out.
export function listWidgets(node, { maxLength = MAX_VALUE_LENGTH } = {}) {
    const entries = [];
    for (const widget of node?.widgets ?? []) {
        if (!widget || typeof widget.name !== "string" || !widget.name) continue;
        if (widget.serialize === false) continue;
        const value = widget.value;
        const text = typeof value === "string" ? value : "";
        const tooLong = text.length > maxLength;
        entries.push({
            name: widget.name,
            type: widget.type ?? typeof value,
            value,
            selectable: !tooLong,
            reason: tooLong ? `值过长（${text.length} 字符），可能是内嵌数据` : "",
        });
    }
    return entries;
}

export function captureValues(node, includedNames) {
    const wanted = new Set(includedNames ?? []);
    const values = {};
    for (const widget of node?.widgets ?? []) {
        if (!widget?.name || !wanted.has(widget.name)) continue;
        values[widget.name] = widget.value;
    }
    return values;
}

// Decides what can actually be written back, so the user is told why something did not take.
export function planApply(node, values) {
    const result = { apply: [], skipped: [] };
    for (const [name, value] of Object.entries(values ?? {})) {
        const widget = (node?.widgets ?? []).find(entry => entry?.name === name);
        if (!widget) {
            result.skipped.push({ name, reason: "该节点已没有这个参数" });
            continue;
        }
        if (widget.serialize === false) {
            result.skipped.push({ name, reason: "参数已隐藏" });
            continue;
        }

        let next = value;
        if (typeof next === "number") {
            const { min, max } = widget.options ?? {};
            if (typeof min === "number") next = Math.max(next, min);
            if (typeof max === "number") next = Math.min(next, max);
        }

        const choices = comboChoices(widget, node);
        if (Array.isArray(choices) && choices.length) {
            const allowed = choices.map(choiceValue);
            if (!allowed.includes(next)) {
                result.skipped.push({ name, reason: `值不在当前下拉选项中（${String(next)}）` });
                continue;
            }
        }

        result.apply.push({ name, value: next, linked: isLinkOccupied(node, name) });
    }
    return result;
}

export function valuesSummary(values, limit = 3) {
    const entries = Object.entries(values ?? {});
    if (!entries.length) return "无参数";
    const shown = entries.slice(0, limit).map(([name, value]) => `${name}=${formatValue(value)}`);
    const rest = entries.length - shown.length;
    return rest > 0 ? `${shown.join(" · ")} +${rest}` : shown.join(" · ");
}

export function formatValue(value, maxLength = 24) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text === undefined) return String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function normalizeStore(raw) {
    const store = { version: STORE_VERSION, groups: {} };
    if (!raw || typeof raw !== "object" || typeof raw.groups !== "object" || raw.groups === null) {
        return store;
    }

    for (const [key, group] of Object.entries(raw.groups)) {
        if (!group || typeof group !== "object" || !Array.isArray(group.presets)) continue;
        const presets = group.presets
            .filter(preset => preset && typeof preset === "object"
                && typeof preset.name === "string"
                && preset.values && typeof preset.values === "object")
            .map(preset => ({
                name: preset.name,
                values: { ...preset.values },
                updatedAt: Number(preset.updatedAt) || 0,
            }));
        if (!presets.length) continue;
        store.groups[key] = {
            nodeType: String(group.nodeType ?? ""),
            title: String(group.title ?? ""),
            presets,
        };
    }
    return store;
}

export function findPreset(store, key, name) {
    return (store?.groups?.[key]?.presets ?? []).find(preset => preset.name === name) ?? null;
}

export function upsertPreset(store, key, { nodeType, title }, preset) {
    if (!store.groups[key]) {
        store.groups[key] = { nodeType: nodeType ?? "", title: title ?? "", presets: [] };
    }
    const group = store.groups[key];
    group.nodeType = nodeType ?? group.nodeType;
    group.title = title ?? group.title;
    const existing = group.presets.find(entry => entry.name === preset.name);
    if (existing) Object.assign(existing, preset);
    else group.presets.push({ ...preset });
    return store;
}

export function removePreset(store, key, name) {
    const group = store.groups?.[key];
    if (!group) return store;
    group.presets = group.presets.filter(preset => preset.name !== name);
    if (!group.presets.length) delete store.groups[key];
    return store;
}

export function renamePreset(store, key, from, to) {
    const group = store.groups?.[key];
    if (!group) return { ok: false, reason: "预设不存在" };
    const target = group.presets.find(preset => preset.name === from);
    if (!target) return { ok: false, reason: "预设不存在" };
    const name = String(to ?? "").trim();
    if (!name) return { ok: false, reason: "名字不能为空" };
    if (name === from) return { ok: true };
    if (group.presets.some(preset => preset.name === name)) return { ok: false, reason: "已有同名预设" };
    target.name = name;
    return { ok: true };
}

export function uniquePresetName(group, base = "新预设") {
    const taken = new Set((group?.presets ?? []).map(preset => preset.name));
    if (!taken.has(base)) return base;
    for (let index = 2; index < 1000; index += 1) {
        const candidate = `${base} ${index}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${base} ${Date.now()}`;
}

// Splits stored groups into the ones the current workflow can use and everything else.
export function matchGroups(store, nodes) {
    const matched = new Map();
    for (const node of nodes ?? []) {
        const key = nodeGroupKey(node);
        if (!store?.groups?.[key]) continue;
        if (!matched.has(key)) matched.set(key, { key, group: store.groups[key], nodes: [] });
        matched.get(key).nodes.push(node);
    }
    const others = Object.entries(store?.groups ?? {})
        .filter(([key]) => !matched.has(key))
        .map(([key, group]) => ({ key, group }));
    return { matched: [...matched.values()], others };
}

// The canvas keeps the current selection as an id -> node map; the sidebar always lists those nodes so
// a node without presets still has somewhere to save its first one.
export function selectedNodes(canvas) {
    const selection = canvas?.selected_nodes;
    if (!selection || typeof selection !== "object") return [];
    return Object.values(selection).filter(node => node && typeof node === "object");
}

export function selectionSignature(nodes) {
    return (nodes ?? []).map(node => node?.id).filter(id => id !== undefined).sort().join(",");
}

export function groupFor(store, node) {
    const key = nodeGroupKey(node);
    return store?.groups?.[key] ?? { nodeType: node?.type ?? "", title: node?.title ?? "", presets: [] };
}

export function nodeSignature(nodes) {
    return (nodes ?? []).map(node => `${node.id}:${node.type}:${node.title}`).join("|");
}
