import { EventEmitter } from 'events';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 4] = "FATAL";
    LogLevel[LogLevel["SILENT"] = 5] = "SILENT";
})(LogLevel || (LogLevel = {}));
const GlobalConfig = {
    level: LogLevel.INFO,
    enableColors: true,
    includeTimestamp: true,
    jsonFormat: false,
    maxFileSizeMB: 10,
    maxBackupFiles: 5,
    logFilePath: undefined
};
const Colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m'
};
const LevelColors = {
    [LogLevel.DEBUG]: Colors.cyan,
    [LogLevel.INFO]: Colors.green,
    [LogLevel.WARN]: Colors.yellow,
    [LogLevel.ERROR]: Colors.red,
    [LogLevel.FATAL]: Colors.bgRed + Colors.white,
    [LogLevel.SILENT]: ''
};
const LevelNames = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.FATAL]: 'FATAL',
    [LogLevel.SILENT]: 'SILENT'
};
export class Logger extends EventEmitter {
    static instance = null;
    config;
    currentFileSize = 0;
    fileSystemReady = false;
    constructor(options = {}) {
        super();
        this.config = { ...GlobalConfig, ...options };
        this.initializeFileSystem();
    }
    static create(options) {
        return new Logger(options);
    }
    static getInstance(options) {
        if (!Logger.instance) {
            Logger.instance = new Logger(options);
        }
        else if (options && Object.keys(options).length > 0) {
            Logger.instance.updateConfig(options);
        }
        return Logger.instance;
    }
    static resetInstance() {
        Logger.instance = null;
    }
    updateConfig(options) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...options };
        if (options.logFilePath && options.logFilePath !== oldConfig.logFilePath) {
            this.fileSystemReady = false;
            this.initializeFileSystem();
        }
        this.emit('configChanged', { old: oldConfig, new: this.config });
    }
    initializeFileSystem() {
        if (this.fileSystemReady || !this.config.logFilePath) {
            return;
        }
        try {
            const dir = dirname(this.config.logFilePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            if (existsSync(this.config.logFilePath)) {
                appendFileSync(this.config.logFilePath, '');
            }
            this.fileSystemReady = true;
        }
        catch (error) {
            this.emit('error', { type: 'filesystem_init', error });
            this.config.logFilePath = undefined;
        }
    }
    createEntry(level, message, metadata) {
        const error = metadata?.error;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            levelName: LevelNames[level],
            message
        };
        if (this.config.context !== undefined) {
            entry.context = this.config.context;
        }
        if (metadata) {
            entry.metadata = this.sanitizeMetadata(metadata);
        }
        if (error?.stack !== undefined) {
            entry.stack = error.stack;
        }
        return entry;
    }
    sanitizeMetadata(metadata) {
        const seen = new WeakSet();
        const sanitize = (obj) => {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }
            if (obj instanceof Error) {
                return {
                    name: obj.name,
                    message: obj.message,
                    stack: obj.stack
                };
            }
            if (seen.has(obj)) {
                return '[Circular]';
            }
            seen.add(obj);
            if (Array.isArray(obj)) {
                return obj.map(item => sanitize(item));
            }
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (['password', 'secret', 'token', 'apiKey'].includes(key.toLowerCase())) {
                    result[key] = '[REDACTED]';
                }
                else {
                    result[key] = sanitize(value);
                }
            }
            return result;
        };
        return sanitize(metadata);
    }
    formatEntry(entry) {
        if (this.config.jsonFormat) {
            return JSON.stringify(entry);
        }
        const parts = [];
        if (this.config.includeTimestamp) {
            const timeStr = entry.timestamp.split('T')[1]?.replace('Z', '') ?? '';
            parts.push(`[${Colors.dim}${timeStr}${Colors.reset}]`);
        }
        const levelColor = this.config.enableColors ? LevelColors[entry.level] : '';
        const resetColor = this.config.enableColors ? Colors.reset : '';
        const levelStr = `${levelColor}[${entry.levelName.padEnd(5)}]${resetColor}`;
        parts.push(levelStr);
        if (entry.context) {
            const ctxColor = this.config.enableColors ? Colors.magenta : '';
            parts.push(`${ctxColor}[${entry.context}]${resetColor}`);
        }
        parts.push(entry.message);
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            const metaStr = Object.entries(entry.metadata)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(' ');
            parts.push(`{${metaStr}}`);
        }
        if (entry.stack) {
            parts.push('\n' + entry.stack);
        }
        return parts.join(' ');
    }
    write(entry) {
        const formatted = this.formatEntry(entry);
        if (entry.level >= LogLevel.ERROR) {
            console.error(formatted);
        }
        else if (entry.level === LogLevel.WARN) {
            console.warn(formatted);
        }
        else {
            console.log(formatted);
        }
        if (this.config.logFilePath && this.fileSystemReady) {
            try {
                const line = (this.config.jsonFormat ? formatted : formatted.replace(/\x1b\[\d+m/g, '')) + '\n';
                appendFileSync(this.config.logFilePath, line);
                this.currentFileSize += Buffer.byteLength(line, 'utf8');
                if (this.currentFileSize > this.config.maxFileSizeMB * 1024 * 1024) {
                    this.rotateLogFile();
                }
            }
            catch (error) {
                this.emit('error', { type: 'file_write', error });
            }
        }
        this.emit('log', entry);
    }
    rotateLogFile() {
        if (!this.config.logFilePath)
            return;
        try {
            for (let i = this.config.maxBackupFiles - 1; i >= 1; i--) {
                const oldPath = `${this.config.logFilePath}.${i}`;
                if (existsSync(oldPath)) {
                    if (i === this.config.maxBackupFiles - 1) {
                    }
                    else {
                    }
                }
            }
            this.currentFileSize = 0;
            this.emit('rotate', { file: this.config.logFilePath });
        }
        catch (error) {
            this.emit('error', { type: 'rotate', error });
        }
    }
    shouldLog(level) {
        return level >= this.config.level && level < LogLevel.SILENT;
    }
    debug(message, metadata) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            this.write(this.createEntry(LogLevel.DEBUG, message, metadata));
        }
    }
    info(message, metadata) {
        if (this.shouldLog(LogLevel.INFO)) {
            this.write(this.createEntry(LogLevel.INFO, message, metadata));
        }
    }
    warn(message, metadata) {
        if (this.shouldLog(LogLevel.WARN)) {
            this.write(this.createEntry(LogLevel.WARN, message, metadata));
        }
    }
    error(message, error) {
        if (this.shouldLog(LogLevel.ERROR)) {
            const metadata = error instanceof Error ? { error } : error;
            this.write(this.createEntry(LogLevel.ERROR, message, metadata));
        }
    }
    fatal(message, error) {
        if (this.shouldLog(LogLevel.FATAL)) {
            const metadata = error instanceof Error ? { error } : error;
            this.write(this.createEntry(LogLevel.FATAL, message, metadata));
            this.emit('fatal', { message, error: metadata });
        }
    }
    withContext(context) {
        const childLogger = new Logger({
            ...this.config,
            context
        });
        return childLogger;
    }
    static setGlobalLevel(level) {
        if (Logger.instance) {
            Logger.instance.updateConfig({ level });
        }
        else {
            GlobalConfig.level = level;
        }
    }
}
export const logger = Logger.getInstance();
export class NoopLogger extends Logger {
    debug() { }
    info() { }
    warn() { }
    error() { }
    fatal() { }
    emit() { return true; }
}
//# sourceMappingURL=logger.js.map