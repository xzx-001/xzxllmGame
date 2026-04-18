import { Logger } from '../logger.js';
const DefaultCleanOptions = {
    removeComments: true,
    removeTrailingCommas: true,
    extractMarkdown: true,
    allowMultiple: false,
    maxDepth: 10,
    lenient: true
};
export class JSONValidator {
    logger;
    options;
    constructor(options) {
        this.options = { ...DefaultCleanOptions, ...options };
        this.logger = Logger.create({ context: 'JSONValidator' });
    }
    extractMarkdownBlocks(text) {
        const blocks = [];
        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(text)) !== null) {
            if (match[1]) {
                blocks.push(match[1].trim());
            }
        }
        if (blocks.length === 0) {
            const inlineRegex = /`([^`]+)`/g;
            while ((match = inlineRegex.exec(text)) !== null) {
                if (match[1].includes('{') || match[1].includes('[')) {
                    blocks.push(match[1].trim());
                }
            }
        }
        return blocks;
    }
    removeComments(json) {
        let result = '';
        let inString = false;
        let escapeNext = false;
        let i = 0;
        while (i < json.length) {
            const char = json[i];
            const nextChar = json[i + 1];
            if (inString) {
                if (escapeNext) {
                    escapeNext = false;
                }
                else if (char === '\\') {
                    escapeNext = true;
                }
                else if (char === '"') {
                    inString = false;
                }
                result += char;
            }
            else {
                if (char === '/' && nextChar === '/') {
                    while (i < json.length && json[i] !== '\n') {
                        i++;
                    }
                    continue;
                }
                else if (char === '/' && nextChar === '*') {
                    i += 2;
                    while (i < json.length - 1 && !(json[i] === '*' && json[i + 1] === '/')) {
                        i++;
                    }
                    i += 2;
                    continue;
                }
                else if (char === '"') {
                    inString = true;
                    result += char;
                }
                else {
                    result += char;
                }
            }
            i++;
        }
        return result;
    }
    removeTrailingCommas(json) {
        return json.replace(/,(?=\s*[}\]])/g, '');
    }
    preprocess(text) {
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
    validate(text) {
        const startTime = Date.now();
        let cleaned = this.preprocess(text);
        const errors = [];
        let suggestions = [];
        try {
            const data = JSON.parse(cleaned);
            return {
                valid: true,
                data,
                cleaned,
                errors: []
            };
        }
        catch (initialError) {
            errors.push(`直接解析失败: ${initialError instanceof Error ? initialError.message : String(initialError)}`);
        }
        if (this.options.extractMarkdown) {
            const blocks = this.extractMarkdownBlocks(cleaned);
            if (blocks.length > 0) {
                cleaned = blocks[0];
                if (blocks.length > 1 && this.options.allowMultiple) {
                    try {
                        const multiData = blocks.map(b => JSON.parse(b));
                        return {
                            valid: true,
                            data: multiData,
                            cleaned: blocks.join('\n'),
                            errors: []
                        };
                    }
                    catch {
                    }
                }
            }
        }
        if (this.options.removeComments) {
            cleaned = this.removeComments(cleaned);
        }
        if (this.options.removeTrailingCommas) {
            cleaned = this.removeTrailingCommas(cleaned);
        }
        try {
            const data = JSON.parse(cleaned);
            this.logger.debug('JSON 验证成功（清洗后）', {
                durationMs: Date.now() - startTime,
                originalLength: text.length,
                cleanedLength: cleaned.length
            });
            return {
                valid: true,
                data,
                cleaned,
                errors
            };
        }
        catch (cleanError) {
            errors.push(`清洗后解析失败: ${cleanError instanceof Error ? cleanError.message : String(cleanError)}`);
        }
        if (this.options.lenient) {
            const fixed = this.attemptRepair(cleaned);
            if (fixed !== cleaned) {
                try {
                    const data = JSON.parse(fixed);
                    suggestions.push('自动修复了格式问题（如引号不匹配）');
                    return {
                        valid: true,
                        data,
                        cleaned: fixed,
                        errors,
                        suggestions
                    };
                }
                catch {
                    errors.push('自动修复后仍失败');
                }
            }
        }
        const errorPos = this.locateError(cleaned);
        const result = {
            valid: false,
            data: null,
            cleaned: null,
            errors,
            suggestions: this.generateSuggestions(cleaned, errorPos)
        };
        if (errorPos !== undefined) {
            result.errorPosition = errorPos;
        }
        return result;
    }
    attemptRepair(json) {
        let fixed = json;
        fixed = fixed.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
        fixed = fixed.replace(/(:\s*)'([^']+)'(\s*[},])/g, '$1"$2"$3');
        fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        const openBraces = (fixed.match(/{/g) || []).length;
        const closeBraces = (fixed.match(/}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/]/g) || []).length;
        if (openBraces > closeBraces) {
            fixed += '}'.repeat(openBraces - closeBraces);
        }
        if (openBrackets > closeBrackets) {
            fixed += ']'.repeat(openBrackets - closeBrackets);
        }
        return fixed;
    }
    locateError(json) {
        try {
            JSON.parse(json);
            return undefined;
        }
        catch (error) {
            if (error instanceof Error) {
                const posMatch = error.message.match(/position (\d+)/);
                if (posMatch) {
                    const pos = parseInt(posMatch[1], 10);
                    let line = 1;
                    let col = 1;
                    for (let i = 0; i < pos && i < json.length; i++) {
                        if (json[i] === '\n') {
                            line++;
                            col = 1;
                        }
                        else {
                            col++;
                        }
                    }
                    const lines = json.split('\n');
                    const excerpt = lines[line - 1]?.trim() || 'N/A';
                    return { line, column: col, excerpt };
                }
            }
        }
        return undefined;
    }
    generateSuggestions(json, errorPos) {
        const suggestions = [];
        if (!errorPos)
            return suggestions;
        const line = errorPos.excerpt;
        if (line.includes("'")) {
            suggestions.push('检测到单引号，JSON 标准要求使用双引号');
        }
        if (line.match(/[}\]]\s*,?\s*$/)) {
            suggestions.push('检查是否有尾随逗号或括号不匹配');
        }
        if (line.match(/[a-zA-Z_][a-zA-Z0-9_]*\s*:/)) {
            suggestions.push('检测到未加引号的键名，JSON 要求键名必须用双引号包裹');
        }
        if (json.split('{').length !== json.split('}').length) {
            suggestions.push('花括号数量不匹配，检查遗漏的 { 或 }');
        }
        return suggestions;
    }
    validateAs(text, validator) {
        const result = this.validate(text);
        if (result.valid && result.data !== null && validator) {
            if (!validator(result.data)) {
                return {
                    ...result,
                    valid: false,
                    data: null,
                    errors: [...result.errors, '类型验证失败：数据不符合预期结构']
                };
            }
        }
        return result;
    }
    static isValid(text) {
        const validator = new JSONValidator();
        return validator.validate(text).valid;
    }
    static extract(text) {
        const validator = new JSONValidator();
        return validator.validate(text).data;
    }
}
//# sourceMappingURL=json-validator.js.map