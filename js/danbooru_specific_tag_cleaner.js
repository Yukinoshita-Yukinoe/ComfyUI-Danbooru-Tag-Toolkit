import { app } from "../../scripts/app.js";

const EXT_NAME = "DanbooruTagToolkit.SpecificCleanerAppearance";
const NODE_NAME = "DanbooruTagSpecificCleanerNode";
const TITLE_COLOR = "#335";
const BODY_COLOR = "#3f5159";

app.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            this.color = TITLE_COLOR;
            this.bgcolor = BODY_COLOR;
            return result;
        };
    },
});
