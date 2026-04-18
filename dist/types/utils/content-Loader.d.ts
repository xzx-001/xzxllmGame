interface YamlLib {
    load(content: string): unknown;
    dump(obj: unknown): string;
}
export declare enum ContentFormat {
    JSON = "json",
    YAML = "yaml",
    JSON5 = "json5",
    UNKNOWN = "unknown"
}
export interface ContentLoaderOptions {
    basePath: string;
    enableHotReload: boolean;
    hotReloadIntervalMs: number;
    enableCache: boolean;
    cacheTTLMs: number;
    recursive: boolean;
    encoding: BufferEncoding;
    yamlParser?: YamlLib;
    json5Parser?: {
        parse(text: string): unknown;
    };
}
export interface LoadResult<T> {
    success: boolean;
    data: T | null;
    error?: string;
    path: string;
    format: ContentFormat;
    loadTimeMs: number;
    fromCache: boolean;
}
export interface ContentChangeEvent {
    path: string;
    type: 'changed' | 'deleted';
    previousMtime?: number;
}
export declare class ContentLoader {
    private options;
    private logger;
    private cache;
    private watchers;
    private changeCallbacks;
    private pollTimer;
    private fileMtimes;
    private stats;
    constructor(options?: Partial<ContentLoaderOptions>);
    private resolveDefaultBasePath;
    private detectFormat;
    private parseContent;
    private resolvePath;
    private isCacheValid;
    load<T = unknown>(filePath: string): Promise<LoadResult<T>>;
    loadSync<T = unknown>(filePath: string): LoadResult<T>;
    loadDirectory<T = unknown>(dirPath: string, pattern?: string): Promise<Map<string, T>>;
    private watchFile;
    private startHotReload;
    private handleFileChange;
    onChange(callback: (event: ContentChangeEvent) => void): () => void;
    refreshAll(): Promise<Map<string, LoadResult<unknown>>>;
    clearCache(): void;
    dispose(): void;
    getStats(): typeof this.stats;
    getCacheStatus(): Array<{
        path: string;
        age: number;
        hits: number;
    }>;
}
export {};
//# sourceMappingURL=content-Loader.d.ts.map