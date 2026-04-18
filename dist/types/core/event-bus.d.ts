import { EngineEvent } from './interfaces/api.types.js';
type EventHandler<T = any> = (payload: T) => void | Promise<void>;
export declare class TypedEventBus {
    private emitter;
    private stats;
    constructor();
    on<T>(event: EngineEvent | string, handler: EventHandler<T>): () => void;
    once<T>(event: EngineEvent | string, handler?: EventHandler<T>): Promise<T>;
    emit<T>(event: EngineEvent | string, payload: T): boolean;
    emitAsync<T>(event: EngineEvent | string, payload: T): Promise<any[]>;
    off(event?: EngineEvent | string): void;
    listenerCount(event: EngineEvent | string): number;
    getStats(): Record<string, number>;
    private incrementStat;
    private decrementStat;
}
export declare const eventBus: TypedEventBus;
export {};
//# sourceMappingURL=event-bus.d.ts.map