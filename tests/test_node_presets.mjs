// Verifies the Node Presets sidebar without a browser:
//   node tests/test_node_presets.mjs
//
// Part 1 checks the pure rules (grouping, capture, apply) directly.
// Part 2 loads js/node_presets.js in a minimal DOM with a fake ComfyUI app and drives the sidebar:
// registering the tab, rendering, applying a preset and saving one.

import { mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(os.tmpdir(), "dntp_check");
const failures = [];

function check(label, fn) {
    try {
        fn();
    } catch (error) {
        failures.push(`${label} :: ${error.message}`);
    }
}

async function checkAsync(label, fn) {
    try {
        await fn();
    } catch (error) {
        failures.push(`${label} :: ${error.message}`);
    }
}

// ---------------------------------------------------------------- part 1: pure rules
const logicPath = pathToFileURL(path.join(PACKAGE_DIR, "js", "node_presets_logic.js")).href;
const logic = await import(logicPath);

function widget(name, value, extra = {}) {
    return { name, type: extra.type ?? "number", value, options: extra.options ?? {}, ...extra };
}

function fakeNode({ id = 1, type = "KSampler", title = "KSampler", widgets = [], inputs = [] } = {}) {
    return { id, type, title, widgets, inputs, setDirtyCanvas() {} };
}

check("group key is node type plus title", () => {
    assert.equal(logic.nodeGroupKey(fakeNode({ type: "KSampler", title: "人物" })), "KSampler::人物");
    assert.equal(logic.nodeGroupKey(fakeNode({ type: "KSampler", title: "背景" })), "KSampler::背景");
    assert.equal(logic.nodeGroupKey(null), "::");
});

check("listWidgets skips hidden widgets and oversized values", () => {
    const node = fakeNode({
        widgets: [
            widget("steps", 28),
            widget("hidden", "x", { serialize: false }),
            widget("blob", "y".repeat(logic.MAX_VALUE_LENGTH + 1), { type: "string" }),
        ],
    });
    const entries = logic.listWidgets(node);

    assert.deepEqual(entries.map(entry => entry.name), ["steps", "blob"]);
    assert.equal(entries[0].selectable, true);
    assert.equal(entries[1].selectable, false);
    assert.match(entries[1].reason, /值过长/);
});

check("captureValues only takes the selected widgets", () => {
    const node = fakeNode({ widgets: [widget("steps", 28), widget("cfg", 6.5)] });
    assert.deepEqual(logic.captureValues(node, ["cfg"]), { cfg: 6.5 });
});

check("planApply writes numbers, clamps them and reports why others are skipped", () => {
    const node = fakeNode({
        widgets: [
            widget("steps", 20, { options: { min: 1, max: 100 } }),
            widget("sampler", "euler", { type: "combo", options: { values: ["euler", "dpmpp_2m"] } }),
            widget("hidden", 1, { serialize: false }),
        ],
        inputs: [{ widget: { name: "steps" }, link: 7 }],
    });

    const plan = logic.planApply(node, {
        steps: 500,
        sampler: "not_installed_model",
        hidden: 2,
        gone: 3,
    });

    assert.deepEqual(plan.apply, [{ name: "steps", value: 100, linked: true }]);
    assert.deepEqual(plan.skipped.map(entry => entry.name), ["sampler", "hidden", "gone"]);
    assert.match(plan.skipped[0].reason, /不在当前下拉选项/);
    assert.match(plan.skipped[1].reason, /隐藏/);
    assert.match(plan.skipped[2].reason, /没有这个参数/);
});

check("planApply accepts combo choices given as objects or as a function", () => {
    const asObjects = fakeNode({ widgets: [widget("ckpt", "a.safetensors", { type: "combo", options: { values: [{ value: "a.safetensors", text: "A" }] } })] });
    assert.equal(logic.planApply(asObjects, { ckpt: "a.safetensors" }).apply.length, 1);

    const asFunction = fakeNode({ widgets: [widget("ckpt", "a.safetensors", { type: "combo", options: { values: () => ["a.safetensors"] } })] });
    assert.equal(logic.planApply(asFunction, { ckpt: "a.safetensors" }).apply.length, 1);
});

check("valuesSummary names the first values and counts the rest", () => {
    assert.equal(logic.valuesSummary({ steps: 28, cfg: 6.5 }), "steps=28 · cfg=6.5");
    assert.equal(logic.valuesSummary({ a: 1, b: 2, c: 3, d: 4 }), "a=1 · b=2 · c=3 +1");
    assert.equal(logic.valuesSummary({}), "无参数");
});

check("normalizeStore drops junk and keeps valid presets", () => {
    const store = logic.normalizeStore({
        groups: {
            "KSampler::人物": { nodeType: "KSampler", title: "人物", presets: [{ name: "A", values: { steps: 28 } }, { name: "bad" }, null] },
            "empty::x": { presets: [] },
            broken: 5,
        },
    });

    assert.deepEqual(Object.keys(store.groups), ["KSampler::人物"]);
    assert.equal(store.groups["KSampler::人物"].presets.length, 1);
    assert.deepEqual(logic.normalizeStore(undefined).groups, {});
});

check("presets can be added, replaced, renamed and removed", () => {
    const store = logic.normalizeStore(null);
    logic.upsertPreset(store, "KSampler::人物", { nodeType: "KSampler", title: "人物" }, { name: "A", values: { steps: 28 } });
    logic.upsertPreset(store, "KSampler::人物", { nodeType: "KSampler", title: "人物" }, { name: "A", values: { steps: 40 } });

    assert.equal(store.groups["KSampler::人物"].presets.length, 1, "same name replaces");
    assert.equal(logic.findPreset(store, "KSampler::人物", "A").values.steps, 40);

    assert.equal(logic.renamePreset(store, "KSampler::人物", "A", "").ok, false);
    assert.equal(logic.renamePreset(store, "KSampler::人物", "A", "B").ok, true);
    assert.equal(logic.findPreset(store, "KSampler::人物", "B").name, "B");

    logic.removePreset(store, "KSampler::人物", "B");
    assert.equal(store.groups["KSampler::人物"], undefined, "an emptied group disappears");
});

check("duplicate preset names get a suffix", () => {
    const group = { presets: [{ name: "新预设" }, { name: "新预设 2" }] };
    assert.equal(logic.uniquePresetName(group, "新预设"), "新预设 3");
    assert.equal(logic.uniquePresetName({ presets: [] }, "新预设"), "新预设");
});

check("matchGroups separates current-workflow groups from the rest", () => {
    const store = logic.normalizeStore({
        groups: {
            "KSampler::人物": { nodeType: "KSampler", title: "人物", presets: [{ name: "A", values: { steps: 28 } }] },
            "VAEDecode::": { nodeType: "VAEDecode", title: "", presets: [{ name: "B", values: {} }] },
        },
    });

    const nodes = [
        fakeNode({ id: 3, type: "KSampler", title: "人物" }),
        fakeNode({ id: 4, type: "KSampler", title: "人物" }),
        fakeNode({ id: 5, type: "CLIPTextEncode", title: "CLIPTextEncode" }),
    ];
    const { matched, others } = logic.matchGroups(store, nodes);

    assert.equal(matched.length, 1);
    assert.equal(matched[0].nodes.length, 2, "both nodes with the same type and title share the group");
    assert.deepEqual(others.map(entry => entry.key), ["VAEDecode::"]);
});

check("nodeSignature notices renames and new nodes", () => {
    const before = logic.nodeSignature([fakeNode({ id: 1, title: "A" })]);
    assert.equal(before, logic.nodeSignature([fakeNode({ id: 1, title: "A" })]));
    assert.notEqual(before, logic.nodeSignature([fakeNode({ id: 1, title: "B" })]));
    assert.notEqual(before, logic.nodeSignature([fakeNode({ id: 1, title: "A" }), fakeNode({ id: 2 })]));
});

// ---------------------------------------------------------------- part 2: the sidebar itself
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(path.join(ROOT, "custom_nodes", "scripts"), { recursive: true });
mkdirSync(path.join(ROOT, "custom_nodes", "pkg", "js"), { recursive: true });
writeFileSync(path.join(ROOT, "package.json"), JSON.stringify({ type: "module" }));
copyFileSync(path.join(PACKAGE_DIR, "js", "node_presets.js"), path.join(ROOT, "custom_nodes", "pkg", "js", "node_presets.js"));
copyFileSync(path.join(PACKAGE_DIR, "js", "node_presets_logic.js"), path.join(ROOT, "custom_nodes", "pkg", "js", "node_presets_logic.js"));

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
        this.style = { setProperty: (key, value) => { this.style[key] = value; } };
        this.dataset = {};
        this.classList = new ClassList();
        this.listeners = {};
        this._text = "";
        this.disabled = false;
        this.checked = false;
        this.value = "";
        this.isConnected = true;
        this.id = "";
    }
    set className(value) { this.classList = new ClassList(); value.split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name)); }
    get className() { return [...this.classList.names].join(" "); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    append(...nodes) { nodes.forEach(node => this.children.push(node)); }
    appendChild(node) { this.children.push(node); return node; }
    removeChild(node) { this.children = this.children.filter(child => child !== node); }
    remove() { this.removed = true; }
    addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
    dispatch(type) { (this.listeners[type] ?? []).forEach(handler => handler({ target: this })); }
    click() { this.dispatch("click"); }
    focus() {}
    select() {}
    querySelectorAll() { return []; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    findByClass(name) { return this.descendants().find(element => element.classList.contains(name)) ?? null; }
    findAllByClass(name) { return this.descendants().filter(element => element.classList.contains(name)); }
    findButton(label) { return this.descendants().find(element => element.tagName === "button" && element.textContent === label) ?? null; }
}

const documentStub = {
    head: new El("head"),
    body: new El("body"),
    createElement: tag => new El(tag),
    getElementById: id => documentStub.head.children.find(element => element.id === id) ?? null,
    execCommand: () => true,
};
globalThis.document = documentStub;
globalThis.requestAnimationFrame = handler => { handler(); return 0; };
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.window = { prompt: () => null, confirm: () => true };
globalThis.Blob = class Blob { constructor(parts) { this.parts = parts; } };
globalThis.URL.createObjectURL = () => "blob:stub";
globalThis.URL.revokeObjectURL = () => {};

const savedStore = {
    groups: {
        "KSampler::人物": { nodeType: "KSampler", title: "人物", presets: [{ name: "精细", values: { steps: 40, sampler: "euler", ckpt: "gone.safetensors" } }] },
        "VAEDecode::": { nodeType: "VAEDecode", title: "", presets: [{ name: "旧的", values: { anything: 1 } }] },
    },
};
const writes = [];

const sampleNode = fakeNode({
    id: 11,
    type: "KSampler",
    title: "人物",
    widgets: [
        widget("steps", 20, { options: { min: 1, max: 100 } }),
        widget("sampler", "dpmpp_2m", { type: "combo", options: { values: ["euler", "dpmpp_2m"] } }),
        widget("ckpt", "other.safetensors", { type: "combo", options: { values: ["other.safetensors"] } }),
    ],
});

const appStub = {
    storageLocation: "server",
    graph: { _nodes: [sampleNode], change() {} },
    canvas: { centerOnNode() {}, selectNode() {} },
    extensionManager: { registerSidebarTab: tab => { appStub.registeredTab = tab; } },
    extensions: [],
    registerExtension(extension) { this.extensions.push(extension); },
};
// Mirrors the real api.storeUserData: it only stringifies when asked, and the server takes the raw body,
// so anything but a JSON string here would silently write "[object Object]".
const apiStub = {
    async getUserData() { return { status: 200, json: async () => savedStore }; },
    async storeUserData(file, data, options = { stringify: true }) {
        const body = options?.stringify === false ? data : JSON.stringify(data);
        assert.equal(typeof body, "string", "storeUserData must be given a JSON string");
        assert.doesNotThrow(() => JSON.parse(body), "the body has to be valid JSON");
        writes.push({ file, data: JSON.parse(body) });
    },
};

writeFileSync(path.join(ROOT, "custom_nodes", "scripts", "app.js"), `export const app = globalThis.__appStub;\n`);
writeFileSync(path.join(ROOT, "custom_nodes", "scripts", "api.js"), `export const api = globalThis.__apiStub;\n`);
globalThis.__appStub = appStub;
globalThis.__apiStub = apiStub;

await import(pathToFileURL(path.join(ROOT, "custom_nodes", "pkg", "js", "node_presets.js")).href);

const extension = appStub.extensions[0];
assert.ok(extension, "the extension registers itself");
await extension.setup();

const tab = appStub.registeredTab;
const host = new El("div");

await checkAsync("the sidebar tab is registered and renders", async () => {
    assert.equal(tab.type, "custom");
    assert.equal(tab.id, "danbooru-node-presets");
    tab.render(host);

    const root = host.findByClass("dntp-root");
    assert.ok(root, "the panel builds its DOM");
    assert.ok(host.findByClass("dntp-card"), "the group matching the canvas node is shown");
    assert.equal(host.findAllByClass("dntp-card").length, 1, "foreign groups stay hidden while the filter is on");
    assert.ok(root.textContent.includes("人物"), "the group shows the node title");
    assert.ok(root.textContent.includes("精细"), "the stored preset is listed");
});

await checkAsync("clicking a preset writes the widgets it can and explains the rest", async () => {
    host.findByClass("dntp-preset-name").click();

    assert.equal(sampleNode.widgets[0].value, 40, "steps was applied");
    assert.equal(sampleNode.widgets[1].value, "euler", "sampler was applied");
    assert.equal(sampleNode.widgets[2].value, "other.safetensors", "the stale combo value is not written over the working one");

    const status = host.findByClass("dntp-status");
    assert.match(status.textContent, /2 项生效/);
    assert.match(status.textContent, /不在当前下拉选项/, "the skipped combo is reported");
    assert.ok(status.classList.contains("warn"), "the status is marked as a warning");
});

await checkAsync("recording the current values keeps only the checked widgets", async () => {
    writes.length = 0;
    host.findByClass("dntp-card").findButton("＋ 记录当前").click();

    const overlay = documentStub.body.children.find(element => element.classList.contains("dntp-overlay"));
    assert.ok(overlay, "the record dialog opens");

    const rows = overlay.findAllByClass("dntp-widget");
    assert.equal(rows.length, 3, "every selectable widget is offered");

    // Uncheck the sampler, name it, save.
    const checkboxes = rows.map(row => row.children[0]);
    checkboxes[1].checked = false;
    overlay.findByClass("dntp-input").value = "粗调";
    overlay.findButton("保存").click();

    assert.equal(overlay.removed, true, "the dialog closes");

    const saved = writes.at(-1)?.data?.groups?.["KSampler::人物"]?.presets ?? [];
    const added = saved.find(preset => preset.name === "粗调");
    assert.ok(added, "the new preset is stored");
    assert.deepEqual(Object.keys(added.values).sort(), ["ckpt", "steps"], "only the checked widgets are captured");
    assert.equal(added.values.steps, 40, "the current value is captured, not the stored one");
});

await checkAsync("turning the filter off reveals presets from other workflows", async () => {
    const box = host.findByClass("dntp-card") && host.descendants().find(element => element.tagName === "input" && element.type === "checkbox" && element.checked);
    assert.ok(box, "the current-workflow filter starts enabled");
    box.checked = false;
    box.dispatch("change");

    const cards = host.findAllByClass("dntp-card");
    assert.equal(cards.length, 2, "the foreign group is listed too");
    assert.ok(cards.some(card => card.classList.contains("foreign")));
    assert.ok(host.findByClass("dntp-section").textContent.includes("其它工作流"));
});

if (failures.length) {
    console.log("FAILED:");
    failures.forEach(failure => console.log("  - " + failure));
    process.exit(1);
}
console.log(`node presets: all checks passed (${documentStub.head.children.length} style block, ${writes.length} store writes)`);
