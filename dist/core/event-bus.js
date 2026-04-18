import { EventEmitter } from 'events';
export class TypedEventBus {
    emitter;
    stats = new Map();
    constructor() {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(100);
    }
    on(event, handler) {
        const wrappedHandler = async (payload) => {
            try {
                await handler(payload);
            }
            catch (error) {
                console.error(`Error in event handler for "${event}":`, error);
            }
        };
        this.emitter.on(event, wrappedHandler);
        this.incrementStat(event);
        return () => {
            this.emitter.off(event, wrappedHandler);
            this.decrementStat(event);
        };
    }
    once(event, handler) {
        if (handler) {
            this.emitter.once(event, handler);
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            this.emitter.once(event, (payload) => resolve(payload));
        });
    }
    emit(event, payload) {
        return this.emitter.emit(event, payload);
    }
    async emitAsync(event, payload) {
        const listeners = this.emitter.listeners(event);
        const promises = listeners.map(listener => Promise.resolve().then(() => listener(payload)));
        return Promise.all(promises);
    }
    off(event) {
        if (event) {
            this.emitter.removeAllListeners(event);
            this.stats.delete(event);
        }
        else {
            this.emitter.removeAllListeners();
            this.stats.clear();
        }
    }
    listenerCount(event) {
        return this.emitter.listenerCount(event);
    }
    getStats() {
        return Object.fromEntries(this.stats);
    }
    incrementStat(event) {
        const key = String(event);
        this.stats.set(key, (this.stats.get(key) || 0) + 1);
    }
    decrementStat(event) {
        const key = String(event);
        const count = (this.stats.get(key) || 0) - 1;
        if (count <= 0) {
            this.stats.delete(key);
        }
        else {
            this.stats.set(key, count);
        }
    }
}
export const eventBus = new TypedEventBus();
//# sourceMappingURL=event-bus.js.map