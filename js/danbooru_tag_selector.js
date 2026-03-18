
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.DanbooruTagToolkit";
const STYLE_ID = "danbooru-tag-selector-style";
const MAX_UI_NODE_HEIGHT = 2000;
const DANBOORU_AUTOCOMPLETE_CACHE = new Map();
const DANBOORU_AUTOCOMPLETE_CACHE_TTL_MS = 60 * 1000;
const I18N = {
    en: {
        title_integrated: "Danbooru Tag Toolkit - All-in-One",
        title_selector: "Danbooru Tag Toolkit - Selector",
        btn_lang: "EN",
        btn_refresh: "Refresh",
        btn_settings: "Settings",
        btn_clear: "Clear",
        view_split: "Split",
        view_categories: "Categories",
        view_selected: "Selected",
        panel_categories: "Categories",
        panel_hint_categories: "Pick categories first, then click tags if available.",
        panel_selected: "Selected Category Rows",
        panel_hint_selected: "One row per category, tags joined by commas.",
        ph_search: "Search tags/category...",
        btn_all_visible: "All Visible",
        btn_none_visible: "None Visible",
        btn_all: "All",
        btn_none: "None",
        btn_pick_category: "Pick Cat",
        btn_unpick_category: "Unpick Cat",
        btn_reset_tag_weights: "W=1",
        filter_all_categories: "All Categories ({count})",
        empty_no_preview_integrated: "No preview data. Check tags/config and refresh.",
        empty_no_data_selector: "No data. Run workflow then refresh.",
        empty_no_selected_rows: "No selected category rows.",
        empty_selected_line: "(no tags yet)",
        row_add_tags: "Add tags",
        row_add_btn: "Add",
        row_add_ph: "tag1, tag2",
        row_weight_title: "Row weight",
        tag_weight_up: "Increase tag weight",
        tag_weight_down: "Decrease tag weight",
        tag_weight_reset: "Reset tag weights in this category",
        tag_weight_badge: "Tag weight {weight}",
        empty_preview: "(empty)",
        meta_line: "Output tags: {output} | Selected tags: {selected} | Selected categories: {categories}",
        status_ready: "Ready.",
        status_previewing_current: "Previewing categories from current tags...",
        status_loading_last: "Loading categories from last execution...",
        status_loading_latest: "Loading latest categories...",
        status_loaded_preview: "Loaded {count} categories from current tags.",
        status_loaded_last: "Loaded {count} categories from last execution.",
        status_no_preview: "No categories from current tags/config.",
        status_no_cached: "No cached category data yet. Run workflow once.",
        status_no_data: "No category data yet. Run workflow then refresh.",
        status_failed: "Failed to load categories.",
        status_excel_files_loaded: "Detected {count} data files.",
        status_excel_files_failed: "Failed to load data file list.",
        status_profile_loaded: "Loaded profile: {name}",
        status_profile_saved: "Saved profile: {name}",
        status_profile_load_failed: "Failed to load profile.",
        status_profile_save_failed: "Failed to save profile.",
        settings_title: "Node Settings",
        settings_sorter: "Sorter",
        settings_output: "Output",
        settings_excel: "Excel / CSV file",
        settings_excel_reload: "Reload",
        settings_profile: "Config profile",
        settings_profile_reload: "Reload",
        settings_profile_load: "Load",
        settings_profile_save: "Save",
        settings_profile_name: "Save as",
        settings_profile_name_ph: "profile name",
        settings_profile_none: "(none)",
        settings_mapping: "Category mapping",
        settings_order: "Category order",
        settings_default_category: "Default category",
        settings_regex_blacklist: "Regex blacklist",
        settings_tag_blacklist: "Tag blacklist",
        settings_dedup_before_sort: "Deduplicate tags before sort",
        settings_validation: "Validate category mapping",
        settings_reload: "Force reload database",
        settings_comment: "Keep category comments",
        settings_prefix: "Prefix text",
        settings_separator: "Separator",
        settings_use_all_empty: "Use all when none selected",
        settings_dedup_selected: "Deduplicate selected tags",
        settings_keep_trailing: "Keep trailing separator",
        settings_sep_comma: "Comma",
        settings_sep_newline: "Newline",
        settings_sep_space: "Space",
    },
    zh: {
        title_integrated: "Danbooru 标签工具箱 - 一体化",
        title_selector: "Danbooru 标签工具箱 - 选择器",
        btn_lang: "中",
        btn_refresh: "刷新",
        btn_settings: "设置",
        btn_clear: "清空",
        view_split: "分栏",
        view_categories: "分类",
        view_selected: "已选",
        panel_categories: "分类",
        panel_hint_categories: "可先选分类；有标签时再点标签精细选择。",
        panel_selected: "已选分类行",
        panel_hint_selected: "每个分类一行，标签用逗号拼接。",
        ph_search: "搜索标签/分类...",
        btn_all_visible: "全选可见",
        btn_none_visible: "清空可见",
        btn_all: "全选",
        btn_none: "清空",
        btn_pick_category: "选分类",
        btn_unpick_category: "取消分类",
        btn_reset_tag_weights: "W=1",
        filter_all_categories: "全部分类 ({count})",
        empty_no_preview_integrated: "暂无预览数据，请检查 tags/配置后刷新。",
        empty_no_data_selector: "暂无数据，请先运行工作流再刷新。",
        empty_no_selected_rows: "暂无已选分类行。",
        empty_selected_line: "(暂无标签)",
        row_add_tags: "添加标签",
        row_add_btn: "添加",
        row_add_ph: "标签1, 标签2",
        row_weight_title: "分类行权重",
        tag_weight_up: "提高标签权重",
        tag_weight_down: "降低标签权重",
        tag_weight_reset: "重置本分类所有标签权重",
        tag_weight_badge: "标签权重 {weight}",
        empty_preview: "(空)",
        meta_line: "输出标签: {output} | 已选标签: {selected} | 已选分类: {categories}",
        status_ready: "就绪。",
        status_previewing_current: "正在根据当前 tags 预览分类...",
        status_loading_last: "正在读取上次执行的分类缓存...",
        status_loading_latest: "正在加载最新分类数据...",
        status_loaded_preview: "已从当前 tags 加载 {count} 个分类。",
        status_loaded_last: "已从上次执行加载 {count} 个分类。",
        status_no_preview: "当前 tags/配置没有分类结果。",
        status_no_cached: "暂无缓存分类数据，请先运行一次工作流。",
        status_no_data: "暂无分类数据，请先运行工作流后刷新。",
        status_failed: "加载分类失败。",
        status_excel_files_loaded: "检测到 {count} 个数据文件。",
        status_excel_files_failed: "加载数据文件列表失败。",
        status_profile_loaded: "已加载配置: {name}",
        status_profile_saved: "已保存配置: {name}",
        status_profile_load_failed: "加载配置失败。",
        status_profile_save_failed: "保存配置失败。",
        settings_title: "节点设置",
        settings_sorter: "分类器",
        settings_output: "输出",
        settings_excel: "Excel / CSV 文件",
        settings_excel_reload: "重载",
        settings_profile: "配置文件",
        settings_profile_reload: "重载",
        settings_profile_load: "加载",
        settings_profile_save: "保存",
        settings_profile_name: "另存为",
        settings_profile_name_ph: "配置名称",
        settings_profile_none: "(无)",
        settings_mapping: "分类映射",
        settings_order: "分类顺序",
        settings_default_category: "默认分类",
        settings_regex_blacklist: "正则黑名单",
        settings_tag_blacklist: "标签黑名单",
        settings_dedup_before_sort: "分类前去重",
        settings_validation: "校验分类映射",
        settings_reload: "强制重载数据库",
        settings_comment: "保留分类注释",
        settings_prefix: "前缀文本",
        settings_separator: "分隔符",
        settings_use_all_empty: "未选择时输出全部",
        settings_dedup_selected: "输出标签去重",
        settings_keep_trailing: "保留尾部分隔符",
        settings_sep_comma: "逗号",
        settings_sep_newline: "换行",
        settings_sep_space: "空格",
    },
};

function tr(state, key, vars = {}) {
    const lang = state?.lang === "zh" ? "zh" : "en";
    const table = I18N[lang] || I18N.en;
    let text = table[key] ?? I18N.en[key] ?? key;
    text = String(text).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`));
    return text;
}

function setStatus(node, key, vars = {}) {
    const state = node.__dtsState;
    if (!state?.statusEl) return;
    state.statusKey = key;
    state.statusVars = vars;
    state.statusEl.textContent = tr(state, key, vars);
}

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .dts-root {
            --dts-bg: linear-gradient(180deg, #16202f 0%, #0f1621 100%);
            --dts-panel: #121c2a;
            --dts-panel-2: #0e1520;
            --dts-border: #2d3d57;
            --dts-soft: #9bb0cc;
            --dts-text: #ebf3ff;
            --dts-accent: #4cc9f0;
            --dts-warm: #ffb95f;
            width: 100%;
            max-width: 980px;
            min-height: 0;
            padding: 10px;
            border: 1px solid var(--dts-border);
            border-radius: 12px;
            background: var(--dts-bg);
            color: var(--dts-text);
            box-sizing: border-box;
            position: relative;
            font-size: 12px;
            overflow: hidden;
            min-width: 0;
            height: var(--dts-root-h, auto);
            display: flex;
            flex-direction: column;
            max-width: 100%;
        }
        .dts-head {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
            align-items: center;
            margin-bottom: 8px;
            min-width: 0;
        }
        .dts-title {
            font-weight: 700;
            font-size: 13px;
            color: #f4f8ff;
            letter-spacing: .2px;
        }
        .dts-status {
            margin-top: 2px;
            color: var(--dts-soft);
            font-size: 11px;
            min-height: 16px;
        }
        .dts-actions {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
            justify-content: flex-end;
            min-width: 0;
        }
        .dts-view-select {
            display: none;
            min-width: 120px;
            border: 1px solid #3d5478;
            border-radius: 8px;
            background: #0f1826;
            color: #e9f3ff;
            padding: 5px 8px;
            font-size: 11px;
        }
        .dts-btn {
            border: 1px solid #3f577a;
            border-radius: 8px;
            background: #1b2e49;
            color: #e9f2ff;
            padding: 5px 9px;
            cursor: pointer;
            font-size: 11px;
        }
        .dts-btn:hover {
            border-color: #5e7fae;
            background: #223a5b;
        }
        .dts-btn-main {
            border-color: #5d8ec7;
            background: #28557f;
        }
        .dts-btn-main:hover {
            border-color: #74ace8;
            background: #306597;
        }
        .dts-main {
            display: grid;
            grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr);
            gap: 10px;
            min-height: 0;
            min-width: 0;
            overflow: hidden;
            flex: 1 1 auto;
            width: 100%;
            max-width: 100%;
            height: 100%;
        }
        .dts-panel {
            border: 1px solid var(--dts-border);
            border-radius: 10px;
            background: linear-gradient(180deg, var(--dts-panel) 0%, var(--dts-panel-2) 100%);
            padding: 8px;
            min-height: 0;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            min-width: 0;
            height: 100%;
            overflow: hidden;
            width: 100%;
            max-width: 100%;
        }
        .dts-panel-left {
            display: grid;
            grid-template-rows: auto auto auto minmax(0, 1fr);
        }
        .dts-panel-right {
            display: flex;
            flex-direction: column;
        }
        .dts-panel-scroll {
            flex: 1 1 0;
            min-height: 0;
            min-width: 0;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-right: 2px;
            scrollbar-gutter: stable;
        }
        .dts-panel-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            min-width: 0;
            flex: 0 0 auto;
        }
        .dts-panel-title {
            font-weight: 700;
            color: #f4f8ff;
            min-width: 0;
        }
        .dts-panel-hint {
            font-size: 11px;
            color: var(--dts-soft);
            min-width: 0;
        }
        .dts-tools {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 6px;
            margin-bottom: 8px;
            min-width: 0;
        }
        .dts-search-wrap {
            position: relative;
        }
        .dts-search {
            width: 100%;
            border: 1px solid #3d5478;
            border-radius: 8px;
            background: #0f1826;
            color: #e9f4ff;
            outline: none;
            padding: 6px 28px 6px 9px;
            box-sizing: border-box;
        }
        .dts-search:focus {
            border-color: #6388b5;
            box-shadow: 0 0 0 2px rgba(76, 201, 240, .16);
        }
        .dts-search-clear {
            position: absolute;
            top: 50%;
            right: 8px;
            transform: translateY(-50%);
            border: none;
            background: transparent;
            color: #92a6c5;
            font-size: 14px;
            cursor: pointer;
            line-height: 1;
        }
        .dts-filter {
            min-width: 128px;
            border: 1px solid #3d5478;
            border-radius: 8px;
            background: #0f1826;
            color: #e9f3ff;
            padding: 5px 8px;
            font-size: 11px;
        }
        .dts-batch {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
            margin-bottom: 8px;
        }
        .dts-categories {
            max-height: none;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-right: 2px;
            flex: 1 1 0;
            min-height: 0;
            min-width: 0;
            width: 100%;
            max-width: 100%;
            scrollbar-gutter: stable;
        }
        .dts-category {
            border: 1px solid #304661;
            border-radius: 8px;
            background: #101d2e;
            padding: 6px;
        }
        .dts-category.dts-category-selected {
            border-color: #e4a654;
            box-shadow: 0 0 0 1px rgba(228, 166, 84, .25);
        }
        .dts-category-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
        }
        .dts-category-name {
            font-weight: 600;
            color: #f3f8ff;
        }
        .dts-small-actions {
            display: flex;
            gap: 4px;
        }
        .dts-small {
            border: 1px solid #4a6389;
            border-radius: 6px;
            background: #172a44;
            color: #e8f1ff;
            padding: 2px 6px;
            cursor: pointer;
            font-size: 10px;
        }
        .dts-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        .dts-tag {
            border: 1px solid #4f678e;
            border-radius: 999px;
            padding: 3px 8px 3px 9px;
            background: #182943;
            color: #edf4ff;
            cursor: pointer;
            user-select: none;
            line-height: 1.3;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            max-width: 100%;
        }
        .dts-tag:hover {
            border-color: #6a8fbd;
        }
        .dts-tag.dts-active {
            border-color: #e4a654;
            background: #3d2a16;
            color: #ffd9a5;
        }
        .dts-tag.dts-tag-weighted {
            border-color: #d9a45c;
            box-shadow: inset 0 0 0 1px rgba(217, 164, 92, .12);
        }
        .dts-tag-label {
            min-width: 0;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        .dts-tag-badge {
            border-radius: 999px;
            background: #294261;
            color: #ffd89c;
            padding: 1px 5px;
            font-size: 10px;
            line-height: 1.2;
            flex: 0 0 auto;
        }
        .dts-tag-controls {
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
        .dts-tag:hover .dts-tag-controls,
        .dts-tag:focus-within .dts-tag-controls {
            opacity: 1;
            pointer-events: auto;
            transform: translateX(0);
        }
        .dts-tag-step {
            width: 14px;
            height: 10px;
            padding: 0;
            border: 1px solid #5877a6;
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
        .dts-tag-step:hover {
            border-color: #87abe0;
            background: #27456b;
        }
        }
        .dts-selected-list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: none;
            overflow: visible;
            flex: 0 0 auto;
            height: auto;
            min-height: 0;
            min-width: 0;
            width: 100%;
            max-width: 100%;
        }
        .dts-selected-cat-item {
            border: 1px solid #405a80;
            border-radius: 8px;
            background: #142741;
            padding: 6px;
            display: grid;
            grid-template-columns: 28px minmax(0, 1fr) auto;
            gap: 6px;
            align-items: start;
            min-width: 0;
            max-width: 100%;
        }
        .dts-selected-cat-item.dragging {
            opacity: .46;
        }
        .dts-selected-cat-item.drop-target {
            border-color: var(--dts-warm);
            box-shadow: 0 0 0 2px rgba(255, 185, 95, .2);
        }
        .dts-drag {
            width: 24px;
            height: 24px;
            border: 1px solid #5c7daf;
            border-radius: 6px;
            background: #1d3558;
            color: #edf5ff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            cursor: grab;
            margin-top: 1px;
        }
        .dts-drag:active {
            cursor: grabbing;
        }
        .dts-selected-body {
            min-width: 0;
        }
        .dts-selected-title {
            color: #f2f7ff;
            font-weight: 700;
            margin-bottom: 3px;
            font-size: 12px;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        .dts-selected-line {
            color: #d6e6ff;
            line-height: 1.38;
            font-size: 11px;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        .dts-selected-add {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 6px;
            margin-top: 6px;
            align-items: start;
        }
        .dts-selected-add-main {
            position: relative;
            min-width: 0;
        }
        .dts-selected-add .dts-input {
            flex: 1 1 auto;
            width: 100%;
            height: 24px;
            padding: 0 6px;
            font-size: 11px;
        }
        .dts-selected-add .dts-icon {
            width: auto;
            min-width: 42px;
            padding: 0 8px;
        }
        .dts-selected-suggest {
            position: absolute;
            left: 0;
            right: 0;
            top: calc(100% + 4px);
            z-index: 25;
            max-height: 148px;
            overflow: auto;
            border: 1px solid #48648b;
            border-radius: 7px;
            background: #0f1a2a;
            box-shadow: 0 8px 18px rgba(0, 0, 0, .35);
            display: none;
        }
        .dts-selected-suggest.open {
            display: block;
        }
        .dts-selected-suggest-item {
            padding: 5px 7px;
            font-size: 11px;
            color: #dce8ff;
            border-bottom: 1px solid #223852;
            cursor: pointer;
            line-height: 1.35;
            word-break: break-word;
        }
        .dts-selected-suggest-item:last-child {
            border-bottom: none;
        }
        .dts-selected-suggest-item:hover {
            background: #1a2d46;
            color: #f1f7ff;
        }
        .dts-selected-suggest-item.active {
            background: #264264;
            color: #f7fbff;
        }
        .dts-selected-actions {
            display: flex;
            gap: 4px;
            align-items: center;
            justify-content: flex-end;
            flex: 0 0 auto;
            flex-wrap: wrap;
            min-width: 0;
        }
        .dts-weight-input {
            width: 52px;
            height: 24px;
            border: 1px solid #4b648b;
            border-radius: 6px;
            background: #0f1b2d;
            color: #e6f0ff;
            font-size: 11px;
            line-height: 1;
            text-align: center;
            outline: none;
            padding: 0 6px;
            box-sizing: border-box;
        }
        .dts-weight-input:hover {
            border-color: #6a8fc1;
        }
        .dts-weight-input:focus {
            border-color: #79a6de;
            box-shadow: 0 0 0 1px rgba(121, 166, 222, .24);
        }
        .dts-icon {
            width: 24px;
            height: 24px;
            border: 1px solid #4b648b;
            border-radius: 6px;
            background: #193054;
            color: #dbe9ff;
            font-size: 11px;
            line-height: 1;
            cursor: pointer;
        }
        .dts-icon:hover {
            border-color: #6688b9;
            background: #203e67;
        }
        .dts-danger {
            border-color: #7f5568;
            background: #3f2332;
            color: #ffdce8;
        }
        .dts-danger:hover {
            border-color: #ab728b;
            background: #4f2b3c;
        }
        .dts-preview {
            border: 1px solid #334964;
            border-radius: 8px;
            background: #0f1828;
            color: #dce9ff;
            min-height: 60px;
            padding: 8px;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.4;
            flex-shrink: 0;
            overflow: visible;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
        }
        .dts-meta {
            color: var(--dts-soft);
            font-size: 11px;
            flex: 0 0 auto;
            min-width: 0;
            overflow-wrap: anywhere;
        }
        .dts-empty {
            color: #95a9c7;
            font-style: italic;
            padding: 6px 2px;
        }
        .dts-settings {
            position: absolute;
            right: 10px;
            top: 44px;
            width: 360px;
            max-height: 78vh;
            overflow: auto;
            z-index: 9;
            border: 1px solid #3b4f6d;
            border-radius: 10px;
            background: #121d2d;
            box-shadow: 0 12px 26px rgba(0, 0, 0, .38);
            padding: 10px;
        }
        .dts-hidden {
            display: none;
        }
        .dts-settings-title {
            color: #f0f7ff;
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .dts-section {
            border: 1px solid #31465f;
            border-radius: 8px;
            background: #101b2b;
            padding: 8px;
            margin-bottom: 8px;
        }
        .dts-section-title {
            color: #d9e8ff;
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 6px;
        }
        .dts-field {
            margin-bottom: 8px;
        }
        .dts-field:last-child {
            margin-bottom: 0;
        }
        .dts-inline {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .dts-inline + .dts-inline {
            margin-top: 6px;
        }
        .dts-inline .dts-input,
        .dts-inline .dts-settings select,
        .dts-inline .dts-textarea {
            flex: 1 1 auto;
            min-width: 0;
        }
        .dts-inline .dts-btn {
            flex: 0 0 auto;
            white-space: nowrap;
        }
        .dts-field label {
            display: block;
            color: #9fb1cb;
            font-size: 11px;
            margin-bottom: 4px;
        }
        .dts-input,
        .dts-textarea,
        .dts-settings select {
            width: 100%;
            border: 1px solid #3b5173;
            border-radius: 8px;
            background: #0f1826;
            color: #eaf3ff;
            box-sizing: border-box;
            outline: none;
            font-size: 11px;
        }
        .dts-input,
        .dts-settings select {
            padding: 6px 8px;
        }
        .dts-textarea {
            min-height: 56px;
            resize: vertical;
            padding: 7px 8px;
            line-height: 1.35;
        }
        .dts-segment {
            display: inline-flex;
            gap: 4px;
            border: 1px solid #35506f;
            border-radius: 8px;
            padding: 3px;
            background: #101b2a;
        }
        .dts-seg {
            border: 1px solid transparent;
            border-radius: 6px;
            background: transparent;
            color: #b7c8e0;
            font-size: 11px;
            padding: 3px 8px;
            cursor: pointer;
        }
        .dts-seg.active {
            border-color: #4a79a8;
            background: #23466c;
            color: #eef6ff;
        }
        .dts-toggle {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid #304760;
            border-radius: 8px;
            background: #101b2b;
            padding: 6px 8px;
            margin-bottom: 6px;
            color: #c5d5ea;
            font-size: 11px;
        }
        .dts-toggle:last-child {
            margin-bottom: 0;
        }
        .dts-toggle input {
            accent-color: var(--dts-accent);
        }
        .dts-root.dts-compact .dts-main {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(170px, 1fr) minmax(140px, 1fr);
        }
        .dts-root.dts-compact .dts-panel-hint {
            display: none;
        }
        .dts-root.dts-compact .dts-view-select {
            display: inline-block;
        }
        .dts-root.dts-compact .dts-actions {
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .dts-root.dts-compact .dts-selected-actions {
            flex-direction: column;
        }
        @media (max-width: 760px) {
            .dts-main {
                grid-template-columns: minmax(0, 1fr);
            }
            .dts-settings {
                left: 10px;
                right: 10px;
                width: auto;
            }
        }
    `;
    document.head.appendChild(style);
}

