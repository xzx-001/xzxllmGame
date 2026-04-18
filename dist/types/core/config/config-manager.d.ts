export declare class ConfigValidationError extends Error {
    errors: string[];
    constructor(errors: string[]);
}
export declare class ConfigManager {
    private config;
    private loaded;
    private configPath?;
    load(filePath?: string): Promise<void>;
    get<T>(key: string, defaultValue?: T): T;
    getAll(): Readonly<Record<string, any>>;
    set<T>(key: string, value: T): void;
    merge(partial: Record<string, any>): void;
    validate(): void;
    getConfigPath(): string | undefined;
    reload(): Promise<void>;
    private ensureLoaded;
    private findConfigFile;
    private parseConfig;
    private loadFromEnv;
    private parseEnvValue;
}
export declare function createConfigManager(): ConfigManager;
//# sourceMappingURL=config-manager.d.ts.map