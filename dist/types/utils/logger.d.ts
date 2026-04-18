import { EventEmitter } from 'events';
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4,
    SILENT = 5
}
export interface LoggerOptions {
    level: LogLevel;
    enableColors: boolean;
    includeTimestamp: boolean;
    logFilePath?: string | undefined;
    jsonFormat: boolean;
    maxFileSizeMB: number;
    maxBackupFiles: number;
    context?: string | undefined;
}
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    levelName: string;
    message: string;
    context?: string;
    metadata?: Record<string, unknown>;
    stack?: string;
}
export type LogEventType = 'log' | 'error' | 'rotate';
export declare class Logger extends EventEmitter {
    private static instance;
    private config;
    private currentFileSize;
    private fileSystemReady;
    protected constructor(options?: Partial<LoggerOptions>);
    static create(options?: Partial<LoggerOptions>): Logger;
    static getInstance(options?: Partial<LoggerOptions>): Logger;
    static resetInstance(): void;
    updateConfig(options: Partial<LoggerOptions>): void;
    private initializeFileSystem;
    private createEntry;
    private sanitizeMetadata;
    private formatEntry;
    private write;
    private rotateLogFile;
    private shouldLog;
    debug(message: string, metadata?: Record<string, unknown>): void;
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    error(message: string, error?: Error | Record<string, unknown>): void;
    fatal(message: string, error?: Error | Record<string, unknown>): void;
    withContext(context: string): Logger;
    static setGlobalLevel(level: LogLevel): void;
}
export declare const logger: Logger;
export declare class NoopLogger extends Logger {
    debug(): void;
    info(): void;
    warn(): void;
    error(): void;
    fatal(): void;
    emit(): boolean;
}
//# sourceMappingURL=logger.d.ts.map