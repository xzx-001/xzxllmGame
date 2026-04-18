export async function parseBody(req, maxSize = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', (chunk) => {
            size += Buffer.byteLength(chunk);
            if (size > maxSize) {
                reject(new Error(`Request body exceeds maximum size of ${maxSize} bytes`));
                req.destroy();
                return;
            }
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch (error) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
export function sendJson(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
        ...data,
        meta: {
            ...data.meta,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        },
    }));
}
export function extractRouteParams(urlPath, routePattern) {
    const patternParts = routePattern.split('/');
    const urlParts = urlPath.split('/');
    if (patternParts.length !== urlParts.length) {
        return null;
    }
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        const part = patternParts[i];
        const urlPart = urlParts[i];
        if (!part || !urlPart) {
            return null;
        }
        if (part.startsWith(':')) {
            const paramName = part.slice(1);
            params[paramName] = decodeURIComponent(urlPart);
        }
        else if (part !== urlPart) {
            return null;
        }
    }
    return params;
}
export function extractPathSegment(urlPath, keyword, offset = 1) {
    const parts = urlPath.split('/').filter(Boolean);
    const index = parts.indexOf(keyword);
    if (index === -1 || index + offset >= parts.length) {
        return null;
    }
    const segment = parts[index + offset];
    if (!segment) {
        return null;
    }
    return decodeURIComponent(segment);
}
export function parseQueryParams(req) {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const params = {};
    url.searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}
export function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
export function safeJsonStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, val) => {
        if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) {
                return '[Circular Reference]';
            }
            seen.add(val);
        }
        if (typeof val === 'bigint') {
            return val.toString();
        }
        return val;
    });
}
//# sourceMappingURL=utils.js.map