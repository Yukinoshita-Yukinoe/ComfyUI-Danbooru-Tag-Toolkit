// Drives the Category Filter node's frontend in a minimal DOM:
//   node tests/test_category_filter_ui.mjs
//
// The real js/danbooru_category_filter.js is loaded against a fake ComfyUI app, then the chips are clicked
// and dragged to check that the hidden categories_json widget really carries the state.

import { mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(os.tmpdir(), "dcf_check");
const failures = [];
const checks = [];

function check(label, fn) {
    checks.push(label);
    try {
        fn();
    } catch (error) {
        failures.push(`${label} :: ${error.message}`);
    }
}

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(path.join(ROOT, "custom_nodes", "scripts"), { recursive: true });
mkdirSync(path.join(ROOT, "custom_nodes", "pkg", "js"), { recursive: true });
writeFileSync(path.join(ROOT, "package.json"), JSON.stringify({ type: "module" }));
copyFileSync(
    path.join(PACKAGE_DIR, "js", "danbooru_category_filter.js"),
    path.join(ROOT, "custom_nodes", "pkg", "js", "danbooru_category_filter.js"),
);

class ClassList {
    constructor() { this.names = new Set(); }
    add(...names) { names.forEach(name => this.names.add(name)); }
    remove(...names) { names.forEach(name => this.names.delete(name)); }
    contains(name) { return this.names.has(name); }
}

class El {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.classList = new ClassList();
        this.listeners = {};
        this._text = "";
        this.draggable = false;
        this.id = "";
    }
    set className(value) { this.classList = new ClassList(); String(value).split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name)); }
    get className() { return [...this.classList.names].join(" "); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    append(...nodes) { nodes.forEach(node => this.children.push(node)); }
    appendChild(node) { this.children.push(node); return node; }
    addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
    dispatch(type, event = {}) {
        (this.listeners[type] ?? []).forEach(handler => handler({ target: this, preventDefault() {}, ...event }));
    }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    findAllByClass(name) { return this.descendants().filter(element => element.classList.contains(name)); }
    findButton(label) { return this.descendants().find(element => element.tagName === "button" && element.textContent === label) ?? null; }
}

const documentStub = {
    head: new El("head"),
    body: new El("body"),
    createElement: tag => new El(tag),
    getElementById: id => documentStub.head.children.find(element => element.id === id) ?? null,
};
globalThis.document = documentStub;
// Node exposes navigator as a getter-only global, so shadow it on globalThis via defineProperty.
Object.defineProperty(globalThis, "navigator", { value: { language: "zh-CN" }, configurable: true });

const registered = [];
globalThis.__appStub = { registerExtension: extension => registered.push(extension) };
writeFileSync(path.join(ROOT, "custom_nodes", "scripts", "app.js"), "export const app = globalThis.__appStub;\n");

await import(pathToFileURL(path.join(ROOT, "custom_nodes", "pkg", "js", "danbooru_category_filter.js")).href);

const extension = registered[0];
assert.ok(extension, "the extension registers itself");

// A node type as ComfyUI hands it over, plus one instance.
const nodeType = { prototype: {} };
await extension.beforeRegisterNodeDef(nodeType, { name: "DanbooruTagCategoryFilterNode" });
const prototype = nodeType.prototype;

const DEFAULT_LIST = [
    { key: "artist_terms", zh: "画师词", en: "Artist", selected: true },
    { key: "background_terms", zh: "背景词", en: "Background", selected: true },
    { key: "outfit_terms", zh: "服饰词", en: "Outfit", selected: true },
];

function makeNode() {
    const domWidgets = [];
    return {
        widgets: [
            { name: "prompt", type: "string", value: "" },
            { name: "exclude_mode", type: "toggle", value: false, callback: null },
            { name: "categories_json", type: "string", value: JSON.stringify(DEFAULT_LIST), options: { default: JSON.stringify(DEFAULT_LIST) } },
        ],
        domWidgets,
        size: [200, 100],
        addDOMWidget(name, type, element) {
            const widget = { name, type, element, computeSize: null };
            domWidgets.push(widget);
            this.widgets.push(widget);
            return widget;
        },
        setDirtyCanvas() {},
        categoriesWidget() { return this.widgets.find(widget => widget.name === "categories_json"); },
        excludeWidget() { return this.widgets.find(widget => widget.name === "exclude_mode"); },
        stored() { return JSON.parse(this.categoriesWidget().value); },
    };
}

