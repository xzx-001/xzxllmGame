export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
export interface JSONSchema {
    type?: JSONSchemaType | JSONSchemaType[];
    required?: string[];
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema;
    enum?: unknown[];
    pattern?: string;
    minimum?: number;
    minLength?: number;
    minItems?: number;
    maximum?: number;
    maxLength?: number;
    maxItems?: number;
    default?: unknown;
    description?: string;
    anyOf?: JSONSchema[];
    $ref?: string;
    additionalProperties?: boolean | JSONSchema;
}
export interface ValidationError {
    path: string;
    message: string;
    received?: unknown;
    expected?: string;
    schema?: JSONSchema;
}
export interface SchemaValidationResult {
    valid: boolean;
    errors: ValidationError[];
    data?: unknown;
}
export declare class SchemaValidator {
    private logger;
    private schemas;
    constructor();
    private registerBuiltinSchemas;
    registerSchema(name: string, schema: JSONSchema): void;
    getSchema(name: string): JSONSchema | undefined;
    validate(data: unknown, schema: JSONSchema | string, path?: string): SchemaValidationResult;
    private validateType;
    private getJSONType;
    private validateString;
    private validateNumber;
    private validateArray;
    private validateObject;
    validateBatch(items: unknown[], schema: JSONSchema | string): Array<SchemaValidationResult & {
        index: number;
    }>;
    createTypeGuard<T>(schema: JSONSchema | string): (data: unknown) => data is T;
    formatErrors(result: SchemaValidationResult): string;
}
export declare const LevelStructureSchema: JSONSchema;
//# sourceMappingURL=schema-validator.d.ts.map