function hideWidget(widget, suffix = "") {
    if (!widget || widget.__dtsHidden) return;
    widget.__dtsHidden = true;
    widget.origType ??= widget.type;
    widget.origComputeSize ??= widget.computeSize;
    widget.type = `converted-widget${suffix}`;
    widget.hidden = true;
    widget.serialize = true;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};

    const domWrapper = widget.inputEl?.closest?.(".dom-widget") ?? widget.inputEl ?? null;
    if (domWrapper) {
        domWrapper.hidden = true;
        domWrapper.style.display = "none";
        domWrapper.style.opacity = "0";
        domWrapper.style.maxHeight = "0";
        domWrapper.style.minHeight = "0";
        domWrapper.style.height = "0";
        domWrapper.style.pointerEvents = "none";
    }

    widget.linkedWidgets?.forEach(linkedWidget => {
        hideWidget(linkedWidget, `:${widget.name || suffix}`);
    });
}

function hideWidgetsByName(node, widgetNames) {
    const names = new Set(widgetNames);
    (node?.widgets || []).forEach(widget => {
        if (names.has(widget?.name)) {
            hideWidget(widget);
        }
    });
}

function compactTagsInputWidget(widget) {
    if (!widget) return;
    const originalComputeSize = typeof widget.computeSize === "function" ? widget.computeSize.bind(widget) : null;
    widget.computeSize = (width) => {
        const original = originalComputeSize ? originalComputeSize(width) : [Math.max(220, width || 220), 70];
        return [original[0], 44];
    };
}

function stabilizeDomWidgetComputeSize(widget) {
    if (!widget || widget.__dtsDomSizeStable) return;
    widget.__dtsDomSizeStable = true;
    widget.origComputeSize ??= widget.computeSize;
    widget.computeSize = width => [Math.max(0, Math.floor(width || 0)), 0];
}

function getWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

function getWidgetValue(node, name, fallback = "") {
    const widget = getWidget(node, name);
    if (!widget) return fallback;
    return widget.value ?? fallback;
}

function setWidgetValue(widget, value) {
    if (!widget) return;
    widget.value = value;
    if (typeof widget.callback === "function") {
        widget.callback(value);
    }
}

function normalizeSeparatorValue(rawValue) {
    const value = String(rawValue ?? "").trim().toLowerCase();
    if (value === "newline" || value === "space" || value === "comma") {
        return value;
    }
    if (value === "true" || value === "false") {
        return "comma";
    }
    return "comma";
}

function normalizeBooleanValue(rawValue, defaultValue = false) {
    if (typeof rawValue === "boolean") return rawValue;
    if (typeof rawValue === "number") return Boolean(rawValue);
    if (typeof rawValue === "string") {
        const value = rawValue.trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(value)) return true;
        if (["0", "false", "no", "off", ""].includes(value)) return false;
    }
    return defaultValue;
}

function coerceBoolWidget(widget, defaultValue) {
    if (!widget) return;
    const normalized = normalizeBooleanValue(widget.value, defaultValue);
    if (widget.value !== normalized) {
        setWidgetValue(widget, normalized);
    }
}

function sanitizeLegacyWidgetValues(node) {
    const selectedWidget = getWidget(node, "selected_tags_json");
    const selectedCategoriesWidget = getWidget(node, "selected_categories_json");
    const manualCategoryTagsWidget = getWidget(node, "manual_category_tags_json");
    const selectedCategoryWeightsWidget = getWidget(node, "selected_category_weights_json");
    const selectedTagWeightsWidget = getWidget(node, "selected_tag_weights_json");
    const prefixWidget = getWidget(node, "prefix_text");
    const separatorWidget = getWidget(node, "separator");
    const useAllWidget = getWidget(node, "use_all_when_empty");
    const dedupeWidget = getWidget(node, "deduplicate_selected");
    const trailingWidget = getWidget(node, "keep_trailing_comma");

    const rawWeights = String(selectedCategoryWeightsWidget?.value ?? "");
    const rawPrefix = String(prefixWidget?.value ?? "");
    const rawSeparator = separatorWidget?.value;
    const rawUseAll = useAllWidget?.value;
    const rawDedupe = dedupeWidget?.value;
    const prefixLooksLikeSeparator = ["comma", "space", "newline"].includes(rawPrefix.trim().toLowerCase());
    const separatorLooksLikeBoolean = typeof rawSeparator === "boolean"
        || ["", "0", "1", "false", "true", "no", "yes", "off", "on"].includes(String(rawSeparator ?? "").trim().toLowerCase());
    const weightsLookLikeLegacyPrefix = !rawWeights.trim()
        || (!rawWeights.trim().startsWith("{") && !rawWeights.trim().startsWith("["));

    // Migrate old workflows saved before selected_category_weights_json was inserted.
    if (
        selectedCategoryWeightsWidget
        && prefixWidget
        && separatorWidget
        && useAllWidget
        && dedupeWidget
        && trailingWidget
        && prefixLooksLikeSeparator
        && separatorLooksLikeBoolean
        && weightsLookLikeLegacyPrefix
    ) {
        setWidgetValue(selectedCategoryWeightsWidget, "{}");
        setWidgetValue(prefixWidget, rawWeights);
        setWidgetValue(separatorWidget, normalizeSeparatorValue(rawPrefix));
        setWidgetValue(useAllWidget, normalizeBooleanValue(rawSeparator, true));
        setWidgetValue(dedupeWidget, normalizeBooleanValue(rawUseAll, true));
        setWidgetValue(trailingWidget, normalizeBooleanValue(rawDedupe, true));
    }

    // Some already-saved broken workflows only retain the stale separator token in prefix_text.
    if (prefixWidget && separatorWidget && selectedCategoryWeightsWidget) {
        const normalizedPrefix = String(prefixWidget.value ?? "").trim().toLowerCase();
        const normalizedSeparator = normalizeSeparatorValue(separatorWidget.value);
        const hasRowWeights = Object.keys(parseSelectedCategoryWeights(selectedCategoryWeightsWidget.value)).length > 0;
        if (!hasRowWeights && ["comma", "space", "newline"].includes(normalizedPrefix) && normalizedPrefix === normalizedSeparator) {
            setWidgetValue(prefixWidget, "");
        }
    }

    if (selectedWidget) {
        const normalizedSelection = JSON.stringify(parseSelected(selectedWidget.value));
        if (String(selectedWidget.value ?? "") !== normalizedSelection) {
            setWidgetValue(selectedWidget, normalizedSelection);
        }
    }
    if (selectedCategoriesWidget) {
        const normalizedCategories = JSON.stringify(parseSelected(selectedCategoriesWidget.value));
        if (String(selectedCategoriesWidget.value ?? "") !== normalizedCategories) {
            setWidgetValue(selectedCategoriesWidget, normalizedCategories);
        }
    }
    if (manualCategoryTagsWidget) {
        const normalizedManual = JSON.stringify(parseManualCategoryTags(manualCategoryTagsWidget.value));
        if (String(manualCategoryTagsWidget.value ?? "") !== normalizedManual) {
            setWidgetValue(manualCategoryTagsWidget, normalizedManual);
        }
    }
    if (selectedCategoryWeightsWidget) {
        const normalizedWeights = JSON.stringify(parseSelectedCategoryWeights(selectedCategoryWeightsWidget.value));
        if (String(selectedCategoryWeightsWidget.value ?? "") !== normalizedWeights) {
            setWidgetValue(selectedCategoryWeightsWidget, normalizedWeights);
        }
    }
    if (selectedTagWeightsWidget) {
        const normalizedTagWeights = JSON.stringify(parseSelectedTagWeights(selectedTagWeightsWidget.value));
        if (String(selectedTagWeightsWidget.value ?? "") !== normalizedTagWeights) {
            setWidgetValue(selectedTagWeightsWidget, normalizedTagWeights);
        }
    }
    if (separatorWidget) {
        const normalizedSeparator = normalizeSeparatorValue(separatorWidget.value);
        if (String(separatorWidget.value ?? "") !== normalizedSeparator) {
            setWidgetValue(separatorWidget, normalizedSeparator);
        }
    }

    coerceBoolWidget(useAllWidget, true);
    coerceBoolWidget(dedupeWidget, true);
    coerceBoolWidget(trailingWidget, true);
    coerceBoolWidget(getWidget(node, "deduplicate_tags"), false);
    coerceBoolWidget(getWidget(node, "validation"), true);
    coerceBoolWidget(getWidget(node, "force_reload"), false);
    coerceBoolWidget(getWidget(node, "is_comment"), true);
}

function parseSelected(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) return dedupeStringList(rawValue, normalizeTag);
    if (typeof rawValue !== "string") return [];
    try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
            return dedupeStringList(parsed, normalizeTag);
        }
    } catch (error) {
        console.warn("[DanbooruTagToolkit] parse selection failed:", error);
    }
    return [];
}

function dedupeStringList(values, normalize = value => String(value || "").trim().toLowerCase()) {
    const seen = new Set();
    const unique = [];
    const items = Array.isArray(values) ? values : [];
    items.forEach(value => {
        const text = String(value || "").trim();
        if (!text) return;
        const key = String(normalize(text) || "").trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        unique.push(text);
    });
    return unique;
}

function splitTagText(rawValue) {
    if (Array.isArray(rawValue)) {
        return rawValue.map(v => String(v || "").trim()).filter(Boolean);
    }
    return String(rawValue || "")
        .split(",")
        .map(v => String(v || "").trim())
        .filter(Boolean);
}

function parseTagInputContext(rawValue) {
    const text = String(rawValue || "");
    const parts = text.split(",");
    const token = String(parts[parts.length - 1] || "").trim();
    const prefixParts = parts
        .slice(0, -1)
        .map(v => String(v || "").trim())
        .filter(Boolean);
    return { token, prefixParts };
}

