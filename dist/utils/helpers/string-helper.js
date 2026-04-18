export function truncate(str, maxLength, ellipsis = '...') {
    if (str.length <= maxLength)
        return str;
    const truncateLength = maxLength - ellipsis.length;
    if (truncateLength <= 0)
        return ellipsis;
    return str.substring(0, truncateLength) + ellipsis;
}
export function sanitize(str) {
    return str
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}
export function convertNaming(str, target) {
    const words = str
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .replace(/[_-]/g, ' ')
        .trim()
        .split(/\s+/);
    switch (target) {
        case 'camel':
            return words
                .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
                .join('');
        case 'pascal':
            return words
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join('');
        case 'snake':
            return words.join('_');
        case 'screaming_snake':
            return words.join('_').toUpperCase();
        case 'kebab':
            return words.join('-');
        default:
            return str;
    }
}
export function template(template, variables, strict = false) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (key in variables) {
            return String(variables[key]);
        }
        if (strict) {
            throw new Error(`模板变量缺失: ${key}`);
        }
        return match;
    });
}
export function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    return matrix[b.length][a.length];
}
export function similarity(a, b) {
    if (a === b)
        return 1;
    if (a.length === 0 || b.length === 0)
        return 0;
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    return 1 - distance / maxLength;
}
export function randomId(length = 8, prefix) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix ? `${prefix}_${result}` : result;
}
export function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function wrapText(text, width) {
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        if ((currentLine + word).length > width) {
            lines.push(currentLine.trim());
            currentLine = word + ' ';
        }
        else {
            currentLine += word + ' ';
        }
    }
    if (currentLine.trim()) {
        lines.push(currentLine.trim());
    }
    return lines;
}
//# sourceMappingURL=string-helper.js.map