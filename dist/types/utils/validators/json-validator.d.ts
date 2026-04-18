export interface JSONValidationResult {
    valid: boolean;
    data: unknown | null;
    cleaned: string | null;
    errors: string[];
    errorPosition?: {
        line: number;
        column: number;
        excerpt: string;
    };
    suggestions?: string[];
}
export interface JSONCleanOptions {
    removeComments: boolean;
    removeTrailingCommas: boolean;
    extractMarkdown: boolean;
    allowMultiple: boolean;
    maxDepth: number;
    lenient: boolean;
}
export declare class JSONValidator {
    private logger;
    private options;
    constructor(options?: Partial<JSONCleanOptions>);
    extractMarkdownBlocks(text: string): string[];
    removeComments(json: string): string;
    removeTrailingCommas(json: string): string;
    preprocess(text: string): string;
    validate(text: string): JSONValidationResult;
    private attemptRepair;
    private locateError;
    private generateSuggestions;
    validateAs<T>(text: string, validator?: (data: unknown) => data is T): Omit<JSONValidationResult, 'data'> & {
        data: T | null;
    };
    static isValid(text: string): boolean;
    static extract(text: string): unknown | null;
}
//# sourceMappingURL=json-validator.d.ts.map