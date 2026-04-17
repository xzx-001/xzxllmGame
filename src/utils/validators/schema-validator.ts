// src/utils/validators/schema-validator.ts
/**
 * @fileoverview JSON Schema 结构验证器
 * 
 * 提供基于 JSON Schema 的数据结构验证，用于验证：
 * - 关卡数据结构（LevelStructure）
 * - 小游戏配置（MiniGameZone）
 * - 对话树结构（DialogueNode）
 * 
 * 本模块实现了轻量级 Schema 验证，支持常用关键字：
 * - type, required, properties, items, enum, pattern
 * - 嵌套对象和数组验证
 * - 自定义错误信息
 * 
 * 注意：这是一个简化实现。生产环境建议使用 Ajv 或 zod 库。
 * 
 * @module utils/validators/schema-validator
 */

import { Logger } from '../logger.js';

/**
 * Schema 类型定义
 */
export type JSONSchemaType = 
  | 'string' 
  | 'number' 
  | 'integer' 
  | 'boolean' 
  | 'object' 
  | 'array' 
  | 'null';

/**
 * JSON Schema 定义（简化版）
 */
export interface JSONSchema {
  /** 类型约束 */
  type?: JSONSchemaType | JSONSchemaType[];
  /** 必需字段列表 */
  required?: string[];
  /** 对象属性定义 */
  properties?: Record<string, JSONSchema>;
  /** 数组元素定义 */
  items?: JSONSchema;
  /** 枚举值 */
  enum?: unknown[];
  /** 字符串正则模式 */
  pattern?: string;
  /** 最小值（数字）或最小长度（字符串/数组） */
  minimum?: number;
  minLength?: number;
  minItems?: number;
  /** 最大值或最大长度 */
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  /** 默认值 */
  default?: unknown;
  /** 字段描述（用于错误提示） */
  description?: string;
  /** 嵌套验证（anyOf, oneOf 简化版） */
  anyOf?: JSONSchema[];
  /** 引用其他 Schema */
  $ref?: string;
  /** 允许额外属性（对象） */
  additionalProperties?: boolean | JSONSchema;
}

/**
 * 验证错误详情
 */
export interface ValidationError {
  /** 错误字段路径（如 'level.miniGames[0].type'） */
  path: string;
  /** 错误消息 */
  message: string;
  /** 实际接收到的值 */
  received?: unknown;
  /** 期望值/约束 */
  expected?: string;
  /** 使用的 Schema 部分 */
  schema?: JSONSchema;
}

/**
 * 验证结果
 */
export interface SchemaValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
  /** 清理后的数据（应用默认值等） */
  data?: unknown;
}

/**
 * Schema 验证器类
 * 
 * 实现 JSON Schema Draft-07 的子集，用于运行时数据验证。
 * 特别适合验证 LLM 生成的游戏内容结构是否符合预期。
 */
export class SchemaValidator {
  private logger: Logger;
  /** 已注册的 Schema 定义（用于 $ref 引用） */
  private schemas: Map<string, JSONSchema> = new Map();

  /**
   * 创建验证器实例
   */
  constructor() {
    this.logger = Logger.create({ context: 'SchemaValidator' });
    
    // 预注册常用 Schema
    this.registerBuiltinSchemas();
  }

