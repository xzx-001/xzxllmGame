// src/types/global.d.ts
/**
 * 全局类型声明
 * 用于声明第三方模块或全局变量
 */

// 声明 node-llama-cpp 模块（因为它可能没有类型定义）
declare module 'node-llama-cpp' {
  export function getLlama(options?: any): Promise<any>;
  export class LlamaModel {
    constructor(options: any);
    createContext(options?: any): Promise<any>;
  }
  export class LlamaContext {
    getSequence(): any;
    dispose(): void;
  }
  export class LlamaChatSession {
    constructor(options: any);
    prompt(prompt: string, options?: any): Promise<string>;
    dispose(): void;
  }
  export class LlamaChat {
    constructor(options: any);
    prompt(prompt: string, options?: any): Promise<string>;
    dispose(): void;
  }
}

// 声明 better-sqlite3
declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string, options?: any);
    prepare(sql: string): any;
    exec(sql: string): void;
    transaction(fn: Function): Function;
    pragma(pragma: string): any;
    close(): void;
  }
  export = Database;
}

// 声明 yaml 模块（如果没有 @types/yaml）
declare module 'js-yaml' {
  export function load(input: string): any;
  export function dump(obj: any): string;
}

// 扩展 NodeJS 命名空间
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    LLM_PROVIDER?: string;
    LLM_MODEL?: string;
    OPENAI_API_KEY?: string;
    XZXLLM_CONFIG?: string;
    [key: string]: string | undefined;
  }
}

// 扩展 ImportMeta（ES 模块的 __dirname 替代方案）
interface ImportMeta {
  url: string;
  dirname?: string;
  filename?: string;
}

// 全局工具类型
declare type Nullable<T> = T | null;
declare type Optional<T> = T | undefined;
declare type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};