function parseManualCategoryTags(rawValue) {
    const result = {};
    if (!rawValue) return result;
    let parsed = rawValue;
    if (typeof rawValue === "string") {
        try {
            parsed = JSON.parse(rawValue);
        } catch {
            return result;
        }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result;
    for (const [category, tags] of Object.entries(parsed)) {
        const key = String(category || "").trim();
        if (!key) continue;
        const normalized = splitTagText(tags);
        if (!normalized.length) continue;
        const seen = new Set();
        const unique = [];
        normalized.forEach(tag => {
            const n = normalizeTag(tag);
            if (!n || seen.has(n)) return;
            seen.add(n);
            unique.push(tag);
        });
        if (unique.length) {
            result[key] = unique;
        }
    }
    return result;
}

function normalizeTag(tag) {
    return String(tag || "").trim().toLowerCase();
}

function normalizeCategory(category) {
    return String(category || "").trim().toLowerCase();
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

function parseSelectedCategoryWeights(rawValue) {
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
    for (const [category, weight] of Object.entries(parsed)) {
        const key = String(category || "").trim();
        if (!key) continue;
        const normalizedWeight = normalizeWeightValue(weight, 1);
        if (normalizedWeight !== 1) {
            result[key] = normalizedWeight;
        }
    }
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
        const key = String(tag || "").trim();
        if (!key) continue;
        const normalizedWeight = normalizeWeightValue(weight, 1);
        if (normalizedWeight !== 1) {
            result[key] = normalizedWeight;
        }
    }
    return result;
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

function extractPromptFromSelectionData(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) return "";
    try {
        const data = JSON.parse(rawValue);
        const prompts = [];
        const collectPrompt = item => {
            if (!item || typeof item !== "object") return "";
            const p = String(item.prompt || "").trim();
            if (p) {
                prompts.push(p);
                return;
            }
            const t = String(item.tags || item.tag_string || "").trim();
            if (t) {
                prompts.push(tagsSpaceToCommaPrompt(t));
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

function looksLikeJsonText(text) {
    const t = String(text || "").trim();
    return t.startsWith("{") || t.startsWith("[");
}

function getLinkedStringValue(node, inputName) {
    const input = getInputSlot(node, inputName);
    if (!input || input.link == null) return null;

    const linkRecord = getLinkRecord(input.link);
    const originId = readLinkField(linkRecord, "origin_id", 1);
    if (originId == null) return null;

    const originNode = app.graph?.getNodeById?.(originId);
    if (!originNode) return null;

    // 优先读取 Gallery/类似节点的 selection_data，避免误读 gallery_posts_json（整页数据）。
    const selectionWidget = originNode.widgets?.find(w => w?.name === "selection_data");
    if (typeof selectionWidget?.value === "string") {
        // For gallery-like nodes, always trust selection_data (including empty).
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

function getPreviewTagsText(node) {
    const input = getInputSlot(node, "tags");
    const isLinked = Boolean(input?.link != null);
    const linkedText = isLinked ? (getLinkedStringValue(node, "tags") || "") : "";
    const localText = String(getWidgetValue(node, "tags", "") || "");
    const previewText = isLinked ? String(linkedText || "").trim() : localText.trim();

    return {
        isLinked,
        linkedText: String(linkedText || ""),
        localText,
        previewText,
    };
}

function normalizeCategories(input) {
    const result = {};
    if (!input || typeof input !== "object") return result;
    for (const [category, tags] of Object.entries(input)) {
        if (!Array.isArray(tags)) {
            result[category] = [];
            continue;
        }
        result[category] = dedupeStringList(tags, normalizeTag);
    }
    return result;
}

function resolveCategoryName(categories, targetCategory) {
    const targetKey = normalizeCategory(targetCategory);
    for (const category of Object.keys(categories || {})) {
        if (normalizeCategory(category) === targetKey) {
            return category;
        }
    }
    return String(targetCategory || "").trim();
}

function syncManualTagsWidget(node, markDirty = true) {
    const state = node.__dtsState;
    if (!state?.manualCategoryTagsWidget) return;
    setWidgetValue(state.manualCategoryTagsWidget, JSON.stringify(state.manualCategoryTags || {}));
    if (markDirty) {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function applyManualTagsToCategories(state) {
    const manual = state?.manualCategoryTags || {};
    if (!state || !manual || typeof manual !== "object") return;
    for (const [category, tags] of Object.entries(manual)) {
        const resolvedCategory = resolveCategoryName(state.categories || {}, category);
        const existing = Array.isArray(state.categories?.[resolvedCategory]) ? [...state.categories[resolvedCategory]] : [];
        const seen = new Set(existing.map(normalizeTag));
        splitTagText(tags).forEach(tag => {
            const key = normalizeTag(tag);
            if (!key || seen.has(key)) return;
            seen.add(key);
            existing.push(tag);
        });
        if (existing.length) {
            state.categories[resolvedCategory] = existing;
        }
    }
}

function addManualTagsToCategory(node, category, rawTags) {
    const state = node.__dtsState;
    if (!state) return;
    const resolvedCategory = resolveCategoryName(state.categories || {}, category);
    const nextTags = splitTagText(rawTags);
    if (!nextTags.length) return;

    if (!state.manualCategoryTags || typeof state.manualCategoryTags !== "object") {
        state.manualCategoryTags = {};
    }
    const existingManual = splitTagText(state.manualCategoryTags[resolvedCategory] || []);
    const seenManual = new Set(existingManual.map(normalizeTag));
    nextTags.forEach(tag => {
        const key = normalizeTag(tag);
        if (!key || seenManual.has(key)) return;
        seenManual.add(key);
        existingManual.push(tag);
    });
    state.manualCategoryTags[resolvedCategory] = existingManual;

    const existingCategoryTags = Array.isArray(state.categories?.[resolvedCategory]) ? [...state.categories[resolvedCategory]] : [];
    const seenCategory = new Set(existingCategoryTags.map(normalizeTag));
    nextTags.forEach(tag => {
        const key = normalizeTag(tag);
        if (!key || seenCategory.has(key)) return;
        seenCategory.add(key);
        existingCategoryTags.push(tag);
    });
    state.categories[resolvedCategory] = existingCategoryTags;

    const selectedSeen = new Set((state.selected || []).map(normalizeTag));
    nextTags.forEach(tag => {
        const key = normalizeTag(tag);
        if (!key || selectedSeen.has(key)) return;
        selectedSeen.add(key);
        state.selected.push(tag);
    });

    syncManualTagsWidget(node, false);
    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node, false);
    syncSelectedCategoriesWidget(node);
    renderAll(node);
}

function getTagCategoryMap(categories) {
    const map = {};
    for (const [category, tags] of Object.entries(categories)) {
        for (const tag of tags) {
            const key = normalizeTag(tag);
            if (!(key in map)) {
                map[key] = category;
            }
        }
    }
    return map;
}

function getSelectedByCategory(state) {
    const selectedSet = new Set(state.selected.map(normalizeTag));
    const byCategory = {};
    for (const category of Object.keys(state.categories)) {
        const row = [];
        const rowSeen = new Set();
        for (const tag of state.categories[category]) {
            const key = normalizeTag(tag);
            if (selectedSet.has(key) && !rowSeen.has(key)) {
                rowSeen.add(key);
                row.push(tag);
            }
        }
        if (row.length) {
            byCategory[category] = row;
        }
    }
    return byCategory;
}

function getExplicitSelectedCategories(state) {
    const categoryLookup = {};
    for (const category of Object.keys(state.categories || {})) {
        const key = normalizeCategory(category);
        if (!(key in categoryLookup)) {
            categoryLookup[key] = category;
        }
    }

    const selected = [];
    const seen = new Set();
    for (const category of state.selectedCategories || []) {
        const key = normalizeCategory(category);
        const resolved = categoryLookup[key];
        if (!resolved || seen.has(key)) continue;
        seen.add(key);
        selected.push(resolved);
    }
    return selected;
}

function getActiveSelectedCategories(state) {
    const byCategory = getSelectedByCategory(state);
    const explicitSelected = getExplicitSelectedCategories(state);
    const activeKeys = new Set([
        ...Object.keys(byCategory).map(normalizeCategory),
        ...explicitSelected.map(normalizeCategory),
    ]);

    const categoryLookup = {};
    for (const category of Object.keys(state.categories || {})) {
        const key = normalizeCategory(category);
        if (!(key in categoryLookup)) {
            categoryLookup[key] = category;
        }
    }

    const ordered = [];
    const seen = new Set();
    for (const category of state.categoryOrder || []) {
        const key = normalizeCategory(category);
        const resolved = categoryLookup[key];
        if (!resolved || !activeKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        ordered.push(resolved);
    }

    for (const category of explicitSelected) {
        const key = normalizeCategory(category);
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(category);
    }

    for (const category of Object.keys(state.categories || {})) {
        const key = normalizeCategory(category);
        if (!activeKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        ordered.push(category);
    }

    return ordered;
}

function updateCategoryOrderFromSelection(state) {
    state.categoryOrder = getActiveSelectedCategories(state);
}

function getOrderedSelectedTags(state) {
    const byCategory = getSelectedByCategory(state);
    const tags = [];
    const seen = new Set();

    for (const category of state.categoryOrder || []) {
        const row = byCategory[category] || [];
        for (const tag of row) {
            const key = normalizeTag(tag);
            if (!seen.has(key)) {
                seen.add(key);
                tags.push(tag);
            }
        }
    }
    for (const tag of state.selected || []) {
        const key = normalizeTag(tag);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
    }
    return tags;
}

function joinSelected(tags, separator) {
    const sepMap = { comma: ", ", newline: "\n", space: " " };
    return tags.join(sepMap[separator] || ", ");
}

function appendTrailing(text, separator, keepTrailing) {
    if (!text || !keepTrailing) return text;
    if (separator === "newline") return `${text}\n`;
    if (separator === "space") return `${text} `;
    return `${text}, `;
}

function getResolvedSelectedCategoryWeights(state) {
    const lookup = {};
    for (const category of Object.keys(state.categories || {})) {
        const key = normalizeCategory(category);
        if (!(key in lookup)) {
            lookup[key] = category;
        }
    }

    const resolved = {};
    for (const [category, rawWeight] of Object.entries(state.selectedCategoryWeights || {})) {
        const key = normalizeCategory(category);
        if (!key) continue;
        const resolvedCategory = lookup[key] || String(category || "").trim();
        if (!resolvedCategory) continue;
        resolved[resolvedCategory] = normalizeWeightValue(rawWeight, 1);
    }
    return resolved;
}

function buildAvailableTagLookup(state) {
    const lookup = {};
    for (const tags of Object.values(state.categories || {})) {
        for (const tag of tags) {
            const key = normalizeTag(tag);
            if (key && !(key in lookup)) {
                lookup[key] = tag;
            }
        }
    }
    return lookup;
}

function getResolvedSelectedTagWeights(state) {
    const lookup = buildAvailableTagLookup(state);
    const resolved = {};
    for (const [tag, rawWeight] of Object.entries(state.selectedTagWeights || {})) {
        const key = normalizeTag(tag);
        if (!key) continue;
        const resolvedTag = lookup[key] || String(tag || "").trim();
        if (!resolvedTag) continue;
        const normalizedWeight = normalizeWeightValue(rawWeight, 1);
        if (normalizedWeight !== 1) {
            resolved[resolvedTag] = normalizedWeight;
        }
    }
    return resolved;
}

function buildWeightedPromptPart(tags, weight) {
    const cleanedTags = tags
        .map(tag => String(tag || "").trim())
        .filter(Boolean);
    if (!cleanedTags.length) return "";

    const normalizedWeight = normalizeWeightValue(weight, 1);
    const rowText = cleanedTags.join(", ");
    return normalizedWeight !== 1
        ? `(${rowText}:${formatWeightValue(normalizedWeight)})`
        : rowText;
}

function getOutputTagsForPreview(node) {
    const state = node.__dtsState;
    if (!state) return [];

    const selectedTags = getOrderedSelectedTags(state);
    const selectedCategories = getExplicitSelectedCategories(state);
    const useAllWhenEmpty = normalizeBooleanValue(getWidgetValue(node, "use_all_when_empty", true), true);
    const deduplicateSelected = normalizeBooleanValue(getWidgetValue(node, "deduplicate_selected", true), true);

    const availableMap = {};
    const allTags = [];
    for (const tags of Object.values(state.categories || {})) {
        for (const tag of tags) {
            const key = normalizeTag(tag);
            if (!(key in availableMap)) {
                availableMap[key] = tag;
                allTags.push(tag);
            }
        }
    }

    let mergedTags = [];
    if (selectedTags.length) {
        for (const tag of selectedTags) {
            const key = normalizeTag(tag);
            if (key in availableMap) {
                mergedTags.push(availableMap[key]);
            } else if (String(tag || "").trim()) {
                mergedTags.push(String(tag).trim());
            }
        }
    } else if (selectedCategories.length) {
        for (const category of selectedCategories) {
            mergedTags.push(...(state.categories[category] || []));
        }
    } else if (useAllWhenEmpty) {
        mergedTags = [...allTags];
    }

    if (deduplicateSelected && mergedTags.length) {
        const seen = new Set();
        mergedTags = mergedTags.filter(tag => {
            const key = normalizeTag(tag);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    return mergedTags;
}

function getOutputPartsForPreview(node) {
    const state = node.__dtsState;
    if (!state) return [];

    const selectedTags = getOrderedSelectedTags(state);
    const selectedTagSet = new Set(selectedTags.map(normalizeTag));
    const explicitCategories = getExplicitSelectedCategories(state);
    const explicitSet = new Set(explicitCategories.map(normalizeCategory));
    const activeCategories = getActiveSelectedCategories(state);
    const useAllWhenEmpty = normalizeBooleanValue(getWidgetValue(node, "use_all_when_empty", true), true);
    const deduplicateSelected = normalizeBooleanValue(getWidgetValue(node, "deduplicate_selected", true), true);
    const categoryWeights = getResolvedSelectedCategoryWeights(state);
    const resolvedTagWeights = getResolvedSelectedTagWeights(state);
    const tagWeights = {};
    for (const [tag, rawWeight] of Object.entries(resolvedTagWeights)) {
        tagWeights[normalizeTag(tag)] = normalizeWeightValue(rawWeight, 1);
    }

    if (!selectedTags.length && !activeCategories.length) {
        return useAllWhenEmpty ? getOutputTagsForPreview(node) : [];
    }

    const parts = [];
    const assignedKeys = new Set();
    const dedupeKeys = new Set();

    activeCategories.forEach(category => {
        const categoryTags = Array.isArray(state.categories?.[category]) ? state.categories[category] : [];
        let rowTags = [];
        if (selectedTagSet.size) {
            rowTags = categoryTags.filter(tag => selectedTagSet.has(normalizeTag(tag)));
        }
        if (!rowTags.length && explicitSet.has(normalizeCategory(category))) {
            rowTags = [...categoryTags];
        }

        const rowOutput = [];
        const rowSeen = new Set();
        rowTags.forEach(tag => {
            const text = String(tag || "").trim();
            const key = normalizeTag(text);
            if (!key || rowSeen.has(key)) return;
            if (deduplicateSelected && dedupeKeys.has(key)) return;
            rowSeen.add(key);
            assignedKeys.add(key);
            if (deduplicateSelected) {
                dedupeKeys.add(key);
            }
            rowOutput.push(text);
        });

        if (!rowOutput.length) return;

        const rowWeight = normalizeWeightValue(categoryWeights[category], 1);
        if (rowWeight !== 1) {
            const weightedParts = [];
            const remainingTags = [];
            rowOutput.forEach(tag => {
                const key = normalizeTag(tag);
                const tagWeight = normalizeWeightValue(tagWeights[key], 1);
                if (tagWeight !== 1) {
                    weightedParts.push(buildWeightedPromptPart([tag], tagWeight));
                } else {
                    remainingTags.push(tag);
                }
            });
            weightedParts.filter(Boolean).forEach(part => parts.push(part));
            const groupedPart = buildWeightedPromptPart(remainingTags, rowWeight);
            if (groupedPart) {
                parts.push(groupedPart);
            }
            return;
        }

        rowOutput.forEach(tag => {
            const key = normalizeTag(tag);
            const tagWeight = normalizeWeightValue(tagWeights[key], 1);
            parts.push(tagWeight !== 1 ? buildWeightedPromptPart([tag], tagWeight) : tag);
        });
    });

    selectedTags.forEach(tag => {
        const text = String(tag || "").trim();
        const key = normalizeTag(text);
        if (!key || assignedKeys.has(key)) return;
        if (deduplicateSelected && dedupeKeys.has(key)) return;
        assignedKeys.add(key);
        if (deduplicateSelected) {
            dedupeKeys.add(key);
        }
        const tagWeight = normalizeWeightValue(tagWeights[key], 1);
        parts.push(tagWeight !== 1 ? buildWeightedPromptPart([text], tagWeight) : text);
    });

    return parts;
}

function buildPreview(node) {
    const state = node.__dtsState;
    if (!state) return "";

    const outputParts = getOutputPartsForPreview(node);
    const separator = normalizeSeparatorValue(getWidgetValue(node, "separator", "comma"));
    const keepTrailing = normalizeBooleanValue(getWidgetValue(node, "keep_trailing_comma", true), true);
    const prefix = String(getWidgetValue(node, "prefix_text", "") || "").trim();
    const selectedText = appendTrailing(joinSelected(outputParts, separator), separator, keepTrailing);

    if (prefix && selectedText) {
        if (separator === "newline") return `${prefix}\n${selectedText}`;
        if (separator === "space") return `${prefix} ${selectedText}`;
        return `${prefix}, ${selectedText}`;
    }
    if (prefix) return prefix;
    return selectedText;
}

function syncSelectedWidget(node, markDirty = true) {
    const state = node.__dtsState;
    if (!state?.selectedWidget) return;

    const orderedTags = getOrderedSelectedTags(state);
    setWidgetValue(state.selectedWidget, JSON.stringify(orderedTags));
    syncSelectedCategoryWeightsWidget(node, false);

    if (markDirty) {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function syncSelectedCategoriesWidget(node, markDirty = true) {
    const state = node.__dtsState;
    if (!state?.selectedCategoriesWidget) return;

    const explicitCategories = getExplicitSelectedCategories(state);
    const explicitSet = new Set(explicitCategories.map(normalizeCategory));
    const ordered = [];
    const seen = new Set();

    for (const category of state.categoryOrder || []) {
        const key = normalizeCategory(category);
        if (!explicitSet.has(key) || seen.has(key)) continue;
        seen.add(key);
        ordered.push(category);
    }
    for (const category of explicitCategories) {
        const key = normalizeCategory(category);
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(category);
    }

    state.selectedCategories = [...ordered];
    setWidgetValue(state.selectedCategoriesWidget, JSON.stringify(ordered));
    syncSelectedCategoryWeightsWidget(node, false);

    if (markDirty) {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function syncSelectedCategoryWeightsWidget(node, markDirty = true) {
    const state = node.__dtsState;
    if (!state?.selectedCategoryWeightsWidget) return;

    const activeCategories = getActiveSelectedCategories(state);
    const sourceWeights = {};
    for (const [category, rawWeight] of Object.entries(state.selectedCategoryWeights || {})) {
        const key = normalizeCategory(category);
        if (!key || key in sourceWeights) continue;
        sourceWeights[key] = normalizeWeightValue(rawWeight, 1);
    }

    const orderedWeights = {};
    activeCategories.forEach(category => {
        const key = normalizeCategory(category);
        const weight = normalizeWeightValue(sourceWeights[key], 1);
        if (weight !== 1) {
            orderedWeights[category] = weight;
        }
    });

    state.selectedCategoryWeights = orderedWeights;
    setWidgetValue(state.selectedCategoryWeightsWidget, JSON.stringify(orderedWeights));

    if (markDirty) {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function syncSelectedTagWeightsWidget(node, markDirty = true) {
    const state = node.__dtsState;
    if (!state?.selectedTagWeightsWidget) return;

    const lookup = buildAvailableTagLookup(state);
    const sourceWeights = {};
    for (const [tag, rawWeight] of Object.entries(state.selectedTagWeights || {})) {
        const key = normalizeTag(tag);
        if (!key || !(key in lookup) || key in sourceWeights) continue;
        sourceWeights[key] = normalizeWeightValue(rawWeight, 1);
    }

    const orderedWeights = {};
    const seen = new Set();
    for (const tags of Object.values(state.categories || {})) {
        for (const tag of tags) {
            const key = normalizeTag(tag);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const weight = normalizeWeightValue(sourceWeights[key], 1);
            if (weight !== 1) {
                orderedWeights[lookup[key] || tag] = weight;
            }
        }
    }

    state.selectedTagWeights = orderedWeights;
    setWidgetValue(state.selectedTagWeightsWidget, JSON.stringify(orderedWeights));

    if (markDirty) {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function pruneSelectionByAvailability(state) {
    const available = new Set();
    for (const tags of Object.values(state.categories)) {
        for (const tag of tags) available.add(normalizeTag(tag));
    }
    for (const tags of Object.values(state.manualCategoryTags || {})) {
        for (const tag of splitTagText(tags)) {
            available.add(normalizeTag(tag));
        }
    }
    state.selected = state.selected.filter(tag => available.has(normalizeTag(tag)));
}

function pruneCategorySelectionByAvailability(state) {
    const lookup = {};
    for (const category of Object.keys(state.categories || {})) {
        const key = normalizeCategory(category);
        if (!(key in lookup)) {
            lookup[key] = category;
        }
    }

    const next = [];
    const seen = new Set();
    for (const category of state.selectedCategories || []) {
        const key = normalizeCategory(category);
        const resolved = lookup[key];
        if (!resolved || seen.has(key)) continue;
        seen.add(key);
        next.push(resolved);
    }
    state.selectedCategories = next;
}

function pruneSelectedCategoryWeightsByAvailability(state) {
    const lookup = {};
    for (const category of Object.keys(state.categories || {})) {
        const key = normalizeCategory(category);
        if (!(key in lookup)) {
            lookup[key] = category;
        }
    }

    const next = {};
    const seen = new Set();
    for (const [category, rawWeight] of Object.entries(state.selectedCategoryWeights || {})) {
        const key = normalizeCategory(category);
        const resolved = lookup[key];
        if (!resolved || seen.has(key)) continue;
        const weight = normalizeWeightValue(rawWeight, 1);
        if (weight === 1) continue;
        seen.add(key);
        next[resolved] = weight;
    }
    state.selectedCategoryWeights = next;
}

function pruneSelectedTagWeightsByAvailability(state) {
    const lookup = buildAvailableTagLookup(state);
    const next = {};
    const seen = new Set();
    for (const [tag, rawWeight] of Object.entries(state.selectedTagWeights || {})) {
        const key = normalizeTag(tag);
        const resolved = lookup[key];
        if (!resolved || seen.has(key)) continue;
        const weight = normalizeWeightValue(rawWeight, 1);
        if (weight === 1) continue;
        seen.add(key);
        next[resolved] = weight;
    }
    state.selectedTagWeights = next;
}

function scheduleRefresh(node, delay = 420) {
    const state = node.__dtsState;
    if (!state) return;
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => refreshCategories(node), delay);
}

function applyPanelVisibility(state) {
    if (!state?.leftPanel || !state?.rightPanel) return;
    const showPanel = panel => {
        panel.style.display = "";
    };
    if (!state.compact) {
        showPanel(state.leftPanel);
        showPanel(state.rightPanel);
        return;
    }
    const mode = state.viewMode || "split";
    if (mode === "selected") {
        state.leftPanel.style.display = "none";
        showPanel(state.rightPanel);
    } else if (mode === "categories") {
        showPanel(state.leftPanel);
        state.rightPanel.style.display = "none";
    } else {
        showPanel(state.leftPanel);
        showPanel(state.rightPanel);
    }
}

function getWidgetHeight(widget, width = 320) {
    if (!widget || widget.hidden) return 0;
    if (typeof widget.type === "string" && widget.type.startsWith("converted-widget")) return 0;
    try {
        const size = typeof widget.computeSize === "function" ? widget.computeSize(width) : null;
        const height = Number(Array.isArray(size) ? size[1] : 0);
        return Number.isFinite(height) && height > 0 ? height : 0;
    } catch {
        return 0;
    }
}

function getStableWidgetTop(node, width) {
    const state = node?.__dtsState;
    const baseTop = 72;
    if (!state) return baseTop;

    let expectedTop = baseTop;
    if (state.isIntegrated) {
        const tagsHeight = getWidgetHeight(state.tagsWidget, width);
        if (tagsHeight > 0) {
            expectedTop += tagsHeight + 10;
        }
    }

    const measuredTop = Number(state.domWidgetEl?.offsetTop || state.rootEl?.offsetTop || 0);
    if (!Number.isFinite(measuredTop) || measuredTop <= 0) {
        state.lastStableWidgetTop = expectedTop;
        return expectedTop;
    }

    const lowerBound = Math.max(baseTop, expectedTop - 8);
    const upperBound = expectedTop + 20;
    const clampedTop = Math.min(upperBound, Math.max(lowerBound, Math.floor(measuredTop)));
    state.lastStableWidgetTop = clampedTop;
    return clampedTop;
}

function syncRootLayout(node) {
    const state = node.__dtsState;
    if (!state?.rootEl) return;

    const width = Math.max(300, Math.floor(node.size?.[0] || 640));
    const height = Math.min(MAX_UI_NODE_HEIGHT, Math.max(240, Math.floor(node.size?.[1] || 620)));
    if (Array.isArray(node.size) && node.size[1] !== height) {
        node.size[1] = height;
    }
    const innerWidth = Math.max(280, width - 22);
    if (!state.domWidgetEl || !state.domWidgetEl.isConnected) {
        state.domWidgetEl = state.rootEl?.closest?.(".dom-widget") ?? state.rootEl?.parentElement ?? null;
    }
    const widgetTop = getStableWidgetTop(node, innerWidth);
    const bottomPadding = 12;
    const innerHeight = Math.max(120, Math.floor(height - widgetTop - bottomPadding));

    if (state.domWidgetEl) {
        state.domWidgetEl.style.width = `${innerWidth}px`;
        state.domWidgetEl.style.maxWidth = `${innerWidth}px`;
        state.domWidgetEl.style.height = `${innerHeight}px`;
        state.domWidgetEl.style.maxHeight = `${innerHeight}px`;
        state.domWidgetEl.style.minHeight = `${innerHeight}px`;
        state.domWidgetEl.style.overflow = "hidden";
        state.domWidgetEl.style.boxSizing = "border-box";
        state.domWidgetEl.style.minWidth = "0";
    }

    state.rootEl.style.width = "100%";
    state.rootEl.style.maxWidth = "100%";
    state.rootEl.style.minWidth = "0";
    state.rootEl.style.height = `${innerHeight}px`;
    state.rootEl.style.maxHeight = `${innerHeight}px`;
    state.rootEl.style.minHeight = `${innerHeight}px`;
    state.rootEl.style.setProperty("--dts-root-h", `${innerHeight}px`);

    state.compact = width < 650 || height < 500;
    state.rootEl.classList.toggle("dts-compact", state.compact);

    if (!state.compact) {
        state.viewMode = "split";
        if (state.viewSelect) state.viewSelect.value = "split";
    } else if (!state.viewMode) {
        state.viewMode = "split";
        if (state.viewSelect) state.viewSelect.value = "split";
    }
    applyPanelVisibility(state);
}

function scheduleRootLayoutSync(node, delay = 120) {
    const state = node?.__dtsState;
    if (!state?.rootEl) return;

    syncRootLayout(node);
    if (state.layoutRafId) {
        cancelAnimationFrame(state.layoutRafId);
        state.layoutRafId = null;
    }
    if (state.layoutTimeoutId) {
        clearTimeout(state.layoutTimeoutId);
        state.layoutTimeoutId = null;
    }

    state.layoutRafId = requestAnimationFrame(() => {
        syncRootLayout(node);
        state.layoutRafId = requestAnimationFrame(() => {
            syncRootLayout(node);
            state.layoutRafId = null;
            node.setDirtyCanvas?.(true, true);
        });
    });

    state.layoutTimeoutId = setTimeout(() => {
        syncRootLayout(node);
        state.layoutTimeoutId = null;
        node.setDirtyCanvas?.(true, true);
    }, Math.max(0, delay));
}

function getFilteredCategories(state) {
    const filtered = {};
    const search = state.searchText.trim().toLowerCase();

    for (const [category, tags] of Object.entries(state.categories)) {
        if (state.categoryFilter !== "__all" && category !== state.categoryFilter) continue;

        const categoryHit = category.toLowerCase().includes(search);
        if (!search) {
            filtered[category] = tags;
            continue;
        }

        if (categoryHit) {
            filtered[category] = tags;
            continue;
        }

        const matchedTags = tags.filter(tag => tag.toLowerCase().includes(search));
        if (matchedTags.length) {
            filtered[category] = matchedTags;
        }
    }
    return filtered;
}

function addVisibleTags(node) {
    const state = node.__dtsState;
    if (!state) return;

    const selectedSet = new Set(state.selected.map(normalizeTag));
    const filtered = getFilteredCategories(state);

    for (const tags of Object.values(filtered)) {
        for (const tag of tags) {
            const key = normalizeTag(tag);
            if (!selectedSet.has(key)) {
                selectedSet.add(key);
                state.selected.push(tag);
            }
        }
    }

    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node);
    renderAll(node);
}

function clearVisibleTags(node) {
    const state = node.__dtsState;
    if (!state) return;

    const visible = new Set();
    const filtered = getFilteredCategories(state);
    for (const tags of Object.values(filtered)) {
        for (const tag of tags) visible.add(normalizeTag(tag));
    }

    state.selected = state.selected.filter(tag => !visible.has(normalizeTag(tag)));
    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node);
    renderAll(node);
}

async function fetchJsonOrThrow(url, options = undefined) {
    const response = await api.fetchApi(url, options);
    if (!response.ok) {
        let detail = "";
        try {
            const errPayload = await response.json();
            detail = String(errPayload?.message || "");
        } catch {
            // ignore parse failures and keep status code only
        }
        throw new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`);
    }
    return response.json();
}

async function fetchDanbooruAutocompleteItems(query, limit = 20) {
    const normalized = String(query || "").trim().toLowerCase();
    if (normalized.length < 2) return [];

    const now = Date.now();
    const cacheKey = `${normalized}|${limit}`;
    const cached = DANBOORU_AUTOCOMPLETE_CACHE.get(cacheKey);
    if (cached && (now - cached.ts) < DANBOORU_AUTOCOMPLETE_CACHE_TTL_MS) {
        return Array.isArray(cached.items) ? cached.items : [];
    }

    const params = new URLSearchParams({
        q: normalized,
        limit: String(Math.max(1, Math.min(50, Number(limit) || 20))),
    });
    const payload = await fetchJsonOrThrow(`/danbooru_tag_gallery/autocomplete?${params.toString()}`, { cache: "no-store" });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    DANBOORU_AUTOCOMPLETE_CACHE.set(cacheKey, { ts: now, items });
    return items;
}

function normalizeDefaultCategoryValue(rawValue, fallback = "未归类词") {
    const text = String(rawValue ?? "").trim();
    return text || fallback;
}

async function reloadExcelFileOptions(node, preferredValue = "", silent = false) {
    const state = node.__dtsState;
    const select = state?.settingsControls?.excelSelect;
    if (!state || !select) return;

    const currentValue = String(preferredValue || getWidgetValue(node, "excel_file", "danbooru_tags.xlsx") || "danbooru_tags.xlsx");
    try {
        const payload = await fetchJsonOrThrow("/danbooru_tag_picker/excel_files", { cache: "no-store" });
        const files = Array.isArray(payload?.files) ? payload.files.map(x => String(x || "")).filter(Boolean) : [];
        state.availableExcelFiles = files;
        const options = files.map(name => ({ value: name, label: name }));
        replaceSelectOptions(select, options, currentValue);
        if (!silent) {
            setStatus(node, "status_excel_files_loaded", { count: files.length });
        }
    } catch (error) {
        if (!silent) {
            setStatus(node, "status_excel_files_failed");
        }
        console.error("[DanbooruTagToolkit] failed to list excel files:", error);
    }
}

async function reloadProfileOptions(node, preferredName = "", silent = false) {
    const state = node.__dtsState;
    const select = state?.settingsControls?.profileSelect;
    if (!state || !select) return;

    const currentName = String(preferredName || getWidgetValue(node, "config_profile", "") || "");
    try {
        const payload = await fetchJsonOrThrow("/danbooru_tag_picker/profile/list", { cache: "no-store" });
        const profiles = Array.isArray(payload?.profiles) ? payload.profiles.map(x => String(x || "")).filter(Boolean) : [];
        state.availableProfiles = profiles;
        const options = [
            { value: "", label: tr(state, "settings_profile_none") },
            ...profiles.map(name => ({ value: name, label: name })),
        ];
        replaceSelectOptions(select, options, currentName);
        if (state.settingsControls?.profileNameInput && !state.settingsControls.profileNameInput.matches(":focus")) {
            state.settingsControls.profileNameInput.value = select.value || "";
        }
        if (!silent) {
            setStatus(node, "status_ready");
        }
    } catch (error) {
        if (!silent) {
            setStatus(node, "status_profile_load_failed");
        }
        console.error("[DanbooruTagToolkit] failed to list profiles:", error);
    }
}

async function loadProfileIntoSettings(node, profileName) {
    const state = node.__dtsState;
    const targetName = String(profileName || "").trim();
    if (!state || !targetName) return;

    try {
        const payload = await fetchJsonOrThrow(
            `/danbooru_tag_picker/profile/load?name=${encodeURIComponent(targetName)}`,
            { cache: "no-store" }
        );
        const profile = payload?.profile || {};

        setWidgetValue(state.excelWidget, String(profile.excel_file || "danbooru_tags.xlsx"));
        setWidgetValue(state.mappingWidget, String(profile.category_mapping || "{}"));
        setWidgetValue(state.orderWidget, String(profile.new_category_order || "[]"));
        setWidgetValue(
            state.defaultCategoryWidget,
            normalizeDefaultCategoryValue(profile.default_category, "未归类词")
        );
        setWidgetValue(state.profileWidget, targetName);

        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        syncSettingsFromWidgets(node);
        await reloadExcelFileOptions(node, String(profile.excel_file || ""), true);
        await reloadProfileOptions(node, targetName, true);

        if (state.isIntegrated) {
            scheduleRefresh(node, 500);
        } else {
            renderPreview(node);
        }
        setStatus(node, "status_profile_loaded", { name: targetName });
    } catch (error) {
        setStatus(node, "status_profile_load_failed");
        console.error("[DanbooruTagToolkit] failed to load profile:", error);
    }
}

async function saveProfileFromSettings(node, profileName) {
    const state = node.__dtsState;
    const targetName = String(profileName || "").trim();
    if (!state || !targetName) return;

    const body = {
        name: targetName,
        excel_file: String(getWidgetValue(node, "excel_file", "danbooru_tags.xlsx") || "danbooru_tags.xlsx"),
        category_mapping: String(getWidgetValue(node, "category_mapping", "{}") || "{}"),
        new_category_order: String(getWidgetValue(node, "new_category_order", "[]") || "[]"),
        default_category: normalizeDefaultCategoryValue(
            getWidgetValue(node, "default_category", "未归类词"),
            "未归类词"
        ),
    };
    try {
        const payload = await fetchJsonOrThrow("/danbooru_tag_picker/profile/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const savedName = String(payload?.profile_name || targetName);
        setWidgetValue(state.profileWidget, savedName);
        await reloadProfileOptions(node, savedName, true);
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        setStatus(node, "status_profile_saved", { name: savedName });
    } catch (error) {
        setStatus(node, "status_profile_save_failed");
        console.error("[DanbooruTagToolkit] failed to save profile:", error);
    }
}

function buildPreviewSignature(node, previewText) {
    return JSON.stringify({
        tags: String(previewText || ""),
        excel_file: String(getWidgetValue(node, "excel_file", "danbooru_tags.xlsx") || "danbooru_tags.xlsx"),
        category_mapping: String(getWidgetValue(node, "category_mapping", "{}") || "{}"),
        new_category_order: String(getWidgetValue(node, "new_category_order", "[]") || "[]"),
        default_category: normalizeDefaultCategoryValue(getWidgetValue(node, "default_category", "未归类词"), "未归类词"),
        regex_blacklist: String(getWidgetValue(node, "regex_blacklist", "") || ""),
        tag_blacklist: String(getWidgetValue(node, "tag_blacklist", "") || ""),
        deduplicate_tags: normalizeBooleanValue(getWidgetValue(node, "deduplicate_tags", false), false),
        validation: normalizeBooleanValue(getWidgetValue(node, "validation", true), true),
        force_reload: normalizeBooleanValue(getWidgetValue(node, "force_reload", false), false),
        is_comment: normalizeBooleanValue(getWidgetValue(node, "is_comment", true), true),
    });
}

async function refreshCategories(node) {
    const state = node.__dtsState;
    if (!state) return;
    const tStart = performance.now();
    let networkMs = 0;
    const requestId = (state.refreshRequestId || 0) + 1;
    state.refreshRequestId = requestId;

    const previewInfo = getPreviewTagsText(node);
    const usePreview = state.isIntegrated;
    const previewSignature = buildPreviewSignature(node, previewInfo.previewText);
    const signatureChanged = state.lastPreviewSignature !== previewSignature;
    const useLatestFastPath = usePreview && !previewInfo.previewText.length && !signatureChanged;

    setStatus(
        node,
        useLatestFastPath
            ? "status_loading_latest"
            : state.isIntegrated
            ? "status_previewing_current"
            : "status_loading_latest"
    );

    try {
        let source = usePreview ? "preview" : "latest";
        let payload;

        if (usePreview) {
            const previewPayload = {
                node_id: String(node.id),
                tags: previewInfo.previewText,
                excel_file: String(getWidgetValue(node, "excel_file", "danbooru_tags.xlsx")),
                category_mapping: String(getWidgetValue(node, "category_mapping", "{}")),
                new_category_order: String(getWidgetValue(node, "new_category_order", "[]")),
                default_category: normalizeDefaultCategoryValue(
                    getWidgetValue(node, "default_category", "未归类词"),
                    "未归类词"
                ),
                regex_blacklist: String(getWidgetValue(node, "regex_blacklist", "")),
                tag_blacklist: String(getWidgetValue(node, "tag_blacklist", "")),
                deduplicate_tags: normalizeBooleanValue(getWidgetValue(node, "deduplicate_tags", false), false),
                validation: normalizeBooleanValue(getWidgetValue(node, "validation", true), true),
                // Refresh 预览阶段禁用强制重载，避免每次都清空后端缓存导致重读 xlsx。
                force_reload: false,
                is_comment: normalizeBooleanValue(getWidgetValue(node, "is_comment", true), true),
            };

            if (useLatestFastPath) {
                try {
                    const tNet0 = performance.now();
                    const latestData = await fetchJsonOrThrow(
                        `/danbooru_tag_picker/latest?node_id=${encodeURIComponent(String(node.id))}`,
                        { cache: "no-store" }
                    );
                    networkMs += performance.now() - tNet0;
                    const latestCategories = normalizeCategories(latestData.categories || {});
                    if (Object.keys(latestCategories).length > 0) {
                        source = "latest";
                        payload = { ...latestData, categories: latestCategories };
                        state.lastPreviewSignature = previewSignature;
                    }
                } catch {
                    // latest fast path failed, fallback to preview below
                }
            }

            if (!payload) {
                const tNet0 = performance.now();
                const previewData = await fetchJsonOrThrow("/danbooru_tag_picker/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(previewPayload),
                });
                networkMs += performance.now() - tNet0;
                state.lastPreviewSignature = previewSignature;

                const mergedCategories = normalizeCategories(previewData.categories || {});

                // 输入 tags 为空（例如 WD14 连线场景）时，优先保留分类骨架，再尝试用最新缓存填充真实 tags。
                if (!previewInfo.previewText.length) {
                    try {
                        const tNet0 = performance.now();
                        const latestData = await fetchJsonOrThrow(
                            `/danbooru_tag_picker/latest?node_id=${encodeURIComponent(String(node.id))}`,
                            { cache: "no-store" }
                        );
                        networkMs += performance.now() - tNet0;
                        const latestCategories = normalizeCategories(latestData.categories || {});
                        if (Object.keys(latestCategories).length > 0) {
                            const skeletonLookup = {};
                            for (const category of Object.keys(mergedCategories)) {
                                const key = normalizeCategory(category);
                                if (!(key in skeletonLookup)) {
                                    skeletonLookup[key] = category;
                                }
                            }

                            let hasFilledAny = false;
                            for (const [category, tags] of Object.entries(latestCategories)) {
                                const key = normalizeCategory(category);
                                const targetCategory = skeletonLookup[key];
                                if (!targetCategory) continue;
                                mergedCategories[targetCategory] = Array.isArray(tags) ? tags : [];
                                hasFilledAny = true;
                            }
                            if (hasFilledAny) {
                                source = "latest";
                            }
                        }
                    } catch {
                        // ignore latest-fallback failure and keep preview skeleton
                    }
                }

                payload = { ...previewData, categories: mergedCategories };
            }
        } else {
            const tNet0 = performance.now();
            payload = await fetchJsonOrThrow(
                `/danbooru_tag_picker/latest?node_id=${encodeURIComponent(String(node.id))}`,
                { cache: "no-store" }
            );
            networkMs += performance.now() - tNet0;
        }
        if (requestId !== state.refreshRequestId) return;
        const tBeforeRender = performance.now();
        state.categories = normalizeCategories(payload.categories || {});
        applyManualTagsToCategories(state);

        pruneSelectionByAvailability(state);
        pruneCategorySelectionByAvailability(state);
        pruneSelectedCategoryWeightsByAvailability(state);
        pruneSelectedTagWeightsByAvailability(state);
        updateCategoryOrderFromSelection(state);
        syncSelectedWidget(node, false);
        syncSelectedCategoriesWidget(node, false);
        syncSelectedCategoryWeightsWidget(node, false);
        syncSelectedTagWeightsWidget(node, false);

        const count = Object.keys(state.categories).length;
        const statusKey = count > 0
            ? (source === "preview" ? "status_loaded_preview" : "status_loaded_last")
            : (state.isIntegrated ? "status_no_preview" : "status_no_data");
        setStatus(node, statusKey, { count });

        renderAll(node);
        const tEnd = performance.now();
        const totalTags = Object.values(state.categories).reduce(
            (sum, tags) => sum + (Array.isArray(tags) ? tags.length : 0),
            0
        );
        console.log(
            "[DanbooruTagToolkit] Refresh timing:",
            {
                node_id: String(node.id),
                source,
                use_latest_fast_path: useLatestFastPath,
                tags_chars: previewInfo.previewText.length,
                categories: Object.keys(state.categories).length,
                tags_total: totalTags,
                network_ms: Number(networkMs.toFixed(1)),
                render_ms: Number((tEnd - tBeforeRender).toFixed(1)),
                total_ms: Number((tEnd - tStart).toFixed(1)),
            }
        );
    } catch (error) {
        if (requestId !== state.refreshRequestId) return;
        setStatus(node, "status_failed");
        console.error("[DanbooruTagToolkit] refresh failed:", error);
    }
}

function toggleTag(node, tag) {
    const state = node.__dtsState;
    if (!state) return;

    const key = normalizeTag(tag);
    const idx = state.selected.findIndex(t => normalizeTag(t) === key);
    if (idx >= 0) state.selected.splice(idx, 1);
    else state.selected.push(tag);

    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node);
    renderAll(node);
}

function toggleCategory(node, category) {
    const state = node.__dtsState;
    if (!state) return;

    const key = normalizeCategory(category);
    const idx = (state.selectedCategories || []).findIndex(c => normalizeCategory(c) === key);
    if (idx >= 0) {
        state.selectedCategories.splice(idx, 1);
    } else {
        state.selectedCategories.push(category);
    }

    updateCategoryOrderFromSelection(state);
    syncSelectedCategoriesWidget(node);
    renderAll(node);
}

function addCategoryAll(node, category) {
    const state = node.__dtsState;
    if (!state) return;

    const selectedSet = new Set(state.selected.map(normalizeTag));
    for (const tag of (state.categories[category] || [])) {
        const key = normalizeTag(tag);
        if (!selectedSet.has(key)) {
            selectedSet.add(key);
            state.selected.push(tag);
        }
    }

    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node);
    renderAll(node);
}

function clearCategory(node, category) {
    const state = node.__dtsState;
    if (!state) return;

    const removeSet = new Set((state.categories[category] || []).map(normalizeTag));
    state.selected = state.selected.filter(tag => !removeSet.has(normalizeTag(tag)));
    if (state.manualCategoryTags && typeof state.manualCategoryTags === "object") {
        delete state.manualCategoryTags[category];
        syncManualTagsWidget(node, false);
    }

    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node);
    renderAll(node);
}

function removeSelectedCategory(node, category) {
    const state = node.__dtsState;
    if (!state) return;

    const removeSet = new Set((state.categories[category] || []).map(normalizeTag));
    state.selected = state.selected.filter(tag => !removeSet.has(normalizeTag(tag)));
    state.selectedCategories = (state.selectedCategories || [])
        .filter(cat => normalizeCategory(cat) !== normalizeCategory(category));
    if (state.manualCategoryTags && typeof state.manualCategoryTags === "object") {
        const keys = Object.keys(state.manualCategoryTags);
        keys.forEach(key => {
            if (normalizeCategory(key) === normalizeCategory(category)) {
                delete state.manualCategoryTags[key];
            }
        });
        syncManualTagsWidget(node, false);
    }
    if (state.selectedCategoryWeights && typeof state.selectedCategoryWeights === "object") {
        Object.keys(state.selectedCategoryWeights).forEach(key => {
            if (normalizeCategory(key) === normalizeCategory(category)) {
                delete state.selectedCategoryWeights[key];
            }
        });
    }
    if (state.selectedTagWeights && typeof state.selectedTagWeights === "object") {
        Object.keys(state.selectedTagWeights).forEach(key => {
            if (removeSet.has(normalizeTag(key))) {
                delete state.selectedTagWeights[key];
            }
        });
    }

    updateCategoryOrderFromSelection(state);
    syncSelectedWidget(node, false);
    syncSelectedCategoriesWidget(node, false);
    syncSelectedCategoryWeightsWidget(node, false);
    syncSelectedTagWeightsWidget(node);
    renderAll(node);
}

function moveCategoryOrder(state, from, to) {
    if (from === to || from < 0 || to < 0 || from >= state.categoryOrder.length || to >= state.categoryOrder.length) {
        return;
    }
    const arr = [...state.categoryOrder];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    state.categoryOrder = arr;
}

function setCategoryRowWeight(node, category, rawWeight) {
    const state = node.__dtsState;
    if (!state) return 1;

    const resolvedCategory = resolveCategoryName(state.categories || {}, category);
    if (!resolvedCategory) return 1;

    if (!state.selectedCategoryWeights || typeof state.selectedCategoryWeights !== "object") {
        state.selectedCategoryWeights = {};
    }

    Object.keys(state.selectedCategoryWeights).forEach(key => {
        if (normalizeCategory(key) === normalizeCategory(resolvedCategory) && key !== resolvedCategory) {
            delete state.selectedCategoryWeights[key];
        }
    });

    const weight = normalizeWeightValue(rawWeight, 1);
    if (weight === 1) {
        delete state.selectedCategoryWeights[resolvedCategory];
    } else {
        state.selectedCategoryWeights[resolvedCategory] = weight;
    }

    syncSelectedCategoryWeightsWidget(node);
    renderPreview(node);
    return weight;
}

function setTagWeight(node, tag, rawWeight) {
    const state = node.__dtsState;
    if (!state) return 1;

    const lookup = buildAvailableTagLookup(state);
    const key = normalizeTag(tag);
    const resolvedTag = lookup[key] || String(tag || "").trim();
    if (!resolvedTag) return 1;

    if (!state.selectedTagWeights || typeof state.selectedTagWeights !== "object") {
        state.selectedTagWeights = {};
    }

    Object.keys(state.selectedTagWeights).forEach(existingTag => {
        if (normalizeTag(existingTag) === key && existingTag !== resolvedTag) {
            delete state.selectedTagWeights[existingTag];
        }
    });

    const weight = normalizeWeightValue(rawWeight, 1);
    if (weight === 1) {
        delete state.selectedTagWeights[resolvedTag];
    } else {
        state.selectedTagWeights[resolvedTag] = weight;
    }

    syncSelectedTagWeightsWidget(node);
    renderAll(node);
    return weight;
}

function adjustTagWeight(node, tag, delta) {
    const state = node.__dtsState;
    if (!state) return 1;

    const lookup = buildAvailableTagLookup(state);
    const key = normalizeTag(tag);
    const resolvedTag = lookup[key] || String(tag || "").trim();
    const currentWeight = normalizeWeightValue(getResolvedSelectedTagWeights(state)[resolvedTag], 1);
    return setTagWeight(node, resolvedTag, currentWeight + delta);
}

function resetCategoryTagWeights(node, category) {
    const state = node.__dtsState;
    if (!state) return;

    const resolvedCategory = resolveCategoryName(state.categories || {}, category);
    if (!resolvedCategory || !state.selectedTagWeights || typeof state.selectedTagWeights !== "object") return;

    const removeSet = new Set((state.categories[resolvedCategory] || []).map(normalizeTag));
    let changed = false;
    Object.keys(state.selectedTagWeights).forEach(tag => {
        if (removeSet.has(normalizeTag(tag))) {
            delete state.selectedTagWeights[tag];
            changed = true;
        }
    });
    if (!changed) return;

    syncSelectedTagWeightsWidget(node);
    renderAll(node);
}

function renderCategoryFilter(node) {
    const state = node.__dtsState;
    const select = state.categorySelect;
    if (!select) return;

    const categories = Object.keys(state.categories);
    const oldValue = state.categoryFilter;

    select.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "__all";
    allOption.textContent = tr(state, "filter_all_categories", { count: categories.length });
    select.appendChild(allOption);

    categories.forEach(cat => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = `${cat} (${state.categories[cat].length})`;
        select.appendChild(option);
    });

    state.categoryFilter = categories.includes(oldValue) ? oldValue : "__all";
    select.value = state.categoryFilter;
}

function renderCategories(node) {
    const state = node.__dtsState;
    const container = state.categoriesEl;
    container.innerHTML = "";

    renderCategoryFilter(node);
    const categories = getFilteredCategories(state);
    const names = Object.keys(categories);

    if (!names.length) {
        const empty = document.createElement("div");
        empty.className = "dts-empty";
        empty.textContent = state.isIntegrated
            ? tr(state, "empty_no_preview_integrated")
            : tr(state, "empty_no_data_selector");
        container.appendChild(empty);
        return;
    }

    const selectedSet = new Set(state.selected.map(normalizeTag));
    const selectedCategorySet = new Set((state.selectedCategories || []).map(normalizeCategory));
    const tagWeights = getResolvedSelectedTagWeights(state);

    for (const category of names) {
        const card = document.createElement("div");
        card.className = "dts-category";
        if (selectedCategorySet.has(normalizeCategory(category))) {
            card.classList.add("dts-category-selected");
        }

        const head = document.createElement("div");
        head.className = "dts-category-head";

        const title = document.createElement("div");
        title.className = "dts-category-name";
        title.textContent = `${category} (${categories[category].length})`;

        const actions = document.createElement("div");
        actions.className = "dts-small-actions";

        const categoryBtn = document.createElement("button");
        categoryBtn.className = "dts-small";
        categoryBtn.textContent = selectedCategorySet.has(normalizeCategory(category))
            ? tr(state, "btn_unpick_category")
            : tr(state, "btn_pick_category");
        categoryBtn.onclick = () => toggleCategory(node, category);

        const allBtn = document.createElement("button");
        allBtn.className = "dts-small";
        allBtn.textContent = tr(state, "btn_all");
        allBtn.onclick = () => addCategoryAll(node, category);

        const noneBtn = document.createElement("button");
        noneBtn.className = "dts-small";
        noneBtn.textContent = tr(state, "btn_none");
        noneBtn.onclick = () => clearCategory(node, category);

        const resetWeightsBtn = document.createElement("button");
        resetWeightsBtn.className = "dts-small";
        resetWeightsBtn.textContent = tr(state, "btn_reset_tag_weights");
        resetWeightsBtn.title = tr(state, "tag_weight_reset");
        resetWeightsBtn.onclick = () => resetCategoryTagWeights(node, category);

        actions.appendChild(categoryBtn);
        actions.appendChild(allBtn);
        actions.appendChild(noneBtn);
        actions.appendChild(resetWeightsBtn);

        head.appendChild(title);
        head.appendChild(actions);

        const tagsBox = document.createElement("div");
        tagsBox.className = "dts-tags";
        categories[category].forEach(tag => {
            const currentWeight = normalizeWeightValue(tagWeights[tag], 1);
            const chip = document.createElement("span");
            chip.className = "dts-tag";
            if (selectedSet.has(normalizeTag(tag))) chip.classList.add("dts-active");
            if (currentWeight !== 1) chip.classList.add("dts-tag-weighted");
            chip.onclick = () => toggleTag(node, tag);

            const label = document.createElement("span");
            label.className = "dts-tag-label";
            label.textContent = tag;
            chip.appendChild(label);

            if (currentWeight !== 1) {
                const badge = document.createElement("span");
                badge.className = "dts-tag-badge";
                badge.textContent = formatWeightValue(currentWeight);
                badge.title = tr(state, "tag_weight_badge", { weight: formatWeightValue(currentWeight) });
                chip.appendChild(badge);
            }

            const controls = document.createElement("span");
            controls.className = "dts-tag-controls";

            const increaseBtn = document.createElement("button");
            increaseBtn.type = "button";
            increaseBtn.className = "dts-tag-step";
            increaseBtn.textContent = "+";
            increaseBtn.title = tr(state, "tag_weight_up");
            increaseBtn.setAttribute("aria-label", tr(state, "tag_weight_up"));
            increaseBtn.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                adjustTagWeight(node, tag, 0.05);
            };

            const decreaseBtn = document.createElement("button");
            decreaseBtn.type = "button";
            decreaseBtn.className = "dts-tag-step";
            decreaseBtn.textContent = "-";
            decreaseBtn.title = tr(state, "tag_weight_down");
            decreaseBtn.setAttribute("aria-label", tr(state, "tag_weight_down"));
            decreaseBtn.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                adjustTagWeight(node, tag, -0.05);
            };

            [increaseBtn, decreaseBtn].forEach(btn => {
                ["mousedown", "click", "pointerdown", "dblclick"].forEach(eventName => {
                    btn.addEventListener(eventName, event => event.stopPropagation());
                });
            });

            controls.appendChild(increaseBtn);
            controls.appendChild(decreaseBtn);
            chip.appendChild(controls);
            tagsBox.appendChild(chip);
        });

        card.appendChild(head);
        card.appendChild(tagsBox);
        container.appendChild(card);
    }
}

function renderSelected(node) {
    const state = node.__dtsState;
    const list = state.selectedEl;
    list.innerHTML = "";

    const byCategory = getSelectedByCategory(state);
    const activeCategories = getActiveSelectedCategories(state);

    if (!activeCategories.length) {
        const empty = document.createElement("div");
        empty.className = "dts-empty";
        empty.textContent = tr(state, "empty_no_selected_rows");
        list.appendChild(empty);
        return;
    }

    state.categoryOrder = activeCategories;

    activeCategories.forEach((category, index) => {
        const tags = byCategory[category] || [];

        const item = document.createElement("li");
        item.className = "dts-selected-cat-item";
        item.draggable = true;

        const dragHandle = document.createElement("span");
        dragHandle.className = "dts-drag";
        dragHandle.textContent = "☰";
        dragHandle.title = "Drag category row to reorder";

        const body = document.createElement("div");
        body.className = "dts-selected-body";

        const rowTitle = document.createElement("div");
        rowTitle.className = "dts-selected-title";
        rowTitle.textContent = `${category} (${tags.length})`;

        const rowText = document.createElement("div");
        rowText.className = "dts-selected-line";
        rowText.textContent = tags.length ? tags.join(", ") : tr(state, "empty_selected_line");

        const addWrap = document.createElement("div");
        addWrap.className = "dts-selected-add";
        const addInput = document.createElement("input");
        addInput.className = "dts-input";
        addInput.placeholder = tr(state, "row_add_ph");
        const addMain = document.createElement("div");
        addMain.className = "dts-selected-add-main";
        const suggestPanel = document.createElement("div");
        suggestPanel.className = "dts-selected-suggest";
        let suggestReqId = 0;
        let suggestTimer = null;
        let suggestValues = [];
        let activeSuggestIndex = -1;
        const closeSuggestPanel = () => {
            suggestPanel.classList.remove("open");
            activeSuggestIndex = -1;
        };
        const setActiveSuggestIndex = indexValue => {
            activeSuggestIndex = indexValue;
            const items = suggestPanel.querySelectorAll(".dts-selected-suggest-item");
            items.forEach((el, idx) => {
                if (idx === activeSuggestIndex) {
                    el.classList.add("active");
                    try {
                        el.scrollIntoView({ block: "nearest" });
                    } catch {
                        // older browser fallback
                    }
                } else {
                    el.classList.remove("active");
                }
            });
        };
        const applySuggestionValue = value => {
            const text = String(value || "").trim();
            if (!text) return;
            addInput.value = text;
            closeSuggestPanel();
            addInput.focus();
        };
        const renderSuggestPanel = values => {
            suggestValues = Array.isArray(values) ? values.slice(0, 80) : [];
            suggestPanel.innerHTML = "";
            if (!suggestValues.length) {
                closeSuggestPanel();
                return;
            }
            suggestValues.forEach((value, idx) => {
                const row = document.createElement("div");
                row.className = "dts-selected-suggest-item";
                row.textContent = value;
                row.addEventListener("mouseenter", () => setActiveSuggestIndex(idx));
                row.addEventListener("mousedown", event => {
                    event.preventDefault();
                });
                row.addEventListener("click", () => {
                    applySuggestionValue(value);
                });
                suggestPanel.appendChild(row);
            });
            if (document.activeElement === addInput) {
                suggestPanel.classList.add("open");
            } else {
                closeSuggestPanel();
            }
        };
        const upsertSuggestOption = (set, listValues, value) => {
            const text = String(value || "").trim();
            const key = normalizeTag(text);
            if (!key || set.has(key)) return false;
            set.add(key);
            listValues.push(text);
            return true;
        };
        const rebuildSuggestList = remoteItems => {
            const listValues = [];
            const suggestSet = new Set();
            const { prefixParts, token } = parseTagInputContext(addInput.value);
            const prefix = prefixParts.join(", ");
            const tokenLower = token.toLowerCase();
            const composeWithPrefix = rawTag => {
                const text = String(rawTag || "").trim();
                if (!text) return "";
                return prefix ? `${prefix}, ${text}` : text;
            };
            const localCandidates = [
                ...(state.categories[category] || []),
                ...splitTagText((state.manualCategoryTags || {})[category] || []),
                ...(state.selected || []),
            ];
            for (const candidate of localCandidates) {
                const text = String(candidate || "").trim();
                if (!text) continue;
                if (tokenLower && !text.toLowerCase().includes(tokenLower)) continue;
                upsertSuggestOption(suggestSet, listValues, composeWithPrefix(text));
                if (suggestSet.size >= 120) break;
            }
            for (const item of (remoteItems || [])) {
                const rawName = String(item?.name || "").trim();
                if (!rawName) continue;
                const normalizedTag = rawName.replaceAll("_", " ");
                upsertSuggestOption(suggestSet, listValues, composeWithPrefix(normalizedTag));
                if (suggestSet.size >= 220) break;
            }
            renderSuggestPanel(listValues);
        };
        const requestDanbooruSuggest = async () => {
            const reqId = ++suggestReqId;
            const { token } = parseTagInputContext(addInput.value);
            if (token.length < 2) {
                rebuildSuggestList([]);
                return;
            }
            try {
                const items = await fetchDanbooruAutocompleteItems(token, 20);
                if (reqId !== suggestReqId) return;
                rebuildSuggestList(items);
            } catch {
                if (reqId !== suggestReqId) return;
                rebuildSuggestList([]);
            }
        };
        rebuildSuggestList([]);
        const addBtn = document.createElement("button");
        addBtn.className = "dts-icon";
        addBtn.textContent = tr(state, "row_add_btn");
        addBtn.title = tr(state, "row_add_tags");
        const commitAdd = () => {
            const text = String(addInput.value || "").trim();
            if (!text) return;
            addManualTagsToCategory(node, category, text);
            addInput.value = "";
            closeSuggestPanel();
        };
        addBtn.onclick = commitAdd;
        addInput.addEventListener("input", () => {
            if (!suggestPanel.classList.contains("open")) {
                suggestPanel.classList.add("open");
            }
            if (suggestTimer) clearTimeout(suggestTimer);
            suggestTimer = setTimeout(() => {
                requestDanbooruSuggest();
            }, 140);
        });
        addInput.addEventListener("focus", () => {
            requestDanbooruSuggest();
            if (suggestValues.length) suggestPanel.classList.add("open");
        });
        addInput.addEventListener("blur", () => {
            setTimeout(() => closeSuggestPanel(), 120);
        });
        addInput.addEventListener("keydown", event => {
            if (event.key === "ArrowDown" && suggestValues.length) {
                event.preventDefault();
                const nextIndex = activeSuggestIndex < suggestValues.length - 1 ? activeSuggestIndex + 1 : 0;
                setActiveSuggestIndex(nextIndex);
                suggestPanel.classList.add("open");
                return;
            }
            if (event.key === "ArrowUp" && suggestValues.length) {
                event.preventDefault();
                const nextIndex = activeSuggestIndex > 0 ? activeSuggestIndex - 1 : suggestValues.length - 1;
                setActiveSuggestIndex(nextIndex);
                suggestPanel.classList.add("open");
                return;
            }
            if (event.key === "Escape") {
                closeSuggestPanel();
                return;
            }
            if (event.key === "Enter") {
                if (activeSuggestIndex >= 0 && activeSuggestIndex < suggestValues.length) {
                    event.preventDefault();
                    applySuggestionValue(suggestValues[activeSuggestIndex]);
                    return;
                }
                event.preventDefault();
                commitAdd();
            }
        });
        addMain.appendChild(addInput);
        addMain.appendChild(suggestPanel);
        addWrap.appendChild(addMain);
        addWrap.appendChild(addBtn);

        body.appendChild(rowTitle);
        body.appendChild(rowText);
        body.appendChild(addWrap);

        const actions = document.createElement("div");
        actions.className = "dts-selected-actions";

        const currentWeight = normalizeWeightValue((state.selectedCategoryWeights || {})[category], 1);
        const weightInput = document.createElement("input");
        weightInput.type = "text";
        weightInput.className = "dts-weight-input";
        weightInput.value = formatWeightValue(currentWeight);
        weightInput.placeholder = "1";
        weightInput.title = tr(state, "row_weight_title");
        weightInput.setAttribute("aria-label", tr(state, "row_weight_title"));
        const applyWeight = () => {
            const nextWeight = setCategoryRowWeight(node, category, weightInput.value);
            weightInput.value = formatWeightValue(nextWeight);
        };
        weightInput.addEventListener("input", event => {
            if (event.target.value !== "" && !/^\d*\.?\d{0,2}$/.test(event.target.value)) {
                event.target.value = event.target.value.slice(0, -1);
            }
        });
        weightInput.addEventListener("focus", event => event.target.select());
        weightInput.addEventListener("blur", applyWeight);
        weightInput.addEventListener("keydown", event => {
            event.stopPropagation();
            if (event.key === "Enter") {
                event.preventDefault();
                applyWeight();
                weightInput.blur();
            }
        });
        ["mousedown", "click", "pointerdown"].forEach(eventName => {
            weightInput.addEventListener(eventName, event => event.stopPropagation());
        });

        const upBtn = document.createElement("button");
        upBtn.className = "dts-icon";
        upBtn.textContent = "↑";
        upBtn.title = "Move row up";
        upBtn.onclick = () => {
            if (index <= 0) return;
            moveCategoryOrder(state, index, index - 1);
            syncSelectedWidget(node, false);
            syncSelectedCategoriesWidget(node);
            renderAll(node);
        };

        const downBtn = document.createElement("button");
        downBtn.className = "dts-icon";
        downBtn.textContent = "↓";
        downBtn.title = "Move row down";
        downBtn.onclick = () => {
            if (index >= activeCategories.length - 1) return;
            moveCategoryOrder(state, index, index + 1);
            syncSelectedWidget(node, false);
            syncSelectedCategoriesWidget(node);
            renderAll(node);
        };

        const removeBtn = document.createElement("button");
        removeBtn.className = "dts-icon dts-danger";
        removeBtn.textContent = "x";
        removeBtn.title = "Clear this category";
        removeBtn.onclick = () => removeSelectedCategory(node, category);

        actions.appendChild(weightInput);
        actions.appendChild(upBtn);
        actions.appendChild(downBtn);
        actions.appendChild(removeBtn);

        item.addEventListener("dragstart", event => {
            state.dragIndex = index;
            item.classList.add("dragging");
            event.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragend", () => {
            state.dragIndex = null;
            item.classList.remove("dragging");
            list.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
        });

        item.addEventListener("dragover", event => {
            event.preventDefault();
            item.classList.add("drop-target");
            event.dataTransfer.dropEffect = "move";
        });

        item.addEventListener("dragleave", () => {
            item.classList.remove("drop-target");
        });

        item.addEventListener("drop", event => {
            event.preventDefault();
            item.classList.remove("drop-target");
            const from = state.dragIndex;
            const to = index;
            if (from == null || from === to) return;
            moveCategoryOrder(state, from, to);
            syncSelectedWidget(node, false);
            syncSelectedCategoriesWidget(node);
            renderAll(node);
        });

        item.appendChild(dragHandle);
        item.appendChild(body);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

function renderPreview(node) {
    const state = node.__dtsState;
    const orderedTags = getOrderedSelectedTags(state);
    const outputTags = getOutputTagsForPreview(node);
    const activeCategories = getActiveSelectedCategories(state);
    state.previewEl.textContent = buildPreview(node) || tr(state, "empty_preview");
    state.metaEl.textContent = tr(state, "meta_line", {
        output: outputTags.length,
        selected: orderedTags.length,
        categories: activeCategories.length,
    });
}

function renderAll(node) {
    renderCategories(node);
    renderSelected(node);
    renderPreview(node);
}

function applyLanguage(node, rerender = true) {
    const state = node.__dtsState;
    if (!state) return;

    const refs = state.i18nRefs || {};
    const srefs = state.settingsI18nRefs || {};

    if (refs.titleEl) {
        refs.titleEl.textContent = state.isIntegrated ? tr(state, "title_integrated") : tr(state, "title_selector");
    }
    if (refs.refreshBtn) refs.refreshBtn.textContent = tr(state, "btn_refresh");
    if (refs.settingsBtn) refs.settingsBtn.textContent = tr(state, "btn_settings");
    if (refs.clearBtn) refs.clearBtn.textContent = tr(state, "btn_clear");
    if (refs.leftTitle) refs.leftTitle.textContent = tr(state, "panel_categories");
    if (refs.leftHint) refs.leftHint.textContent = tr(state, "panel_hint_categories");
    if (refs.rightTitle) refs.rightTitle.textContent = tr(state, "panel_selected");
    if (refs.rightHint) refs.rightHint.textContent = tr(state, "panel_hint_selected");
    if (refs.searchInput) refs.searchInput.placeholder = tr(state, "ph_search");
    if (refs.allVisibleBtn) refs.allVisibleBtn.textContent = tr(state, "btn_all_visible");
    if (refs.noneVisibleBtn) refs.noneVisibleBtn.textContent = tr(state, "btn_none_visible");
    if (refs.langBtn) refs.langBtn.textContent = tr(state, "btn_lang");

    if (refs.viewSelect) {
        const current = state.viewMode || "split";
        refs.viewSelect.innerHTML = `
            <option value="split">${tr(state, "view_split")}</option>
            <option value="categories">${tr(state, "view_categories")}</option>
            <option value="selected">${tr(state, "view_selected")}</option>
        `;
        if (["split", "categories", "selected"].includes(current)) {
            refs.viewSelect.value = current;
        }
    }

    if (state.statusEl) {
        state.statusEl.textContent = state.statusKey
            ? tr(state, state.statusKey, state.statusVars || {})
            : tr(state, "status_ready");
    }

    if (srefs.title) srefs.title.textContent = tr(state, "settings_title");
    if (srefs.sorterTitle) srefs.sorterTitle.textContent = tr(state, "settings_sorter");
    if (srefs.outputTitle) srefs.outputTitle.textContent = tr(state, "settings_output");
    if (srefs.excelLabel) srefs.excelLabel.textContent = tr(state, "settings_excel");
    if (srefs.excelReloadBtn) srefs.excelReloadBtn.textContent = tr(state, "settings_excel_reload");
    if (srefs.profileLabel) srefs.profileLabel.textContent = tr(state, "settings_profile");
    if (srefs.profileReloadBtn) srefs.profileReloadBtn.textContent = tr(state, "settings_profile_reload");
    if (srefs.profileLoadBtn) srefs.profileLoadBtn.textContent = tr(state, "settings_profile_load");
    if (srefs.profileSaveBtn) srefs.profileSaveBtn.textContent = tr(state, "settings_profile_save");
    if (srefs.profileNameLabel) srefs.profileNameLabel.textContent = tr(state, "settings_profile_name");
    if (srefs.profileNameInput) srefs.profileNameInput.placeholder = tr(state, "settings_profile_name_ph");
    if (state.settingsControls?.profileSelect) {
        const noneOption = state.settingsControls.profileSelect.querySelector('option[value=""]');
        if (noneOption) noneOption.textContent = tr(state, "settings_profile_none");
    }
    if (srefs.mappingLabel) srefs.mappingLabel.textContent = tr(state, "settings_mapping");
    if (srefs.orderLabel) srefs.orderLabel.textContent = tr(state, "settings_order");
    if (srefs.defaultLabel) srefs.defaultLabel.textContent = tr(state, "settings_default_category");
    if (srefs.regexLabel) srefs.regexLabel.textContent = tr(state, "settings_regex_blacklist");
    if (srefs.blacklistLabel) srefs.blacklistLabel.textContent = tr(state, "settings_tag_blacklist");
    if (srefs.dedupTagsLabel) srefs.dedupTagsLabel.textContent = tr(state, "settings_dedup_before_sort");
    if (srefs.validationLabel) srefs.validationLabel.textContent = tr(state, "settings_validation");
    if (srefs.reloadLabel) srefs.reloadLabel.textContent = tr(state, "settings_reload");
    if (srefs.commentLabel) srefs.commentLabel.textContent = tr(state, "settings_comment");
    if (srefs.prefixLabel) srefs.prefixLabel.textContent = tr(state, "settings_prefix");
    if (srefs.separatorLabel) srefs.separatorLabel.textContent = tr(state, "settings_separator");
    if (srefs.useAllLabel) srefs.useAllLabel.textContent = tr(state, "settings_use_all_empty");
    if (srefs.dedupeLabel) srefs.dedupeLabel.textContent = tr(state, "settings_dedup_selected");
    if (srefs.trailingLabel) srefs.trailingLabel.textContent = tr(state, "settings_keep_trailing");
    if (srefs.sepButtons?.comma) srefs.sepButtons.comma.textContent = tr(state, "settings_sep_comma");
    if (srefs.sepButtons?.newline) srefs.sepButtons.newline.textContent = tr(state, "settings_sep_newline");
    if (srefs.sepButtons?.space) srefs.sepButtons.space.textContent = tr(state, "settings_sep_space");

    if (rerender) {
        renderAll(node);
    }
}
function bindTextInput(input, widget, onChange) {
    let isComposing = false;

    input.addEventListener("compositionstart", () => {
        isComposing = true;
    });

    input.addEventListener("compositionend", () => {
        isComposing = false;
        setWidgetValue(widget, input.value ?? "");
        if (onChange) onChange();
    });

    input.addEventListener("input", event => {
        if (isComposing || event?.isComposing) {
            return;
        }
        setWidgetValue(widget, input.value ?? "");
        if (onChange) onChange();
    });

    input.addEventListener("change", () => {
        if (isComposing) return;
        setWidgetValue(widget, input.value ?? "");
        if (onChange) onChange();
    });
}

function bindBoolInput(input, widget, onChange) {
    input.addEventListener("change", () => {
        setWidgetValue(widget, Boolean(input.checked));
        if (onChange) onChange();
    });
}

function createInputField(labelText, type = "text") {
    const field = document.createElement("div");
    field.className = "dts-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.className = type === "textarea" ? "dts-textarea" : "dts-input";
    if (type !== "textarea") {
        input.type = type;
    }

    field.appendChild(label);
    field.appendChild(input);
    return { field, input, label };
}

function createSelectField(labelText) {
    const field = document.createElement("div");
    field.className = "dts-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const select = document.createElement("select");
    select.className = "dts-input";

    field.appendChild(label);
    field.appendChild(select);
    return { field, select, label };
}

function replaceSelectOptions(select, options, currentValue = "") {
    if (!select) return;
    const normalizedCurrent = String(currentValue || "");
    select.innerHTML = "";

    for (const entry of options) {
        const option = document.createElement("option");
        option.value = String(entry?.value ?? "");
        option.textContent = String(entry?.label ?? option.value);
        select.appendChild(option);
    }

    if (normalizedCurrent) {
        const hasCurrent = options.some(entry => String(entry?.value ?? "") === normalizedCurrent);
        if (!hasCurrent) {
            const custom = document.createElement("option");
            custom.value = normalizedCurrent;
            custom.textContent = normalizedCurrent;
            select.appendChild(custom);
        }
        select.value = normalizedCurrent;
    } else if (select.options.length > 0) {
        select.selectedIndex = 0;
    }
}

function createToggleRow(labelText) {
    const row = document.createElement("label");
    row.className = "dts-toggle";
    const text = document.createElement("span");
    text.textContent = labelText;
    const input = document.createElement("input");
    input.type = "checkbox";
    row.appendChild(text);
    row.appendChild(input);
    return { row, input, text };
}

function createSettingsPanel(node) {
    const state = node.__dtsState;
    const panel = document.createElement("div");
    panel.className = "dts-settings dts-hidden";

    const title = document.createElement("div");
    title.className = "dts-settings-title";
    title.textContent = tr(state, "settings_title");
    panel.appendChild(title);

    const sorterSection = document.createElement("div");
    sorterSection.className = "dts-section";
    const sorterTitle = document.createElement("div");
    sorterTitle.className = "dts-section-title";
    sorterTitle.textContent = tr(state, "settings_sorter");
    sorterSection.appendChild(sorterTitle);

    const excelField = createSelectField(tr(state, "settings_excel"));
    const excelInline = document.createElement("div");
    excelInline.className = "dts-inline";
    const excelReloadBtn = document.createElement("button");
    excelReloadBtn.className = "dts-btn";
    excelReloadBtn.textContent = tr(state, "settings_excel_reload");
    excelInline.appendChild(excelField.select);
    excelInline.appendChild(excelReloadBtn);
    excelField.field.appendChild(excelInline);

    const profileField = createSelectField(tr(state, "settings_profile"));
    const profileInline = document.createElement("div");
    profileInline.className = "dts-inline";
    const profileReloadBtn = document.createElement("button");
    profileReloadBtn.className = "dts-btn";
    profileReloadBtn.textContent = tr(state, "settings_profile_reload");
    profileInline.appendChild(profileField.select);
    profileInline.appendChild(profileReloadBtn);
    profileField.field.appendChild(profileInline);

    const profileNameField = createInputField(tr(state, "settings_profile_name"));
    profileNameField.input.placeholder = tr(state, "settings_profile_name_ph");
    const profileActionInline = document.createElement("div");
    profileActionInline.className = "dts-inline";
    const profileLoadBtn = document.createElement("button");
    profileLoadBtn.className = "dts-btn";
    profileLoadBtn.textContent = tr(state, "settings_profile_load");
    const profileSaveBtn = document.createElement("button");
    profileSaveBtn.className = "dts-btn";
    profileSaveBtn.textContent = tr(state, "settings_profile_save");
    profileActionInline.appendChild(profileNameField.input);
    profileActionInline.appendChild(profileLoadBtn);
    profileActionInline.appendChild(profileSaveBtn);
    profileNameField.field.appendChild(profileActionInline);

    const mapField = createInputField(tr(state, "settings_mapping"), "textarea");
    const orderField = createInputField(tr(state, "settings_order"), "textarea");
    const defaultField = createInputField(tr(state, "settings_default_category"));
    const regexField = createInputField(tr(state, "settings_regex_blacklist"));
    const tagBlacklistField = createInputField(tr(state, "settings_tag_blacklist"), "textarea");

    const dedupTagsRow = createToggleRow(tr(state, "settings_dedup_before_sort"));
    const validationRow = createToggleRow(tr(state, "settings_validation"));
    const reloadRow = createToggleRow(tr(state, "settings_reload"));
    const commentRow = createToggleRow(tr(state, "settings_comment"));

    sorterSection.appendChild(excelField.field);
    sorterSection.appendChild(profileField.field);
    sorterSection.appendChild(profileNameField.field);
    sorterSection.appendChild(mapField.field);
    sorterSection.appendChild(orderField.field);
    sorterSection.appendChild(defaultField.field);
    sorterSection.appendChild(regexField.field);
    sorterSection.appendChild(tagBlacklistField.field);
    sorterSection.appendChild(dedupTagsRow.row);
    sorterSection.appendChild(validationRow.row);
    sorterSection.appendChild(reloadRow.row);
    sorterSection.appendChild(commentRow.row);

    const outputSection = document.createElement("div");
    outputSection.className = "dts-section";
    const outputTitle = document.createElement("div");
    outputTitle.className = "dts-section-title";
    outputTitle.textContent = tr(state, "settings_output");
    outputSection.appendChild(outputTitle);

    const prefixField = createInputField(tr(state, "settings_prefix"), "textarea");
    outputSection.appendChild(prefixField.field);

    const sepField = document.createElement("div");
    sepField.className = "dts-field";
    const sepLabel = document.createElement("label");
    sepLabel.textContent = tr(state, "settings_separator");
    const sepSegment = document.createElement("div");
    sepSegment.className = "dts-segment";
    const sepButtons = {};

    [["comma", "settings_sep_comma"], ["newline", "settings_sep_newline"], ["space", "settings_sep_space"]].forEach(([value, labelKey]) => {
        const btn = document.createElement("button");
        btn.className = "dts-seg";
        btn.dataset.value = value;
        btn.textContent = tr(state, labelKey);
        btn.onclick = () => {
            setWidgetValue(state.separatorWidget, value);
            node.setDirtyCanvas(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
            syncSettingsFromWidgets(node);
            renderPreview(node);
        };
        sepButtons[value] = btn;
        sepSegment.appendChild(btn);
    });

    sepField.appendChild(sepLabel);
    sepField.appendChild(sepSegment);

    const useAllRow = createToggleRow(tr(state, "settings_use_all_empty"));
    const dedupeRow = createToggleRow(tr(state, "settings_dedup_selected"));
    const trailingRow = createToggleRow(tr(state, "settings_keep_trailing"));

    outputSection.appendChild(sepField);
    outputSection.appendChild(useAllRow.row);
    outputSection.appendChild(dedupeRow.row);
    outputSection.appendChild(trailingRow.row);

    panel.appendChild(sorterSection);
    panel.appendChild(outputSection);

    excelField.select.onchange = () => {
        const picked = String(excelField.select.value || "");
        setWidgetValue(state.excelWidget, picked);
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 500);
    };
    excelReloadBtn.onclick = async () => {
        await reloadExcelFileOptions(node, String(getWidgetValue(node, "excel_file", "danbooru_tags.xlsx") || ""), false);
    };
    profileField.select.onchange = () => {
        const picked = String(profileField.select.value || "");
        setWidgetValue(state.profileWidget, picked);
        if (profileNameField.input && !profileNameField.input.matches(":focus")) {
            profileNameField.input.value = picked;
        }
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    };
    profileReloadBtn.onclick = async () => {
        await reloadProfileOptions(node, String(getWidgetValue(node, "config_profile", "") || ""), false);
    };
    profileLoadBtn.onclick = async () => {
        const target = String(profileField.select.value || profileNameField.input.value || "").trim();
        if (!target) return;
        await loadProfileIntoSettings(node, target);
    };
    profileSaveBtn.onclick = async () => {
        const target = String(profileNameField.input.value || profileField.select.value || "").trim();
        if (!target) return;
        await saveProfileFromSettings(node, target);
    };

    bindTextInput(mapField.input, state.mappingWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 900);
    });
    bindTextInput(orderField.input, state.orderWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 900);
    });
    bindTextInput(defaultField.input, state.defaultCategoryWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 500);
    });
    bindTextInput(regexField.input, state.regexWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 500);
    });
    bindTextInput(tagBlacklistField.input, state.tagBlacklistWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 900);
    });

    bindBoolInput(dedupTagsRow.input, state.deduplicateTagsWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 360);
    });
    bindBoolInput(validationRow.input, state.validationWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 360);
    });
    bindBoolInput(reloadRow.input, state.forceReloadWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 360);
    });
    bindBoolInput(commentRow.input, state.commentWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        if (state.isIntegrated) scheduleRefresh(node, 360);
    });

    bindTextInput(prefixField.input, state.prefixWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        renderPreview(node);
    });
    bindBoolInput(useAllRow.input, state.useAllWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        renderPreview(node);
    });
    bindBoolInput(dedupeRow.input, state.dedupeWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        renderPreview(node);
    });
    bindBoolInput(trailingRow.input, state.trailingWidget, () => {
        node.setDirtyCanvas(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        renderPreview(node);
    });

    state.settingsControls = {
        excelSelect: excelField.select,
        excelReloadBtn,
        profileSelect: profileField.select,
        profileReloadBtn,
        profileLoadBtn,
        profileSaveBtn,
        profileNameInput: profileNameField.input,
        mappingInput: mapField.input,
        orderInput: orderField.input,
        defaultInput: defaultField.input,
        regexInput: regexField.input,
        blacklistInput: tagBlacklistField.input,
        dedupTagsToggle: dedupTagsRow.input,
        validationToggle: validationRow.input,
        reloadToggle: reloadRow.input,
        commentToggle: commentRow.input,
        prefixInput: prefixField.input,
        sepButtons,
        useAllToggle: useAllRow.input,
        dedupeToggle: dedupeRow.input,
        trailingToggle: trailingRow.input,
    };

    state.settingsI18nRefs = {
        title,
        sorterTitle,
        outputTitle,
        excelLabel: excelField.label,
        excelReloadBtn,
        profileLabel: profileField.label,
        profileReloadBtn,
        profileLoadBtn,
        profileSaveBtn,
        profileNameLabel: profileNameField.label,
        profileNameInput: profileNameField.input,
        mappingLabel: mapField.label,
        orderLabel: orderField.label,
        defaultLabel: defaultField.label,
        regexLabel: regexField.label,
        blacklistLabel: tagBlacklistField.label,
        dedupTagsLabel: dedupTagsRow.text,
        validationLabel: validationRow.text,
        reloadLabel: reloadRow.text,
        commentLabel: commentRow.text,
        prefixLabel: prefixField.label,
        separatorLabel: sepLabel,
        sepButtons,
        useAllLabel: useAllRow.text,
        dedupeLabel: dedupeRow.text,
        trailingLabel: trailingRow.text,
    };

    return panel;
}

function syncSettingsFromWidgets(node) {
    const state = node.__dtsState;
    if (!state?.settingsControls) return;

    const separator = normalizeSeparatorValue(getWidgetValue(node, "separator", "comma"));
    if (state.separatorWidget && state.separatorWidget.value !== separator) {
        setWidgetValue(state.separatorWidget, separator);
    }
    const excelValue = String(getWidgetValue(node, "excel_file", "danbooru_tags.xlsx") || "");
    if (state.settingsControls.excelSelect) {
        replaceSelectOptions(
            state.settingsControls.excelSelect,
            (state.availableExcelFiles || []).map(name => ({ value: name, label: name })),
            excelValue
        );
    }

    const profileValue = String(getWidgetValue(node, "config_profile", "") || "");
    if (state.settingsControls.profileSelect) {
        const profileOptions = [
            { value: "", label: tr(state, "settings_profile_none") },
            ...(state.availableProfiles || []).map(name => ({ value: name, label: name })),
        ];
        replaceSelectOptions(state.settingsControls.profileSelect, profileOptions, profileValue);
    }
    if (state.settingsControls.profileNameInput && !state.settingsControls.profileNameInput.matches(":focus")) {
        state.settingsControls.profileNameInput.value = profileValue;
    }

    state.settingsControls.mappingInput.value = String(getWidgetValue(node, "category_mapping", "") || "");
    state.settingsControls.orderInput.value = String(getWidgetValue(node, "new_category_order", "") || "");
    state.settingsControls.defaultInput.value = normalizeDefaultCategoryValue(
        getWidgetValue(node, "default_category", "未归类词"),
        "未归类词"
    );
    state.settingsControls.regexInput.value = String(getWidgetValue(node, "regex_blacklist", "") || "");
    state.settingsControls.blacklistInput.value = String(getWidgetValue(node, "tag_blacklist", "") || "");

    state.settingsControls.dedupTagsToggle.checked = normalizeBooleanValue(getWidgetValue(node, "deduplicate_tags", false), false);
    state.settingsControls.validationToggle.checked = normalizeBooleanValue(getWidgetValue(node, "validation", true), true);
    state.settingsControls.reloadToggle.checked = normalizeBooleanValue(getWidgetValue(node, "force_reload", false), false);
    state.settingsControls.commentToggle.checked = normalizeBooleanValue(getWidgetValue(node, "is_comment", true), true);

    state.settingsControls.prefixInput.value = String(getWidgetValue(node, "prefix_text", "") || "");
    state.settingsControls.useAllToggle.checked = normalizeBooleanValue(getWidgetValue(node, "use_all_when_empty", true), true);
    state.settingsControls.dedupeToggle.checked = normalizeBooleanValue(getWidgetValue(node, "deduplicate_selected", true), true);
    state.settingsControls.trailingToggle.checked = normalizeBooleanValue(getWidgetValue(node, "keep_trailing_comma", true), true);

    Object.values(state.settingsControls.sepButtons || {}).forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === separator);
    });
}
app.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DanbooruTagSorterSelectorNode") return;

        const isIntegratedNode = true;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            injectStyle();

            const selectedWidget = getWidget(this, "selected_tags_json");
            const selectedCategoriesWidget = getWidget(this, "selected_categories_json");
            const manualCategoryTagsWidget = getWidget(this, "manual_category_tags_json");
            const selectedCategoryWeightsWidget = getWidget(this, "selected_category_weights_json");
            const selectedTagWeightsWidget = getWidget(this, "selected_tag_weights_json");
            const prefixWidget = getWidget(this, "prefix_text");
            const separatorWidget = getWidget(this, "separator");
            const useAllWidget = getWidget(this, "use_all_when_empty");
            const dedupeWidget = getWidget(this, "deduplicate_selected");
            const trailingWidget = getWidget(this, "keep_trailing_comma");

            const tagsWidget = getWidget(this, "tags");
            const excelWidget = getWidget(this, "excel_file");
            const mappingWidget = getWidget(this, "category_mapping");
            const orderWidget = getWidget(this, "new_category_order");
            const profileWidget = getWidget(this, "config_profile");
            const defaultCategoryWidget = getWidget(this, "default_category");
            const regexWidget = getWidget(this, "regex_blacklist");
            const tagBlacklistWidget = getWidget(this, "tag_blacklist");
            const deduplicateTagsWidget = getWidget(this, "deduplicate_tags");
            const validationWidget = getWidget(this, "validation");
            const forceReloadWidget = getWidget(this, "force_reload");
            const commentWidget = getWidget(this, "is_comment");

            sanitizeLegacyWidgetValues(this);

            [selectedWidget, selectedCategoriesWidget, manualCategoryTagsWidget, selectedCategoryWeightsWidget, selectedTagWeightsWidget, prefixWidget, separatorWidget, useAllWidget, dedupeWidget, trailingWidget].forEach(hideWidget);
            if (isIntegratedNode) {
                [
                    excelWidget,
                    mappingWidget,
                    orderWidget,
                    profileWidget,
                    defaultCategoryWidget,
                    regexWidget,
                    tagBlacklistWidget,
                    deduplicateTagsWidget,
                    validationWidget,
                    forceReloadWidget,
                    commentWidget,
                ].forEach(hideWidget);
                compactTagsInputWidget(tagsWidget);
            }

            const root = document.createElement("div");
            root.className = "dts-root";

            const head = document.createElement("div");
            head.className = "dts-head";

            const headLeft = document.createElement("div");
            const title = document.createElement("div");
            title.className = "dts-title";
            title.textContent = isIntegratedNode ? "Danbooru Tag Toolkit - All-in-One" : "Danbooru Tag Toolkit - Selector";
            const statusEl = document.createElement("div");
            statusEl.className = "dts-status";
            statusEl.textContent = "Ready.";
            headLeft.appendChild(title);
            headLeft.appendChild(statusEl);

            const actionBox = document.createElement("div");
            actionBox.className = "dts-actions";
            const viewSelect = document.createElement("select");
            viewSelect.className = "dts-view-select";
            viewSelect.innerHTML = `
                <option value="split">Split</option>
                <option value="categories">Categories</option>
                <option value="selected">Selected</option>
            `;
            const refreshBtn = document.createElement("button");
            refreshBtn.className = "dts-btn dts-btn-main";
            refreshBtn.textContent = "Refresh";
            const settingsBtn = document.createElement("button");
            settingsBtn.className = "dts-btn";
            settingsBtn.textContent = "Settings";
            const clearBtn = document.createElement("button");
            clearBtn.className = "dts-btn";
            clearBtn.textContent = "Clear";
            const langBtn = document.createElement("button");
            langBtn.className = "dts-btn";
            langBtn.textContent = "EN";
            actionBox.appendChild(viewSelect);
            actionBox.appendChild(langBtn);
            actionBox.appendChild(refreshBtn);
            actionBox.appendChild(settingsBtn);
            actionBox.appendChild(clearBtn);

            head.appendChild(headLeft);
            head.appendChild(actionBox);
            root.appendChild(head);

            const main = document.createElement("div");
            main.className = "dts-main";

            const leftPanel = document.createElement("div");
            leftPanel.className = "dts-panel dts-panel-left";
            const leftHead = document.createElement("div");
            leftHead.className = "dts-panel-head";
            const leftTitle = document.createElement("div");
            leftTitle.className = "dts-panel-title";
            leftTitle.textContent = "Categories";
            const leftHint = document.createElement("div");
            leftHint.className = "dts-panel-hint";
            leftHint.textContent = "Click tags to select.";
            leftHead.appendChild(leftTitle);
            leftHead.appendChild(leftHint);

            const tools = document.createElement("div");
            tools.className = "dts-tools";
            const searchWrap = document.createElement("div");
            searchWrap.className = "dts-search-wrap";
            const searchInput = document.createElement("input");
            searchInput.className = "dts-search";
            searchInput.placeholder = "Search tags/category...";
            const searchClear = document.createElement("button");
            searchClear.className = "dts-search-clear";
            searchClear.textContent = "×";
            searchClear.title = "Clear search";
            searchWrap.appendChild(searchInput);
            searchWrap.appendChild(searchClear);

            const categorySelect = document.createElement("select");
            categorySelect.className = "dts-filter";
            tools.appendChild(searchWrap);
            tools.appendChild(categorySelect);

            const batch = document.createElement("div");
            batch.className = "dts-batch";
            const allVisibleBtn = document.createElement("button");
            allVisibleBtn.className = "dts-btn";
            allVisibleBtn.textContent = "All Visible";
            const noneVisibleBtn = document.createElement("button");
            noneVisibleBtn.className = "dts-btn";
            noneVisibleBtn.textContent = "None Visible";
            batch.appendChild(allVisibleBtn);
            batch.appendChild(noneVisibleBtn);

            const categoriesEl = document.createElement("div");
            categoriesEl.className = "dts-categories";

            leftPanel.appendChild(leftHead);
            leftPanel.appendChild(tools);
            leftPanel.appendChild(batch);
            leftPanel.appendChild(categoriesEl);

            const rightPanel = document.createElement("div");
            rightPanel.className = "dts-panel dts-panel-right";
            const rightHead = document.createElement("div");
            rightHead.className = "dts-panel-head";
            const rightTitle = document.createElement("div");
            rightTitle.className = "dts-panel-title";
            rightTitle.textContent = "Selected Category Rows";
            const rightHint = document.createElement("div");
            rightHint.className = "dts-panel-hint";
            rightHint.textContent = "One row per category, tags joined by commas.";
            rightHead.appendChild(rightTitle);
            rightHead.appendChild(rightHint);

            const selectedEl = document.createElement("ul");
            selectedEl.className = "dts-selected-list";
            const previewEl = document.createElement("div");
            previewEl.className = "dts-preview";
            const metaEl = document.createElement("div");
            metaEl.className = "dts-meta";
            const rightScrollEl = document.createElement("div");
            rightScrollEl.className = "dts-panel-scroll";
            rightScrollEl.appendChild(selectedEl);
            rightScrollEl.appendChild(previewEl);
            rightScrollEl.appendChild(metaEl);

            rightPanel.appendChild(rightHead);
            rightPanel.appendChild(rightScrollEl);

            main.appendChild(leftPanel);
            main.appendChild(rightPanel);
            root.appendChild(main);
            const domWidget = this.addDOMWidget("danbooru_tag_selector_ui", "div", root, { serialize: false });
            stabilizeDomWidgetComputeSize(domWidget);
            // 把 DOM 区域放在靠前位置，避免被隐藏 widget 挤出大量顶部空白
            if (Array.isArray(this.widgets)) {
                const domIndex = this.widgets.indexOf(domWidget);
                if (domIndex >= 0) {
                    this.widgets.splice(domIndex, 1);
                }
                let insertAt = 0;
                if (isIntegratedNode && tagsWidget) {
                    const tagsIndex = this.widgets.indexOf(tagsWidget);
                    if (tagsIndex >= 0) {
                        insertAt = tagsIndex + 1;
                    }
                }
                this.widgets.splice(insertAt, 0, domWidget);
            }

            hideWidgetsByName(this, [
                "selected_tags_json",
                "selected_categories_json",
                "manual_category_tags_json",
                "selected_category_weights_json",
                "selected_tag_weights_json",
                "prefix_text",
                "separator",
                "use_all_when_empty",
                "deduplicate_selected",
                "keep_trailing_comma",
                "excel_file",
                "category_mapping",
                "new_category_order",
                "config_profile",
                "default_category",
                "regex_blacklist",
                "tag_blacklist",
                "deduplicate_tags",
                "validation",
                "force_reload",
                "is_comment",
            ]);

            const minNodeWidth = 560;
            const minNodeHeight = 360;
            const defaultNodeWidth = 680;
            const defaultNodeHeight = 620;
            const currentWidth = Math.floor(this.size?.[0] || 0);
            const currentHeight = Math.floor(this.size?.[1] || 0);
            const looksLegacyTallLayout =
                currentWidth > 0
                && currentHeight > 0
                && currentWidth <= 920
                && currentHeight >= 900;
            if (looksLegacyTallLayout) {
                this.size = [Math.max(minNodeWidth, currentWidth), defaultNodeHeight];
            } else if (currentWidth < minNodeWidth || currentHeight < minNodeHeight) {
                this.size = [
                    Math.max(minNodeWidth, currentWidth || defaultNodeWidth),
                    Math.max(minNodeHeight, currentHeight || defaultNodeHeight),
                ];
            }

            this.__dtsState = {
                isIntegrated: isIntegratedNode,
                rootEl: root,
                domWidgetEl: domWidget?.element || domWidget?.inputEl || null,
                leftPanel,
                rightPanel,
                rightScrollEl,
                viewSelect,
                viewMode: "split",
                compact: false,
                selectedWidget,
                selectedCategoriesWidget,
                manualCategoryTagsWidget,
                selectedCategoryWeightsWidget,
                selectedTagWeightsWidget,
                prefixWidget,
                separatorWidget,
                useAllWidget,
                dedupeWidget,
                trailingWidget,
                tagsWidget,
                excelWidget,
                mappingWidget,
                orderWidget,
                profileWidget,
                defaultCategoryWidget,
                regexWidget,
                tagBlacklistWidget,
                deduplicateTagsWidget,
                validationWidget,
                forceReloadWidget,
                commentWidget,
                availableExcelFiles: [],
                availableProfiles: [],
                categories: {},
                selected: parseSelected(selectedWidget?.value),
                selectedCategories: parseSelected(selectedCategoriesWidget?.value),
                manualCategoryTags: parseManualCategoryTags(manualCategoryTagsWidget?.value),
                selectedCategoryWeights: parseSelectedCategoryWeights(selectedCategoryWeightsWidget?.value),
                selectedTagWeights: parseSelectedTagWeights(selectedTagWeightsWidget?.value),
                categoryOrder: [],
                dragIndex: null,
                refreshTimer: null,
                refreshRequestId: 0,
                lastPreviewSignature: "",
                settingsOpen: false,
                searchText: "",
                categoryFilter: "__all",
                statusEl,
                categorySelect,
                categoriesEl,
                selectedEl,
                previewEl,
                metaEl,
                lang: "en",
                i18nRefs: {
                    titleEl: title,
                    refreshBtn,
                    settingsBtn,
                    clearBtn,
                    langBtn,
                    viewSelect,
                    leftTitle,
                    leftHint,
                    rightTitle,
                    rightHint,
                    searchInput,
                    allVisibleBtn,
                    noneVisibleBtn,
                },
            };

            const settingsPanel = createSettingsPanel(this);
            this.__dtsState.settingsPanel = settingsPanel;
            root.appendChild(settingsPanel);
            syncSettingsFromWidgets(this);
            reloadExcelFileOptions(this, String(getWidgetValue(this, "excel_file", "danbooru_tags.xlsx") || ""), true);
            reloadProfileOptions(this, String(getWidgetValue(this, "config_profile", "") || ""), true);

            refreshBtn.onclick = () => refreshCategories(this);
            settingsBtn.onclick = () => {
                const state = this.__dtsState;
                state.settingsOpen = !state.settingsOpen;
                settingsPanel.classList.toggle("dts-hidden", !state.settingsOpen);
                if (state.settingsOpen) {
                    reloadExcelFileOptions(this, String(getWidgetValue(this, "excel_file", "danbooru_tags.xlsx") || ""), true);
                    reloadProfileOptions(this, String(getWidgetValue(this, "config_profile", "") || ""), true);
                }
            };
            langBtn.onclick = () => {
                const state = this.__dtsState;
                state.lang = state.lang === "zh" ? "en" : "zh";
                applyLanguage(this);
            };
            clearBtn.onclick = () => {
                const state = this.__dtsState;
                state.selected = [];
                state.selectedCategories = [];
                state.manualCategoryTags = {};
                state.selectedCategoryWeights = {};
                state.selectedTagWeights = {};
                state.categoryOrder = [];
                syncManualTagsWidget(this, false);
                syncSelectedWidget(this, false);
                syncSelectedCategoriesWidget(this, false);
                syncSelectedCategoryWeightsWidget(this, false);
                syncSelectedTagWeightsWidget(this);
                renderAll(this);
                if (state.isIntegrated) {
                    scheduleRefresh(this, 120);
                }
            };

            searchInput.oninput = () => {
                this.__dtsState.searchText = searchInput.value || "";
                renderAll(this);
            };
            searchClear.onclick = () => {
                searchInput.value = "";
                this.__dtsState.searchText = "";
                renderAll(this);
            };
            categorySelect.onchange = () => {
                this.__dtsState.categoryFilter = categorySelect.value || "__all";
                renderAll(this);
            };
            viewSelect.onchange = () => {
                const state = this.__dtsState;
                state.viewMode = viewSelect.value || "categories";
                applyPanelVisibility(state);
            };

            allVisibleBtn.onclick = () => addVisibleTags(this);
            noneVisibleBtn.onclick = () => clearVisibleTags(this);

            updateCategoryOrderFromSelection(this.__dtsState);
            scheduleRootLayoutSync(this);
            applyLanguage(this, false);
            renderAll(this);
            refreshCategories(this);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function () {
            const result = onExecuted?.apply(this, arguments);
            if (this.__dtsState) {
                scheduleRootLayoutSync(this, 60);
                refreshCategories(this);
            }
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, [info]);
            const state = this.__dtsState;
            if (!state) return result;

            sanitizeLegacyWidgetValues(this);
            state.selected = parseSelected(state.selectedWidget?.value);
            state.selectedCategories = parseSelected(state.selectedCategoriesWidget?.value);
            state.manualCategoryTags = parseManualCategoryTags(state.manualCategoryTagsWidget?.value);
            state.selectedCategoryWeights = parseSelectedCategoryWeights(state.selectedCategoryWeightsWidget?.value);
            state.selectedTagWeights = parseSelectedTagWeights(state.selectedTagWeightsWidget?.value);
            applyManualTagsToCategories(state);
            syncSettingsFromWidgets(this);
            updateCategoryOrderFromSelection(state);
            scheduleRootLayoutSync(this, 180);
            applyLanguage(this, false);
            renderAll(this);
            return result;
        };

        const onWidgetChanged = nodeType.prototype.onWidgetChanged;
        nodeType.prototype.onWidgetChanged = function (widget, value, oldValue, event) {
            const result = onWidgetChanged?.apply(this, [widget, value, oldValue, event]);
            const state = this.__dtsState;
            if (!state) return result;

            const settingsSet = new Set([
                "selected_tags_json",
                "selected_categories_json",
                "manual_category_tags_json",
                "selected_category_weights_json",
                "selected_tag_weights_json",
                "prefix_text",
                "separator",
                "use_all_when_empty",
                "deduplicate_selected",
                "keep_trailing_comma",
                "excel_file",
                "category_mapping",
                "new_category_order",
                "config_profile",
                "default_category",
                "regex_blacklist",
                "tag_blacklist",
                "deduplicate_tags",
                "validation",
                "force_reload",
                "is_comment",
            ]);

            if (widget?.name && settingsSet.has(widget.name)) {
                if (widget.name === "selected_tags_json") {
                    state.selected = parseSelected(state.selectedWidget?.value);
                    updateCategoryOrderFromSelection(state);
                }
                if (widget.name === "selected_categories_json") {
                    state.selectedCategories = parseSelected(state.selectedCategoriesWidget?.value);
                    updateCategoryOrderFromSelection(state);
                }
                if (widget.name === "manual_category_tags_json") {
                    state.manualCategoryTags = parseManualCategoryTags(state.manualCategoryTagsWidget?.value);
                    applyManualTagsToCategories(state);
                    pruneSelectionByAvailability(state);
                    updateCategoryOrderFromSelection(state);
                }
                if (widget.name === "selected_category_weights_json") {
                    state.selectedCategoryWeights = parseSelectedCategoryWeights(state.selectedCategoryWeightsWidget?.value);
                }
                if (widget.name === "selected_tag_weights_json") {
                    state.selectedTagWeights = parseSelectedTagWeights(state.selectedTagWeightsWidget?.value);
                }
                syncSettingsFromWidgets(this);
                if (widget.name === "selected_tags_json" || widget.name === "selected_categories_json" || widget.name === "manual_category_tags_json" || widget.name === "selected_category_weights_json" || widget.name === "selected_tag_weights_json") {
                    renderAll(this);
                } else {
                    renderPreview(this);
                }

                if (state.isIntegrated && [
                    "excel_file",
                    "category_mapping",
                    "new_category_order",
                    "default_category",
                    "regex_blacklist",
                    "tag_blacklist",
                    "deduplicate_tags",
                    "validation",
                    "force_reload",
                    "is_comment",
                ].includes(widget.name)) {
                    const slowSet = new Set(["category_mapping", "new_category_order", "tag_blacklist"]);
                    scheduleRefresh(this, slowSet.has(widget.name) ? 900 : 500);
                }
                return result;
            }

            if (state.isIntegrated && widget?.name === "tags") {
                scheduleRefresh(this, 500);
            }

            return result;
        };

        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            const result = onResize?.apply(this, [size]);
            if (this.__dtsState) {
                size[0] = Math.max(560, size[0] || 0);
                size[1] = Math.min(MAX_UI_NODE_HEIGHT, Math.max(360, size[1] || 0));
                syncRootLayout(this);
            }
            return result;
        };
    },
});
