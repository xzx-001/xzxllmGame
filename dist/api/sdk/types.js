export var SDKEvent;
(function (SDKEvent) {
    SDKEvent["CONNECTED"] = "connected";
    SDKEvent["DISCONNECTED"] = "disconnected";
    SDKEvent["ERROR"] = "error";
    SDKEvent["GENERATION_STARTED"] = "generation:started";
    SDKEvent["GENERATION_PROGRESS"] = "generation:progress";
    SDKEvent["LEVEL_READY"] = "level:ready";
    SDKEvent["DIALOGUE_RECEIVED"] = "dialogue:received";
    SDKEvent["PROFILE_UPDATED"] = "profile:updated";
    SDKEvent["CONFIG_CHANGED"] = "config:changed";
})(SDKEvent || (SDKEvent = {}));
export var WebSocketState;
(function (WebSocketState) {
    WebSocketState[WebSocketState["CONNECTING"] = 0] = "CONNECTING";
    WebSocketState[WebSocketState["OPEN"] = 1] = "OPEN";
    WebSocketState[WebSocketState["CLOSING"] = 2] = "CLOSING";
    WebSocketState[WebSocketState["CLOSED"] = 3] = "CLOSED";
})(WebSocketState || (WebSocketState = {}));
//# sourceMappingURL=types.js.map