const node = makeNode();
prototype.onNodeCreated.call(node);

const root = () => node.domWidgets[0].element;
const chips = () => root().findAllByClass("dcf-chip");

check("the chips are drawn from the widget the node ships", () => {
    assert.equal(chips().length, 3);
    assert.deepEqual(chips().map(chip => chip.textContent), ["☰画师词", "☰背景词", "☰服饰词"]);
    assert.equal(node.categoriesWidget().hidden, true, "the raw JSON widget is hidden");
    assert.equal(node.size[0] >= 400, true, "the node gets a usable default size");
});

check("a selected chip is marked and the count is shown", () => {
    assert.equal(chips().every(chip => chip.classList.contains("selected")), true);
    assert.ok(root().textContent.includes("已选 3 / 3"));
});

check("clicking a chip toggles it and writes the widget", () => {
    const chip = chips()[1];
    chip.dispatch("pointerdown", { clientX: 10, clientY: 10 });
    chip.dispatch("click", { clientX: 10, clientY: 10 });

    assert.equal(node.stored()[1].selected, false, "the widget carries the new state");
    assert.equal(chips()[1].classList.contains("selected"), false, "and the chip was redrawn");
    assert.ok(root().textContent.includes("已选 2 / 3"));
});

check("a click that moved is treated as a drag, not a toggle", () => {
    const before = node.stored().map(item => item.selected);
    const chip = chips()[0];
    chip.dispatch("pointerdown", { clientX: 10, clientY: 10 });
    chip.dispatch("click", { clientX: 60, clientY: 40 });

    assert.deepEqual(node.stored().map(item => item.selected), before);
});

check("dragging a chip onto another reorders the stored list", () => {
    const [first, third] = [chips()[0], chips()[2]];
    first.dispatch("dragstart", { dataTransfer: { setData() {}, effectAllowed: "" } });
    third.dispatch("dragover", {});
    third.dispatch("drop", {});
    first.dispatch("dragend", {});

    assert.deepEqual(node.stored().map(item => item.key), ["background_terms", "outfit_terms", "artist_terms"]);
    assert.deepEqual(chips().map(chip => chip.textContent), ["☰背景词", "☰服饰词", "☰画师词"], "the chips follow the new order");
});

check("the select-all buttons update every chip", () => {
    root().findButton("全不选").dispatch("click");
    assert.deepEqual(node.stored().map(item => item.selected), [false, false, false]);
    assert.equal(chips().every(chip => !chip.classList.contains("selected")), true);

    root().findButton("反选").dispatch("click");
    assert.deepEqual(node.stored().map(item => item.selected), [true, true, true]);

    root().findButton("全选").dispatch("click");
    assert.deepEqual(node.stored().map(item => item.selected), [true, true, true]);
});

check("the mode line follows the exclude_mode widget", () => {
    assert.ok(root().textContent.includes("只保留选中的分类"));

    const modeWidget = node.excludeWidget();
    modeWidget.value = true;
    modeWidget.callback(true);

    assert.ok(root().textContent.includes("排除选中的分类"));
});

check("the language button switches the chip labels", () => {
    root().findButton("EN").dispatch("click");
    // Order is whatever the drag check left behind, so compare as a set.
    assert.deepEqual(
        chips().map(chip => chip.textContent).sort(),
        ["☰Artist", "☰Background", "☰Outfit"].sort(),
    );
    assert.ok(root().textContent.includes("3 / 3 selected"));
});

check("a workflow with no stored list falls back to the widget default", () => {
    const restored = makeNode();
    restored.categoriesWidget().value = "";
    prototype.onNodeCreated.call(restored);
    prototype.onConfigure.call(restored);

    assert.equal(restored.domWidgets[0].element.findAllByClass("dcf-chip").length, 3);
});

if (failures.length) {
    console.log("FAILED:");
    failures.forEach(failure => console.log("  - " + failure));
    process.exit(1);
}
console.log(`category filter ui: all ${checks.length} checks passed`);
