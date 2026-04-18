import { readFileSync, existsSync, watch, statSync, readdirSync } from 'fs';
import { resolve, join, extname, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { Logger, LogLevel } from './logger.js';
export var ContentFormat;
(function (ContentFormat) {
    ContentFormat["JSON"] = "json";
    ContentFormat["YAML"] = "yaml";
    ContentFormat["JSON5"] = "json5";
    ContentFormat["UNKNOWN"] = "unknown";
})(ContentFormat || (ContentFormat = {}));
export class ContentLoader {
    options;
    logger;
    cache = new Map();
    watchers = new Map();
    changeCallbacks = [];
    pollTimer = null;
    fileMtimes = new Map();
    stats = {
        totalLoads: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0
    };
    constructor(options) {
        this.options = {
            basePath: this.resolveDefaultBasePath(),
            enableHotReload: false,
            hotReloadIntervalMs: 1000,
            enableCache: true,
            cacheTTLMs: 0,
            recursive: true,
            encoding: 'utf-8',
            ...options
        };
        this.logger = Logger.create({
            context: 'ContentLoader',
            level: LogLevel.INFO
        });
        this.logger.info('ContentLoader 初始化完成', {
            basePath: this.options.basePath,
            hotReload: this.options.enableHotReload,
            cacheEnabled: this.options.enableCache
        });
        if (this.options.enableHotReload) {
            this.startHotReload();
        }
    }
    resolveDefaultBasePath() {
        try {
            const currentFilePath = fileURLToPath(import.meta.url);
            return resolve(dirname(currentFilePath), '..', '..', 'content');
        }
        catch {
            return resolve(process.cwd(), 'content');
        }
    }
    detectFormat(filePath) {
        const ext = extname(filePath).toLowerCase();
        switch (ext) {
            case '.json':
                return ContentFormat.JSON;
            case '.yaml':
            case '.yml':
                return ContentFormat.YAML;
            case '.json5':
                return ContentFormat.JSON5;
            default:
                return ContentFormat.UNKNOWN;
        }
    }
    parseContent(content, format, filePath) {
        try {
            switch (format) {
                case ContentFormat.JSON:
                    return JSON.parse(content);
                case ContentFormat.YAML:
                    if (!this.options.yamlParser) {
                        throw new Error('加载YAML文件需要提供 yamlParser 选项（如 js-yaml 实例）');
                    }
                    return this.options.yamlParser.load(content);
                case ContentFormat.JSON5:
                    if (!this.options.json5Parser) {
                        throw new Error('加载JSON5文件需要提供 json5Parser 选项');
                    }
                    return this.options.json5Parser.parse(content);
                default:
                    try {
                        return JSON.parse(content);
                    }
                    catch {
                        return content;
                    }
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`解析文件 ${filePath} 失败: ${errorMsg}`);
        }
    }
    resolvePath(relativePath) {
        if (resolve(relativePath) === relativePath) {
            return relativePath;
        }
        return join(this.options.basePath, relativePath);
    }
    isCacheValid(entry) {
        if (!this.options.enableCache) {
            return false;
        }
        if (this.options.cacheTTLMs === 0) {
            return true;
        }
        const now = Date.now();
        return (now - entry.loadedAt) < this.options.cacheTTLMs;
    }
    async load(filePath) {
        const startTime = Date.now();
        const absolutePath = this.resolvePath(filePath);
        if (!existsSync(absolutePath)) {
            this.stats.errors++;
            return {
                success: false,
                data: null,
                error: `文件不存在: ${absolutePath}`,
                path: absolutePath,
                format: ContentFormat.UNKNOWN,
                loadTimeMs: Date.now() - startTime,
                fromCache: false
            };
        }
        try {
            const stats = statSync(absolutePath);
            const mtime = stats.mtimeMs;
            const cached = this.cache.get(absolutePath);
            if (cached && cached.mtime === mtime && this.isCacheValid(cached)) {
                this.stats.cacheHits++;
                this.stats.totalLoads++;
                cached.accessCount++;
                this.logger.debug(`缓存命中: ${filePath}`, {
                    hitCount: cached.accessCount
                });
                return {
                    success: true,
                    data: cached.data,
                    path: absolutePath,
                    format: this.detectFormat(absolutePath),
                    loadTimeMs: Date.now() - startTime,
                    fromCache: true
                };
            }
            this.stats.cacheMisses++;
            const content = readFileSync(absolutePath, this.options.encoding);
            const format = this.detectFormat(absolutePath);
            const data = this.parseContent(content, format, absolutePath);
            if (this.options.enableCache) {
                this.cache.set(absolutePath, {
                    data,
                    loadedAt: Date.now(),
                    mtime,
                    accessCount: 1
                });
            }
            if (this.options.enableHotReload && !this.watchers.has(absolutePath)) {
                this.watchFile(absolutePath);
            }
            this.stats.totalLoads++;
            const loadTime = Date.now() - startTime;
            this.logger.debug(`文件加载成功: ${filePath}`, {
                format,
                size: content.length,
                loadTimeMs: loadTime
            });
            return {
                success: true,
                data,
                path: absolutePath,
                format,
                loadTimeMs: loadTime,
                fromCache: false
            };
        }
        catch (error) {
            this.stats.errors++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`加载文件失败: ${filePath}`, { error: errorMsg });
            return {
                success: false,
                data: null,
                error: errorMsg,
                path: absolutePath,
                format: ContentFormat.UNKNOWN,
                loadTimeMs: Date.now() - startTime,
                fromCache: false
            };
        }
    }
    loadSync(filePath) {
        let result;
        this.load(filePath).then(r => { result = r; });
        return result;
    }
    async loadDirectory(dirPath, pattern) {
        const absoluteDir = this.resolvePath(dirPath);
        const results = new Map();
        if (!existsSync(absoluteDir)) {
            this.logger.warn(`目录不存在: ${absoluteDir}`);
            return results;
        }
        try {
            const entries = readdirSync(absoluteDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(absoluteDir, entry.name);
                if (entry.isDirectory() && this.options.recursive) {
                    const subResults = await this.loadDirectory(relative(this.options.basePath, fullPath), pattern);
                    for (const [key, value] of subResults) {
                        results.set(`${entry.name}/${key}`, value);
                    }
                }
                else if (entry.isFile()) {
                    if (pattern && !entry.name.endsWith(pattern)) {
                        continue;
                    }
                    const result = await this.load(relative(this.options.basePath, fullPath));
                    if (result.success && result.data !== null) {
                        const key = entry.name.replace(extname(entry.name), '');
                        results.set(key, result.data);
                    }
                }
            }
            this.logger.info(`目录加载完成: ${dirPath}`, {
                fileCount: results.size
            });
        }
        catch (error) {
            this.logger.error(`加载目录失败: ${dirPath}`, { error });
        }
        return results;
    }
    watchFile(filePath) {
        try {
            const watcher = watch(filePath, { persistent: false }, (eventType) => {
                if (eventType === 'change') {
                    this.handleFileChange(filePath, 'changed');
                }
                else if (eventType === 'rename') {
                    if (!existsSync(filePath)) {
                        this.handleFileChange(filePath, 'deleted');
                    }
                }
            });
            this.watchers.set(filePath, watcher);
            try {
                const stats = statSync(filePath);
                this.fileMtimes.set(filePath, stats.mtimeMs);
            }
            catch {
            }
        }
        catch (error) {
            this.logger.warn(`无法监听文件: ${filePath}，将使用轮询`, { error });
        }
    }
    startHotReload() {
        this.pollTimer = setInterval(() => {
            for (const [filePath, lastMtime] of this.fileMtimes) {
                try {
                    const stats = statSync(filePath);
                    if (stats.mtimeMs !== lastMtime) {
                        this.fileMtimes.set(filePath, stats.mtimeMs);
                        this.handleFileChange(filePath, 'changed');
                    }
                }
                catch {
                    if (lastMtime !== 0) {
                        this.fileMtimes.set(filePath, 0);
                        this.handleFileChange(filePath, 'deleted');
                    }
                }
            }
        }, this.options.hotReloadIntervalMs);
        this.logger.info('热重载已启动', {
            intervalMs: this.options.hotReloadIntervalMs
        });
    }
    handleFileChange(filePath, type) {
        const previousMtime = this.fileMtimes.get(filePath);
        if (type === 'deleted') {
            this.cache.delete(filePath);
            this.fileMtimes.delete(filePath);
        }
        else {
            const cached = this.cache.get(filePath);
            if (cached) {
                cached.loadedAt = 0;
            }
        }
        const event = {
            path: filePath,
            type,
            ...(previousMtime !== undefined && { previousMtime })
        };
        this.changeCallbacks.forEach(cb => {
            try {
                cb(event);
            }
            catch (error) {
                this.logger.error('热重载回调执行失败', { error });
            }
        });
        this.logger.info(`文件${type === 'changed' ? '修改' : '删除'}: ${filePath}`);
    }
    onChange(callback) {
        this.changeCallbacks.push(callback);
        return () => {
            const index = this.changeCallbacks.indexOf(callback);
            if (index > -1) {
                this.changeCallbacks.splice(index, 1);
            }
        };
    }
    async refreshAll() {
        const results = new Map();
        for (const filePath of this.cache.keys()) {
            this.cache.delete(filePath);
            const result = await this.load(filePath);
            results.set(filePath, result);
        }
        this.logger.info('强制刷新完成', { refreshedCount: results.size });
        return results;
    }
    clearCache() {
        const count = this.cache.size;
        this.cache.clear();
        this.logger.info(`缓存已清除: ${count} 项`);
    }
    dispose() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        for (const [path, watcher] of this.watchers) {
            watcher.close();
            this.logger.debug(`停止监听: ${path}`);
        }
        this.watchers.clear();
        this.changeCallbacks = [];
        this.logger.info('ContentLoader 已释放资源');
    }
    getStats() {
        return { ...this.stats };
    }
    getCacheStatus() {
        const now = Date.now();
        return Array.from(this.cache.entries()).map(([path, entry]) => ({
            path,
            age: now - entry.loadedAt,
            hits: entry.accessCount
        }));
    }
}
//# sourceMappingURL=content-Loader.js.map