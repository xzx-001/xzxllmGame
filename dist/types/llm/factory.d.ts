import { ILLMProvider, LLMConfig } from './types.js';
type ProviderConstructor = new (config: LLMConfig) => ILLMProvider;
export declare class LLMProviderFactory {
    private static providers;
    static createProvider(config: LLMConfig): ILLMProvider;
    static registerProvider(type: string, providerClass: ProviderConstructor): void;
    static getAvailableProviders(): string[];
    static isRegistered(type: string): boolean;
    private static adjustConfig;
}
export declare function createLLMProvider(config: LLMConfig): Promise<ILLMProvider>;
export {};
//# sourceMappingURL=factory.d.ts.map