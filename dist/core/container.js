import { EventEmitter } from 'events';
export class Container {
    services = new Map();
    resolving = new Set();
    eventBus;
    frozen = false;
    constructor() {
        this.eventBus = new EventEmitter();
        this.eventBus.setMaxListeners(50);
    }
    register(key, factory, options = {}) {
        if (this.frozen) {
            throw new Error(`Cannot register service "${key}": Container is frozen`);
        }
        if (this.services.has(key)) {
            console.warn(`Service "${key}" is being overwritten`);
        }
        this.services.set(key, {
            factory,
            singleton: options.singleton !== false,
            dependencies: options.dependencies || []
        });
        return this;
    }
    get(key) {
        const definition = this.services.get(key);
        if (!definition) {
            throw new Error(`Service "${key}" not found. Did you forget to register it?`);
        }
        if (this.resolving.has(key)) {
            throw new Error(`Circular dependency detected: ${Array.from(this.resolving).join(' -> ')} -> ${key}`);
        }
        if (definition.singleton && definition.instance !== undefined) {
            return definition.instance;
        }
        try {
            this.resolving.add(key);
            if (definition.dependencies.length > 0) {
                for (const dep of definition.dependencies) {
                    if (!this.services.has(dep)) {
                        throw new Error(`Service "${key}" depends on "${dep}" which is not registered`);
                    }
                }
            }
            const instance = definition.factory(this);
            if (definition.singleton) {
                definition.instance = instance;
            }
            return instance;
        }
        finally {
            this.resolving.delete(key);
        }
    }
    has(key) {
        return this.services.has(key);
    }
    remove(key) {
        if (this.frozen) {
            throw new Error(`Cannot remove service "${key}": Container is frozen`);
        }
        this.services.delete(key);
        return this;
    }
    createChild() {
        const child = new Container();
        for (const [key, def] of this.services) {
            child.services.set(key, {
                factory: def.factory,
                singleton: def.singleton,
                dependencies: def.dependencies || []
            });
        }
        return child;
    }
    freeze() {
        this.frozen = true;
        return this;
    }
    async dispose() {
        const disposePromises = [];
        for (const [key, def] of this.services) {
            if (def.instance && typeof def.instance.dispose === 'function') {
                disposePromises.push(Promise.resolve(def.instance.dispose()).catch(err => {
                    console.error(`Error disposing service "${key}":`, err);
                }));
            }
        }
        await Promise.all(disposePromises);
        this.services.clear();
        this.eventBus.removeAllListeners();
    }
    getRegisteredServices() {
        return Array.from(this.services.keys());
    }
    reset() {
        if (this.frozen) {
            throw new Error('Cannot reset frozen container');
        }
        this.services.clear();
        this.resolving.clear();
    }
}
export const container = new Container();
//# sourceMappingURL=container.js.map