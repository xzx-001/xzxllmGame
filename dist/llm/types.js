export var LLMErrorType;
(function (LLMErrorType) {
    LLMErrorType["NETWORK_ERROR"] = "network_error";
    LLMErrorType["TIMEOUT"] = "timeout";
    LLMErrorType["RATE_LIMIT"] = "rate_limit";
    LLMErrorType["AUTHENTICATION"] = "authentication";
    LLMErrorType["MODEL_NOT_FOUND"] = "model_not_found";
    LLMErrorType["CONTENT_FILTER"] = "content_filter";
    LLMErrorType["CONTEXT_LENGTH_EXCEEDED"] = "context_length";
    LLMErrorType["SERVER_ERROR"] = "server_error";
    LLMErrorType["UNKNOWN"] = "unknown";
})(LLMErrorType || (LLMErrorType = {}));
export class LLMError extends Error {
    type;
    provider;
    statusCode;
    retryable;
    constructor(message, type, provider, statusCode, retryable = false) {
        super(message);
        this.type = type;
        this.provider = provider;
        this.statusCode = statusCode;
        this.retryable = retryable;
        this.name = 'LLMError';
    }
}
//# sourceMappingURL=types.js.map