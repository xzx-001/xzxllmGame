import { Logger } from '../logger.js';
export class SchemaValidator {
    logger;
    schemas = new Map();
    constructor() {
        this.logger = Logger.create({ context: 'SchemaValidator' });
        this.registerBuiltinSchemas();
    }
    registerBuiltinSchemas() {
        this.registerSchema('position', {
            type: 'object',
            required: ['x', 'y'],
            properties: {
                x: { type: 'number', description: 'X坐标' },
                y: { type: 'number', description: 'Y坐标' }
            }
        });
        this.registerSchema('size', {
            type: 'object',
            required: ['width', 'height'],
            properties: {
                width: { type: 'integer', minimum: 1 },
                height: { type: 'integer', minimum: 1 }
            }
        });
    }
    registerSchema(name, schema) {
        this.schemas.set(name, schema);
        this.logger.debug(`注册 Schema: ${name}`);
    }
    getSchema(name) {
        return this.schemas.get(name);
    }
    validate(data, schema, path = '$') {
        let actualSchema;
        if (typeof schema === 'string') {
            const foundSchema = this.schemas.get(schema);
            if (!foundSchema) {
                return {
                    valid: false,
                    errors: [{
                            path,
                            message: `未知 Schema 引用: ${schema}`,
                            expected: '已注册的 Schema 名称',
                            received: schema
                        }]
                };
            }
            actualSchema = foundSchema;
        }
        else {
            actualSchema = schema;
        }
        const errors = [];
        let validatedData = data;
        try {
            if (actualSchema.type) {
                const typeError = this.validateType(data, actualSchema.type, path);
                if (typeError) {
                    errors.push(typeError);
                }
            }
            if (actualSchema.enum && !actualSchema.enum.includes(data)) {
                errors.push({
                    path,
                    message: `值不在允许的枚举范围内`,
                    received: data,
                    expected: `enum: [${actualSchema.enum.join(', ')}]`,
                    schema: actualSchema
                });
            }
            if (typeof data === 'string') {
                this.validateString(data, actualSchema, path, errors);
            }
            else if (typeof data === 'number') {
                this.validateNumber(data, actualSchema, path, errors);
            }
            else if (Array.isArray(data)) {
                this.validateArray(data, actualSchema, path, errors);
            }
            else if (typeof data === 'object' && data !== null) {
                const objResult = this.validateObject(data, actualSchema, path);
                errors.push(...objResult.errors);
                validatedData = objResult.data;
            }
            if (actualSchema.anyOf) {
                const anyOfValid = actualSchema.anyOf.some(s => this.validate(data, s, path).valid);
                if (!anyOfValid) {
                    errors.push({
                        path,
                        message: '数据不匹配 anyOf 中的任何 Schema',
                        received: data,
                        schema: actualSchema
                    });
                }
            }
        }
        catch (error) {
            errors.push({
                path,
                message: `验证过程异常: ${error instanceof Error ? error.message : String(error)}`,
                received: data
            });
        }
        const valid = errors.length === 0;
        if (!valid) {
            this.logger.debug(`验证失败: ${path}`, { errorCount: errors.length });
        }
        return {
            valid,
            errors,
            data: validatedData
        };
    }
    validateType(data, expectedType, path) {
        const actualType = this.getJSONType(data);
        const allowedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
        if (!allowedTypes.includes(actualType)) {
            return {
                path,
                message: `类型不匹配: 期望 ${allowedTypes.join(' 或 ')}, 实际是 ${actualType}`,
                received: data,
                expected: allowedTypes.join(' | ')
            };
        }
        return null;
    }
    getJSONType(value) {
        if (value === null)
            return 'null';
        if (Array.isArray(value))
            return 'array';
        const jsType = typeof value;
        if (jsType === 'number') {
            return Number.isInteger(value) ? 'integer' : 'number';
        }
        if (jsType === 'string' ||
            jsType === 'boolean' ||
            jsType === 'object') {
            return jsType;
        }
        return 'null';
    }
    validateString(value, schema, path, errors) {
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            errors.push({
                path,
                message: `字符串长度 ${value.length} 小于最小要求 ${schema.minLength}`,
                received: value.length,
                expected: `>= ${schema.minLength}`
            });
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            errors.push({
                path,
                message: `字符串长度 ${value.length} 超过最大限制 ${schema.maxLength}`,
                received: value.length,
                expected: `<= ${schema.maxLength}`
            });
        }
        if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(value)) {
                errors.push({
                    path,
                    message: `字符串不匹配正则模式: ${schema.pattern}`,
                    received: value,
                    expected: `匹配 /${schema.pattern}/`
                });
            }
        }
    }
    validateNumber(value, schema, path, errors) {
        if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push({
                path,
                message: `数值 ${value} 小于最小值 ${schema.minimum}`,
                received: value,
                expected: `>= ${schema.minimum}`
            });
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push({
                path,
                message: `数值 ${value} 超过最大值 ${schema.maximum}`,
                received: value,
                expected: `<= ${schema.maximum}`
            });
        }
    }
    validateArray(value, schema, path, errors) {
        if (schema.minItems !== undefined && value.length < schema.minItems) {
            errors.push({
                path,
                message: `数组长度 ${value.length} 小于最小要求 ${schema.minItems}`,
                received: value.length,
                expected: `>= ${schema.minItems}`
            });
        }
        if (schema.maxItems !== undefined && value.length > schema.maxItems) {
            errors.push({
                path,
                message: `数组长度 ${value.length} 超过最大限制 ${schema.maxItems}`,
                received: value.length,
                expected: `<= ${schema.maxItems}`
            });
        }
        if (schema.items) {
            value.forEach((item, index) => {
                const itemResult = this.validate(item, schema.items, `${path}[${index}]`);
                errors.push(...itemResult.errors);
            });
        }
    }
    validateObject(value, schema, path) {
        const errors = [];
        const result = { ...value };
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in value)) {
                    errors.push({
                        path: `${path}.${field}`,
                        message: `缺少必需字段: ${field}`,
                        expected: '必需',
                        received: 'undefined'
                    });
                }
            }
        }
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in value) {
                    const propResult = this.validate(value[key], propSchema, `${path}.${key}`);
                    errors.push(...propResult.errors);
                    result[key] = propResult.data;
                }
                else if (propSchema.default !== undefined) {
                    result[key] = propSchema.default;
                }
            }
        }
        const definedKeys = new Set([
            ...(schema.required || []),
            ...(schema.properties ? Object.keys(schema.properties) : [])
        ]);
        const actualKeys = Object.keys(value);
        const extraKeys = actualKeys.filter(k => !definedKeys.has(k));
        if (extraKeys.length > 0) {
            if (schema.additionalProperties === false) {
                for (const key of extraKeys) {
                    errors.push({
                        path: `${path}.${key}`,
                        message: `不允许的额外属性: ${key}`,
                        received: key,
                        expected: '已定义的属性'
                    });
                }
            }
            else if (typeof schema.additionalProperties === 'object') {
                for (const key of extraKeys) {
                    const extraResult = this.validate(value[key], schema.additionalProperties, `${path}.${key}`);
                    errors.push(...extraResult.errors);
                }
            }
        }
        return { errors, data: result };
    }
    validateBatch(items, schema) {
        return items.map((item, index) => ({
            index,
            ...this.validate(item, schema, `$[${index}]`)
        }));
    }
    createTypeGuard(schema) {
        return (data) => {
            return this.validate(data, schema).valid;
        };
    }
    formatErrors(result) {
        if (result.valid)
            return '验证通过';
        return result.errors.map(e => `[${e.path}] ${e.message}` +
            (e.received !== undefined ? ` (收到: ${JSON.stringify(e.received)})` : '')).join('\n');
    }
}
export const LevelStructureSchema = {
    type: 'object',
    required: ['metadata', 'baseMap'],
    properties: {
        metadata: {
            type: 'object',
            required: ['levelId', 'version'],
            properties: {
                levelId: { type: 'string', pattern: '^[A-Z0-9]+$' },
                version: { type: 'string' },
                difficulty: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    default: []
                }
            }
        },
        baseMap: { $ref: 'size' },
        miniGames: {
            type: 'array',
            items: {
                type: 'object',
                required: ['type', 'position'],
                properties: {
                    type: {
                        type: 'string',
                        enum: ['PUSHBOX', 'LASER', 'CIRCUIT', 'RIDDLE', 'SLIDING']
                    },
                    position: { $ref: 'position' },
                    difficulty: { type: 'number', minimum: 0, maximum: 1 }
                }
            },
            default: []
        }
    }
};
//# sourceMappingURL=schema-validator.js.map