// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import type { UiControlMessage } from '../engine/types';

/**
 * Encapsulates the communication between the UI and the background workers.
 * This class eliminates global state by maintaining its own worker references,
 * allowing for multiple heatmap instances to coexist in the same application.
 */
export class HeatmapService {
    private renderWorker: Worker;
    private dataWorker: Worker;

    constructor(renderWorker: Worker, dataWorker: Worker) {
        this.renderWorker = renderWorker;
        this.dataWorker = dataWorker;
    }

    private sendToRender(message: UiControlMessage): void {
        this.renderWorker.postMessage(message);
    }

    private sendToData(message: UiControlMessage): void {
        this.dataWorker.postMessage(message);
    }

    // ---------------------------------------------------------------------------
    // Public API — Worker Command Methods
    // ---------------------------------------------------------------------------

    /** Changes the active cryptocurrency symbol. */
    public sendSymbol(symbol: string): void {
        this.sendToData({ type: 'SET_SYMBOL', symbol });
    }

    /** Sets the minimum normalised volume threshold (0 – 1). Debounced at 50ms. */
    public sendMinVolume = this.debounce((value: number) => 
        this.sendToRender({ type: 'SET_MIN_VOLUME', value }), 50);

    /** Pins a price level on the heatmap. Debounced at 50ms. */
    public sendPinnedPrice = this.debounce((price: number | null) => 
        this.sendToRender({ type: 'PIN_PRICE', price }), 50);

    /** Updates the visible price span (zoom). Throttled via rAF. */
    public sendZoom = this.throttleRaf((priceSpan: number) => 
        this.sendToRender({ type: 'SET_ZOOM', payload: priceSpan }));

    /** Updates the centre price (panning). Throttled via rAF. */
    public sendPan = this.throttleRaf((centrePrice: number) => 
        this.sendToRender({ type: 'SET_PAN', payload: centrePrice as any }));

    /** Re-enables auto-centring on the live mid-price. */
    public sendAutoCentre = () => this.sendToRender({ type: 'SET_AUTO_CENTRE' });

    /** Adjusts the horizontal scrolling speed (time scale). Debounced at 50ms. */
    public sendTimeScale = this.debounce((scale: number) => 
        this.sendToRender({ type: 'SET_TIME_SCALE', payload: scale }), 50);

    /** Sets the total time range visible (in seconds). Debounced at 50ms. */
    public sendTimeRange = this.debounce((seconds: number) => 
        this.sendToRender({ type: 'SET_TIME_RANGE', payload: seconds }), 50);

    /** Sets the depth of the order book to process. Debounced at 50ms. */
    public sendDepth = this.debounce((depth: number) => 
        this.sendToData({ type: 'SET_DEPTH', depth }), 50);

    /** Sets the aggregation bin size. Debounced at 50ms. */
    public sendBinSize = this.debounce((size: number) => 
        this.sendToData({ type: 'SET_BIN_SIZE', payload: size }), 50);

    // ---------------------------------------------------------------------------
    // Utilities & Lifecycle
    // ---------------------------------------------------------------------------

    private debounce<T extends unknown[]>(fn: (...args: T) => void, delayMs: number) {
        let timerId: ReturnType<typeof setTimeout> | null = null;
        return (...args: T) => {
            if (timerId !== null) clearTimeout(timerId);
            timerId = setTimeout(() => {
                fn(...args);
                timerId = null;
            }, delayMs);
        };
    }

    private throttleRaf<T extends unknown[]>(fn: (...args: T) => void) {
        let rafId: number | null = null;
        let latestArgs: T | null = null;
        return (...args: T) => {
            latestArgs = args;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                if (latestArgs !== null) fn(...latestArgs);
                rafId = null;
            });
        };
    }

    /** Properly terminates the workers to release resources. */
    public terminate() {
        this.renderWorker.terminate();
        this.dataWorker.terminate();
    }
}
