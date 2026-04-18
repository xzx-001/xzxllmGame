import { EventEmitter } from 'events';
type ServiceFactory<T> = (container: Container) => T;
export declare class Container {
    private services;
    private resolving;
    readonly eventBus: EventEmitter;
    private frozen;
    constructor();
    register<T>(key: string, factory: ServiceFactory<T>, options?: {
        singleton?: boolean;
        dependencies?: string[];
    }): this;
    get<T>(key: string): T;
    has(key: string): boolean;
    remove(key: string): this;
    createChild(): Container;
    freeze(): this;
    dispose(): Promise<void>;
    getRegisteredServices(): string[];
    reset(): void;
}
export declare const container: Container;
export {};
//# sourceMappingURL=container.d.ts.map