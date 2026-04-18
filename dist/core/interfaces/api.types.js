export var EngineEvent;
(function (EngineEvent) {
    EngineEvent["INITIALIZED"] = "initialized";
    EngineEvent["DISPOSING"] = "disposing";
    EngineEvent["DISPOSED"] = "disposed";
    EngineEvent["GENERATION_STARTED"] = "generation:started";
    EngineEvent["GENERATION_PROGRESS"] = "generation:progress";
    EngineEvent["LEVEL_GENERATED"] = "level:generated";
    EngineEvent["LEVEL_CONSUMED"] = "level:consumed";
    EngineEvent["PROFILE_UPDATED"] = "profile:updated";
    EngineEvent["NARRATIVE_CHANGED"] = "narrative:changed";
    EngineEvent["FEEDBACK_RECEIVED"] = "feedback:received";
    EngineEvent["ANALYSIS_COMPLETED"] = "analysis:completed";
    EngineEvent["ERROR"] = "error";
    EngineEvent["CONFIG_CHANGED"] = "config:changed";
    EngineEvent["HEALTH_STATUS_CHANGED"] = "health:changed";
    EngineEvent["LLM_STATUS_CHANGED"] = "llm:status_changed";
    EngineEvent["STORAGE_STATUS_CHANGED"] = "storage:status_changed";
})(EngineEvent || (EngineEvent = {}));
//# sourceMappingURL=api.types.js.map