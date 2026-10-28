// Frontend for the Category Filter node: a draggable list of category chips.
//
// The node owns the category list (its hidden categories_json widget ships the default from Python), so this
// file only draws it, toggles selection, reorders, and writes the result back.

import { app } from "../../scripts/app.js";

const NODE_TYPE = "DanbooruTagCategoryFilterNode";
const WIDGET_NAME = "categories_json";
const UI_WIDGET_NAME = "danbooru_category_filter_ui";
const STYLE_ID = "dcf-style";

const STRINGS = {
    zh: {
        selected: "已选 {selected} / {total}",
        all: "全选",
        none: "全不选",
        invert: "反选",
        keep: "只保留选中的分类",
        exclude: "排除选中的分类",
        drag: "点一下切换，拖动排序",
        broken: "分类列表读不出来，删掉重新添加这个节点即可恢复",
    },
    en: {
        selected: "{selected} / {total} selected",
        all: "All",
        none: "None",
        invert: "Invert",
        keep: "Keeping the selected categories",
        exclude: "Dropping the selected categories",
        drag: "Click to toggle, drag to reorder",
        broken: "The category list is unreadable; delete this node and add it again",
    },
};

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .dcf-root {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 6px;
            height: 100%;
            padding: 6px;
            font-size: 12px;
            color: var(--fg-color, #eaf2ff);
        }
        .dcf-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .dcf-count { margin-right: auto; opacity: .8; }
        .dcf-btn {
            font: inherit;
            color: inherit;
            background: var(--comfy-input-bg, rgba(90, 120, 160, .25));
            border: 1px solid var(--border-color, rgba(120, 160, 205, .45));
            border-radius: 6px;
            padding: 1px 7px;
            cursor: pointer;
        }
        .dcf-btn:hover { background: rgba(120, 160, 205, .35); }
        .dcf-mode {
            border-radius: 6px;
            padding: 1px 7px;
            border: 1px solid transparent;
            white-space: nowrap;
        }
        .dcf-mode.keep { background: rgba(70, 160, 110, .28); border-color: rgba(110, 210, 150, .5); }
        .dcf-mode.exclude { background: rgba(190, 80, 80, .28); border-color: rgba(240, 130, 130, .5); }
        .dcf-chips {
            flex: 1 1 auto;
            display: flex;
            flex-wrap: wrap;
            align-content: flex-start;
            gap: 5px;
            overflow-y: auto;
            padding: 2px;
        }
        .dcf-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            border-radius: 999px;
            padding: 2px 9px;
            border: 1px solid var(--border-color, rgba(120, 160, 205, .45));
            background: rgba(20, 30, 45, .5);
            color: inherit;
            opacity: .55;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        .dcf-chip.selected {
            opacity: 1;
            background: rgba(90, 150, 215, .35);
            border-color: rgba(150, 205, 255, .7);
        }
        .dcf-chip.dragging { opacity: .35; }
        .dcf-chip.drop-target { border-color: #ffd479; }
        .dcf-handle { opacity: .55; cursor: grab; }
        .dcf-empty { opacity: .75; padding: 4px; }
        .dcf-hint { opacity: .6; }
    `;
    document.head.appendChild(style);
}

function getWidget(node, name) {
    return node?.widgets?.find(widget => widget?.name === name) ?? null;
}

// The list is rendered from this widget, so it has to keep travelling with the workflow while staying out
// of the node body.
function hideWidget(widget) {
    if (!widget || widget.__dcfHidden) return;
    widget.__dcfHidden = true;
    widget.type = "converted-widget";
    widget.hidden = true;
    widget.serialize = true;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
    const wrapper = widget.inputEl?.closest?.(".dom-widget") ?? null;
    if (wrapper) wrapper.style.display = "none";
}

function readCategories(node) {
    const widget = getWidget(node, WIDGET_NAME);
    if (!widget) return [];
    try {
        const payload = JSON.parse(String(widget.value ?? ""));
        if (!Array.isArray(payload)) return [];
        return payload.filter(item => item && typeof item === "object" && item.key);
    } catch (error) {
        return [];
    }
}

function writeCategories(node, categories) {
    const widget = getWidget(node, WIDGET_NAME);
    if (!widget) return;
    widget.value = JSON.stringify(categories);
    if (typeof widget.callback === "function") widget.callback(widget.value);
}

function language() {
    return (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function labelFor(category, lang) {
    return String((lang === "zh" ? category.zh : category.en) || category.zh || category.en || category.key);
}

function format(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function buildChip(state, category) {
    const chip = document.createElement("div");
    chip.className = category.selected ? "dcf-chip selected" : "dcf-chip";
    chip.draggable = true;
    chip.title = STRINGS[state.lang].drag;

    const handle = document.createElement("span");
    handle.className = "dcf-handle";
    handle.textContent = "☰";
    const label = document.createElement("span");
    label.textContent = labelFor(category, state.lang);
    chip.append(handle, label);

    chip.addEventListener("pointerdown", event => {
        state.downX = event.clientX;
        state.downY = event.clientY;
    });
    chip.addEventListener("click", event => {
        // A drag also ends with a click; only a click that did not move toggles.
        if (Math.abs(event.clientX - state.downX) > 4 || Math.abs(event.clientY - state.downY) > 4) return;
        category.selected = !category.selected;
        writeCategories(state.node, state.categories);
        draw(state);
    });

    chip.addEventListener("dragstart", event => {
        state.dragKey = category.key;
        chip.classList.add("dragging");
        event.dataTransfer?.setData("text/plain", category.key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    chip.addEventListener("dragover", event => {
        if (!state.dragKey || state.dragKey === category.key) return;
        event.preventDefault();
        chip.classList.add("drop-target");
    });
    chip.addEventListener("dragleave", () => chip.classList.remove("drop-target"));
    chip.addEventListener("drop", event => {
        event.preventDefault();
        chip.classList.remove("drop-target");
        const from = state.categories.findIndex(item => item.key === state.dragKey);
        const to = state.categories.findIndex(item => item.key === category.key);
        if (from < 0 || to < 0 || from === to) return;
        const [moved] = state.categories.splice(from, 1);
        state.categories.splice(to, 0, moved);
        writeCategories(state.node, state.categories);
        draw(state);
    });
    chip.addEventListener("dragend", () => {
        state.dragKey = null;
        chip.classList.remove("dragging");
    });
    return chip;
}

function draw(state) {
    const { node, root } = state;
    root.textContent = "";
    state.lang = state.lang || language();

    const head = document.createElement("div");
    head.className = "dcf-head";

    const selectedCount = state.categories.filter(item => item.selected).length;
    const count = document.createElement("span");
    count.className = "dcf-count";
    count.textContent = format(STRINGS[state.lang].selected, {
        selected: selectedCount,
        total: state.categories.length,
    });
    head.appendChild(count);

    const modeWidget = getWidget(node, "exclude_mode");
    const mode = document.createElement("span");
    const excluding = Boolean(modeWidget?.value);
    mode.className = excluding ? "dcf-mode exclude" : "dcf-mode keep";
    mode.textContent = excluding ? STRINGS[state.lang].exclude : STRINGS[state.lang].keep;
    head.appendChild(mode);

    const setAll = value => {
        state.categories.forEach(item => { item.selected = value; });
        writeCategories(node, state.categories);
        draw(state);
    };
    const buttons = [
        [STRINGS[state.lang].all, () => setAll(true)],
        [STRINGS[state.lang].none, () => setAll(false)],
        [STRINGS[state.lang].invert, () => {
            state.categories.forEach(item => { item.selected = !item.selected; });
            writeCategories(node, state.categories);
            draw(state);
        }],
        [state.lang === "zh" ? "EN" : "中", () => {
            state.lang = state.lang === "zh" ? "en" : "zh";
            draw(state);
        }],
    ];
    for (const [text, handler] of buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dcf-btn";
        button.textContent = text;
        button.addEventListener("click", handler);
        head.appendChild(button);
    }
    root.appendChild(head);

    const chips = document.createElement("div");
    chips.className = "dcf-chips";
    if (!state.categories.length) {
        const empty = document.createElement("div");
        empty.className = "dcf-empty";
        empty.textContent = STRINGS[state.lang].broken;
        chips.appendChild(empty);
    }
    for (const category of state.categories) {
        chips.appendChild(buildChip(state, category));
    }
    root.appendChild(chips);

    const hint = document.createElement("div");
    hint.className = "dcf-hint";
    hint.textContent = STRINGS[state.lang].drag;
    root.appendChild(hint);

    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "DanbooruTagToolkit.CategoryFilter",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = onNodeCreated?.apply(this, args);
            injectStyle();

            const root = document.createElement("div");
            root.className = "dcf-root";
            const state = {
                node: this,
                root,
                categories: readCategories(this),
                lang: language(),
                dragKey: null,
                downX: 0,
                downY: 0,
            };
            this.__dcfState = state;

            const domWidget = this.addDOMWidget(UI_WIDGET_NAME, "div", root, { serialize: false });
            domWidget.computeSize = width => [Math.max(0, Math.floor(width || 0)), 0];
            if (Array.isArray(this.widgets)) {
                this.widgets.splice(this.widgets.indexOf(domWidget), 1);
                this.widgets.unshift(domWidget);
            }
            hideWidget(getWidget(this, WIDGET_NAME));

            const modeWidget = getWidget(this, "exclude_mode");
            if (modeWidget) {
                const previous = modeWidget.callback;
                modeWidget.callback = (...callbackArgs) => {
                    const outcome = previous?.apply(modeWidget, callbackArgs);
                    draw(state);
                    return outcome;
                };
            }

            this.size = this.size?.[1] > 220 ? this.size : [430, 230];
            draw(state);
            return result;
        };

        // A workflow that was saved before the node carried the list would otherwise have nothing to draw.
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = onConfigure?.apply(this, args);
            const state = this.__dcfState;
            if (state) {
                state.categories = readCategories(this);
                if (!state.categories.length) {
                    const widget = getWidget(this, WIDGET_NAME);
                    if (widget?.options?.default) state.categories = JSON.parse(String(widget.options.default));
                }
                draw(state);
            }
            return result;
        };
    },
});
