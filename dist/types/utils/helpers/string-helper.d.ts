export type NamingConvention = 'camel' | 'snake' | 'kebab' | 'pascal' | 'screaming_snake';
export declare function truncate(str: string, maxLength: number, ellipsis?: string): string;
export declare function sanitize(str: string): string;
export declare function convertNaming(str: string, target: NamingConvention): string;
export declare function template(template: string, variables: Record<string, string | number>, strict?: boolean): string;
export declare function levenshteinDistance(a: string, b: string): number;
export declare function similarity(a: string, b: string): number;
export declare function randomId(length?: number, prefix?: string): string;
export declare function escapeRegExp(str: string): string;
export declare function wrapText(text: string, width: number): string[];
//# sourceMappingURL=string-helper.d.ts.map