/**
 * Core type definitions for the Depth of Market (DOM) Heatmap engine.
 * Ensures strict typing and memory optimisation across the multi-threaded pipeline.
 */

/**
 * Core constants for viewport management.
 */
export const DEFAULT_PRICE_SPAN = 1000;
export const MIN_PRICE_SPAN = 1;
export const MAX_PRICE_SPAN = 20000;

/**
 * Branded types to prevent unit mismatch errors.
 * Providing nominal typing for primitive numbers.
 */
export type Price = number & { readonly __brand: 'Price' };
export type Quantity = number & { readonly __brand: 'Quantity' };
export type Timestamp = number & { readonly __brand: 'Timestamp' };

/**
 * Represents one side (bids or asks) of the order book using parallel arrays.
 * This structure is vastly faster to iterate and garbage-collect than a Map.
 */
export interface OrderBookSide {
    prices: number[];     // Sorted array of prices
    quantities: number[]; // Quantities corresponding to the prices array index
}

/**
 * Represents the current state of the order book.
 */
export interface OrderBookStore {
    readonly asks: OrderBookSide; // Sorted ascending (lowest first)
    readonly bids: OrderBookSide; // Sorted descending (highest first)
    readonly lastUpdateTimestamp: Timestamp;
}

/**
 * Represents an aggregated price range within the heatmap.
 */
export interface HeatmapBin {
    readonly lowerPriceBound: Price;
    readonly upperPriceBound: Price;
    readonly aggregatedQuantity: Quantity;
    readonly rawQuantity: Quantity;
}

/**
 * Represents one vertical column of time (a single frame) in the heatmap.
 */
export interface HeatmapSlice {
    readonly timestamp: Timestamp;
    readonly midPrice: number;
    readonly askBins: readonly HeatmapBin[];
    readonly bidBins: readonly HeatmapBin[];
    readonly askVolumeThresholds: readonly number[];
    readonly bidVolumeThresholds: readonly number[];
}

/**
 * Payload for initialising the order book snapshot.
 */
export interface SnapshotPayload {
    /** Array of [price, quantity] tuples for asks. */
    readonly asks: readonly [number, number][];
    /** Array of [price, quantity] tuples for bids. */
    readonly bids: readonly [number, number][];
}

/**
 * Payload for incremental depth updates.
 */
export interface DepthDeltaPayload {
    /** Array of [price, quantity] tuples for ask updates. */
    readonly asks: readonly [number, number][];
    /** Array of [price, quantity] tuples for bid updates. */
    readonly bids: readonly [number, number][];
    /** Sequence ID to ensure ordered processing. */
    readonly updateSequenceId: number;
}

/**
 * Payload for a render frame command.
 */
export interface RenderPayload {
    /** Start timestamp of the frame window. */
    readonly startTimestamp: Timestamp;
    /** End timestamp of the frame window. */
    readonly endTimestamp: Timestamp;
}

/**
 * Discriminated union for worker communications via postMessage.
 * Defines the standard message shapes for the pipeline.
 */
export type WorkerMessage =
    | { readonly type: 'INITIALISE_SNAPSHOT'; readonly payload: SnapshotPayload }
    | { readonly type: 'DEPTH_UPDATE'; readonly payload: DepthDeltaPayload }
    | { readonly type: 'RENDER_FRAME'; readonly payload: Readonly<RenderPayload> }
    | { readonly type: 'RENDER_SLICE'; readonly payload: HeatmapSlice, binSize: number }
    | { readonly type: 'MID_PRICE_UPDATE'; readonly payload: number }
    | { readonly type: 'CLEAR_HEATMAP' }
    | { readonly type: 'ERROR'; readonly message: string };

/**
 * Names of the available colour palettes for the heatmap renderer.
 */
export type PaletteName = 'viridis' | 'magma';

/**
 * Supported cryptocurrency pairs.
 */
export const SUPPORTED_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

/**
 * Messages sent from the main-thread UI layer (workerBroker) to the RenderWorker.
 * Carries only UI parameters \u2014 no market data ever flows this way.
 */
export type UiControlMessage =
    | { readonly type: 'SET_SYMBOL'; readonly symbol: string }
    | { readonly type: 'SET_MIN_VOLUME'; readonly value: number }
    | { readonly type: 'PIN_PRICE'; readonly price: number | null }
    | { readonly type: 'SET_ZOOM'; readonly payload: number }
    | { readonly type: 'SET_PAN'; readonly payload: Price }
    | { readonly type: 'SET_AUTO_CENTRE' }
    | { readonly type: 'SET_TIME_SCALE'; readonly payload: number }
    | { readonly type: 'SET_TIME_RANGE'; readonly payload: number }
    | { readonly type: 'SET_DEPTH'; readonly depth: number }
    | { readonly type: 'SET_BIN_SIZE'; readonly payload: number };

/**
 * Message sent from the RenderWorker back to the main thread so the UI
 * can re-project the pinned price overlay and display live volume.
 */
export interface ViewportUpdatePayload {
    readonly centrePrice: number;
    readonly midPrice: number;
    readonly priceSpan: number;
    readonly pinnedVolume: number | null;
    readonly pinnedSide: 'bid' | 'ask' | null;
    readonly latency: number;
    readonly latestTimestamp: number;
    readonly timeScale: number;
    readonly timeRangeMs: number;
    readonly askVolumeThresholds?: readonly number[];
    readonly bidVolumeThresholds?: readonly number[];
}

export interface DataProbePayload {
    readonly wsState: number;
    readonly asksSize: number;
    readonly bidsSize: number;
    readonly isSyncing: boolean;
}

export interface RenderProbePayload {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
}

export type InboundDataMessage =
    | { readonly type: 'STATUS_PROBE'; readonly payload: DataProbePayload }
    | { readonly type: 'ERROR'; readonly message: string };

export type InboundRenderMessage =
    | { readonly type: 'STATUS_PROBE'; readonly payload: RenderProbePayload }
    | { readonly type: 'VIEWPORT_UPDATE'; readonly payload: ViewportUpdatePayload };