  /**
   * 注册内置 Schema（关卡、小游戏等）
   */
  private registerBuiltinSchemas(): void {
    // 位置定义
    this.registerSchema('position', {
      type: 'object',
      required: ['x', 'y'],
      properties: {
        x: { type: 'number', description: 'X坐标' },
        y: { type: 'number', description: 'Y坐标' }
      }
    });

    // 尺寸定义
    this.registerSchema('size', {
      type: 'object',
      required: ['width', 'height'],
      properties: {
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 }
      }
    });
  }

  /**
   * 注册自定义 Schema
   * 
   * @param name - Schema 标识名（用于 $ref）
   * @param schema - Schema 定义
   */
  public registerSchema(name: string, schema: JSONSchema): void {
    this.schemas.set(name, schema);
    this.logger.debug(`注册 Schema: ${name}`);
  }

  /**
   * 获取已注册的 Schema
   */
  public getSchema(name: string): JSONSchema | undefined {
    return this.schemas.get(name);
  }

  /**
   * 主验证方法
   * 
   * @param data - 要验证的数据
   * @param schema - Schema 定义或引用名
   * @param path - 当前路径（递归使用）
   * @returns 验证结果
   */
  public validate(
    data: unknown, 
    schema: JSONSchema | string,
    path: string = '$'
  ): SchemaValidationResult {
    // 如果 schema 是字符串，视为 $ref 引用
    let actualSchema: JSONSchema;
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
    } else {
      actualSchema = schema;
    }

    const errors: ValidationError[] = [];
    let validatedData = data;

    try {
      // 类型验证
      if (actualSchema.type) {
        const typeError = this.validateType(data, actualSchema.type, path);
        if (typeError) {
          errors.push(typeError);
          // 类型错误可能导致后续验证无意义，但继续验证以收集所有错误
        }
      }

      // 枚举验证
      if (actualSchema.enum && !actualSchema.enum.includes(data)) {
        errors.push({
          path,
          message: `值不在允许的枚举范围内`,
          received: data,
          expected: `enum: [${actualSchema.enum.join(', ')}]`,
          schema: actualSchema
        });
      }

      // 根据类型进行特定验证
      if (typeof data === 'string') {
        this.validateString(data, actualSchema, path, errors);
      } else if (typeof data === 'number') {
        this.validateNumber(data, actualSchema, path, errors);
      } else if (Array.isArray(data)) {
        this.validateArray(data, actualSchema, path, errors);
      } else if (typeof data === 'object' && data !== null) {
        const objResult = this.validateObject(data as Record<string, unknown>, actualSchema, path);
        errors.push(...objResult.errors);
        validatedData = objResult.data;
      }

      // anyOf 验证（任一通过即可）
      if (actualSchema.anyOf) {
        const anyOfValid = actualSchema.anyOf.some(s => 
          this.validate(data, s, path).valid
        );
        if (!anyOfValid) {
          errors.push({
            path,
            message: '数据不匹配 anyOf 中的任何 Schema',
            received: data,
            schema: actualSchema
          });
        }
      }

    } catch (error) {
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

  /**
   * 类型验证
   */
  private validateType(
    data: unknown, 
    expectedType: JSONSchemaType | JSONSchemaType[],
    path: string
  ): ValidationError | null {
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

  /**
   * 获取值的 JSON Schema 类型
   */
  private getJSONType(value: unknown): JSONSchemaType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    
    const jsType = typeof value;
    if (jsType === 'number') {
      // 区分整数和浮点数
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    
    // TypeScript 类型收窄
    if (
      jsType === 'string' || 
      jsType === 'boolean' || 
      jsType === 'object'
    ) {
      return jsType;
    }
    
    return 'null'; // 函数、undefined 等映射为 null
  }

  /**
   * 字符串验证
   */
  private validateString(
    value: string,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
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

  /**
   * 数值验证
   */
  private validateNumber(
    value: number,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
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

  /**
   * 数组验证
   */
  private validateArray(
    value: unknown[],
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
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

    // 验证数组元素
    if (schema.items) {
      value.forEach((item, index) => {
        const itemResult = this.validate(item, schema.items!, `${path}[${index}]`);
        errors.push(...itemResult.errors);
      });
    }
  }

  /**
   * 对象验证
   * 
   * 处理 properties、required、additionalProperties
   */
  private validateObject(
    value: Record<string, unknown>,
    schema: JSONSchema,
    path: string
  ): { errors: ValidationError[]; data: Record<string, unknown> } {
    const errors: ValidationError[] = [];
    const result: Record<string, unknown> = { ...value }; // 复制以应用默认值

    // 检查必需字段
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

    // 验证定义的属性
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          const propResult = this.validate(value[key], propSchema, `${path}.${key}`);
          errors.push(...propResult.errors);
          result[key] = propResult.data;
        } else if (propSchema.default !== undefined) {
          // 应用默认值
          result[key] = propSchema.default;
        }
      }
    }

    // 检查额外属性
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
      } else if (typeof schema.additionalProperties === 'object') {
        // 额外属性必须符合指定 Schema
        for (const key of extraKeys) {
          const extraResult = this.validate(
            value[key], 
            schema.additionalProperties, 
            `${path}.${key}`
          );
          errors.push(...extraResult.errors);
        }
      }
      // additionalProperties === true 或 undefined：允许任意额外属性
    }

    return { errors, data: result };
  }

  /**
   * 批量验证
   * 
   * @param items - 数据数组
   * @param schema - Schema
   * @returns 批量结果
   */
  public validateBatch(
    items: unknown[],
    schema: JSONSchema | string
  ): Array<SchemaValidationResult & { index: number }> {
    return items.map((item, index) => ({
      index,
      ...this.validate(item, schema, `$[${index}]`)
    }));
  }

  /**
   * 创建类型守卫函数
   * 
   * @param schema - 验证通过的 Schema
   * @returns 类型守卫函数
   */
  public createTypeGuard<T>(schema: JSONSchema | string): (data: unknown) => data is T {
    return (data: unknown): data is T => {
      return this.validate(data, schema).valid;
    };
  }

  /**
   * 清理错误信息（格式化输出）
   * 
   * @param result - 验证结果
   * @returns 人类可读的错误描述
   */
  public formatErrors(result: SchemaValidationResult): string {
    if (result.valid) return '验证通过';
    
    return result.errors.map(e => 
      `[${e.path}] ${e.message}` + 
      (e.received !== undefined ? ` (收到: ${JSON.stringify(e.received)})` : '')
    ).join('\n');
  }
}

// 导出预定义的关卡 Schema（用于快速验证）
export const LevelStructureSchema: JSONSchema = {
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