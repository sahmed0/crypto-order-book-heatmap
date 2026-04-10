import type { OrderBookStore, Timestamp, WorkerMessage, OrderBookSide } from '../engine/types';
import { HeatmapProcessor } from '../engine/processor';
import { createOrderBookSide, updateOrderBookSide, pruneOrderBookSide } from '../engine/bookCore';
import { logInfo } from '../engine/debug';

interface BinanceDepthEvent {
    e: string;      // Event type
    E: number;      // Event time
    s: string;      // Symbol
    U: number;      // First update ID in event
    u: number;      // Final update ID in event
    b: [string, string][]; // Bids to be updated
    a: [string, string][]; // Asks to be updated
}

interface BinanceSnapshot {
    lastUpdateId: number;
    asks: [string, string][];
    bids: [string, string][];
}

/**
 * Manages the connection lifecycle and state synchronisation of the Binance BTC/USDT local order book.
 * Operates autonomously within a background Web Worker.
 */
// 5000 levels per side (10,000 total)
const ORDER_BOOK_DEPTH_PER_SIDE = 5000;

/**
 * BinanceConnector manages the WebSocket connection to the Binance API.
 * Handles order book snapshots, depth updates, and re-synchronisation logic.
 */
export class BinanceConnector {
    private ws: WebSocket | null = null;
    private symbol: string = 'BTCUSDT';

    private readonly asks = createOrderBookSide();
    private readonly bids = createOrderBookSide();

    private readonly processor = new HeatmapProcessor();

    // Accumulators for batched depth deltas.
    // For pending we still use Map because delta extraction doesn't need to be sorted.
    private readonly pendingAsks = new Map<number, number>();
    private readonly pendingBids = new Map<number, number>();

    private isSyncing = false;
    private hasAppliedFirstEvent = false;
    private buffer: BinanceDepthEvent[] = [];
    private lastUpdateId: number = -1;
    private latestEventTime: Timestamp = 0 as Timestamp;

    private reconnectAttempt = 0;

    // connectionId acts as a generation token to prevent race conditions during restarts
    private connectionId = 0;
    private throttleIntervalId: ReturnType<typeof setInterval> | null = null;
    private keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
    private currentDepth = ORDER_BOOK_DEPTH_PER_SIDE;
    private currentBinSize = 10;

    public constructor() {
        this.startSync();
    }

    public setSymbol(newSymbol: string): void {
        this.symbol = newSymbol;
        this.reconnectAttempt = 0;
        
        // Stop current connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.throttleIntervalId !== null) {
            clearInterval(this.throttleIntervalId);
            this.throttleIntervalId = null;
        }
        
        if (this.keepAliveIntervalId !== null) {
            clearInterval(this.keepAliveIntervalId);
            this.keepAliveIntervalId = null;
        }
        
        // Notify render pipeline to clear visual history
        emit({ type: 'CLEAR_HEATMAP' });
        
        // Re-initialise for new pair
        this.startSync();
    }

    private startSync(): void {
        this.resetState();
        const currentId = ++this.connectionId;

        this.connectStream(currentId);
        this.startThrottler();
        this.startKeepAlive(currentId);
    }

    private resetState(): void {
        this.isSyncing = false;
        this.hasAppliedFirstEvent = false;
        this.buffer = [];
        this.asks.prices.length = 0;
        this.asks.quantities.length = 0;
        this.bids.prices.length = 0;
        this.bids.quantities.length = 0;
        this.pendingAsks.clear();
        this.pendingBids.clear();
        this.lastUpdateId = -1;
        this.latestEventTime = 0 as Timestamp;
    }

    private startKeepAlive(connectionId: number): void {
        if (this.keepAliveIntervalId !== null) {
            clearInterval(this.keepAliveIntervalId);
        }
        this.keepAliveIntervalId = setInterval(() => {
            if (this.connectionId !== connectionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            this.ws.send(JSON.stringify({ method: "LIST_SUBSCRIPTIONS", id: 999 }));
            logInfo('DATA', '[WS_KEEPALIVE] Sent application-level keep-alive.');
        }, 3 * 60 * 1000); // 3 minutes
    }

    private connectStream(connectionId: number): void {
        logInfo('DATA', `[WS_CONNECTING] Connecting to Binance stream for ${this.symbol}...`);
        this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${this.symbol.toLowerCase()}@depth`);

        this.ws.onmessage = (msg: MessageEvent) => {
            if (this.connectionId !== connectionId) return;

            // Simple check to ignore if the message is just a pong/subscription response and not depth data
            // Binance depth data always contains the 'e' property for event type
            const rawData = msg.data as string;
            if (!rawData.includes('"e":"depthUpdate"')) return;

            const event = JSON.parse(rawData) as BinanceDepthEvent;

            if (!this.isSyncing) {
                this.buffer.push(event);
                return;
            }

            this.processStreamEvent(event);
        };

        this.ws.onerror = () => {
            if (this.connectionId === connectionId) {
                logInfo('DATA', '[WS_ERROR] WebSocket connection error.');
                this.emitError('WebSocket connection error.');
                this.handleRestart();
            }
        };

        this.ws.onclose = (e: CloseEvent) => {
            if (this.connectionId === connectionId) {
                // Code 1000 is a normal closure, code 1006 usually indicates abnormal closure like ping timeout
                logInfo('DATA', `[WS_CLOSED_${e.code}] WebSocket closed. Reason: ${e.reason}`);
                this.emitError('WebSocket closed unexpectedly.');
                this.handleRestart();
            }
        };

        this.ws.onopen = () => {
            if (this.connectionId === connectionId) {
                logInfo('DATA', '[WS_OPEN] WebSocket connected.');
                this.reconnectAttempt = 0; // Reset backoff on successful connection

                // Fetch snapshot ONLY AFTER websocket is open and buffering!
                this.fetchSnapshot(connectionId);
            }
        };
    }

    private async fetchSnapshot(connectionId: number): Promise<void> {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${this.symbol.toUpperCase()}&limit=5000`);
            if (!response.ok) throw new Error('Failed to fetch REST snapshot.');

            const snapshot = await response.json() as BinanceSnapshot;
            if (this.connectionId !== connectionId) return;

            this.lastUpdateId = snapshot.lastUpdateId;

            this.applySnapshot(snapshot.asks, snapshot.bids);

            // Emit the initial snapshot to the pipeline
            const initMessage: WorkerMessage = {
                type: 'INITIALISE_SNAPSHOT',
                payload: {
                    // Send arrays of tuples for backward compatibility with the RenderWorker for now
                    asks: this.asks.prices.map((p, i) => [p, this.asks.quantities[i]]),
                    bids: this.bids.prices.map((p, i) => [p, this.bids.quantities[i]])
                }
            };
            emit(initMessage);

            this.processBuffer(connectionId);

        } catch (error) {
            if (this.connectionId === connectionId) {
                const message = error instanceof Error ? error.message : 'Unknown snapshot fetch exception';
                this.emitError(`Snapshot phase failed: ${message}`);
                this.handleRestart();
            }
        }
    }

    private processBuffer(connectionId: number): void {
        for (const event of this.buffer) {
            if (this.connectionId !== connectionId) return;
            this.processStreamEvent(event);
        }

        this.buffer = [];
        this.isSyncing = true;
        logInfo('DATA', 'Snapshot processing complete. Synced to stream.');
    }

    private processStreamEvent(event: BinanceDepthEvent): void {
        // Validation logic based on Binance's "How to manage a local order book correctly"
        if (!this.hasAppliedFirstEvent) {
            if (event.u <= this.lastUpdateId) {
                return; // Discard events strictly older than REST snapshot
            }
            if (event.U <= this.lastUpdateId + 1 && event.u >= this.lastUpdateId + 1) {
                this.applyEvent(event);
                this.hasAppliedFirstEvent = true;
            } else {
                this.emitError(`Sequence gap detected in first event. Expected U <= ${this.lastUpdateId + 1} and u >= ${this.lastUpdateId + 1}. Got U: ${event.U}, u: ${event.u}`);
                this.handleRestart();
                return;
            }
        } else {
            // Note: The @100ms stream frequently does NOT include the 'pu' property.
            // We must validate that the *first* update ID of this new event (U) 
            // is exactly equal to the *final* update ID of the previous event (u) + 1.
            if (event.U === this.lastUpdateId + 1) {
                this.applyEvent(event);
            } else {
                this.emitError(`Sequence gap detected. Expected U: ${this.lastUpdateId + 1}, got: ${event.U}`);
                this.handleRestart();
                return;
            }
        }
    }

    private applySnapshot(asks: [string, string][], bids: [string, string][]): void {
        // Initialises book directly
        for (const [pStr, qStr] of asks) {
            updateOrderBookSide(this.asks, parseFloat(pStr), parseFloat(qStr), true);
        }
        for (const [pStr, qStr] of bids) {
            updateOrderBookSide(this.bids, parseFloat(pStr), parseFloat(qStr), false);
        }
    }

    private applyEvent(event: BinanceDepthEvent): void {
        this.updateBook(this.asks, this.pendingAsks, event.a, true);
        this.updateBook(this.bids, this.pendingBids, event.b, false);

        // Ensure we maintain a maximum of 5000 levels on each side (total 10,000)
        pruneOrderBookSide(this.asks, ORDER_BOOK_DEPTH_PER_SIDE);
        pruneOrderBookSide(this.bids, ORDER_BOOK_DEPTH_PER_SIDE);

        this.lastUpdateId = event.u;
        this.latestEventTime = event.E as Timestamp;
    }

    private updateBook(
        side: OrderBookSide,
        pending: Map<number, number>,
        updates: [string, string][],
        isAscending: boolean
    ): void {
        for (const [pStr, qStr] of updates) {
            const price = parseFloat(pStr);
            const quantity = parseFloat(qStr);

            updateOrderBookSide(side, price, quantity, isAscending);

            // Track the parsed delta for our throttled DEPTH_UPDATE transmit
            pending.set(price, quantity);
        }
    }

    private buildBookSnapshot(): OrderBookStore {
        return {
            asks: this.asks,
            bids: this.bids,
            lastUpdateTimestamp: this.latestEventTime || (Date.now() as Timestamp),
        };
    }

    public setDepth(depth: number): void {
        this.currentDepth = depth;
        logInfo('DATA', `Order book depth set to ${depth}`);
    }

    public setBinSize(size: number): void {
        this.currentBinSize = size;
        logInfo('DATA', `Aggregation bin size set to $${size}`);
    }

    private startThrottler(): void {
        if (this.throttleIntervalId !== null) {
            clearInterval(this.throttleIntervalId);
        }

        this.throttleIntervalId = setInterval(() => {
            if (!this.isSyncing || !this.hasAppliedFirstEvent) return;

            const effectiveTimestamp = this.latestEventTime || (Date.now() as Timestamp);

            // Transmit batched deltas instead of spamming every event
            if (this.pendingAsks.size > 0 || this.pendingBids.size > 0) {
                const depthUpdate: WorkerMessage = {
                    type: 'DEPTH_UPDATE',
                    payload: {
                        asks: Array.from(this.pendingAsks.entries()),
                        bids: Array.from(this.pendingBids.entries()),
                        updateSequenceId: this.lastUpdateId
                    }
                };
                emit(depthUpdate);

                this.pendingAsks.clear();
                this.pendingBids.clear();
            }

            let currentMidPrice = 0;
            if (this.asks.prices.length > 0 && this.bids.prices.length > 0) {
                const lowestAsk = this.asks.prices[0];
                const highestBid = this.bids.prices[0];
                currentMidPrice = (lowestAsk + highestBid) / 2;
                emit({ type: 'MID_PRICE_UPDATE', payload: currentMidPrice });
            }

            // Build a HeatmapSlice from the live order book and forward it to the RenderWorker
            const slice = this.processor.processSlice(
                this.buildBookSnapshot(),
                this.currentBinSize,
                effectiveTimestamp,
                currentMidPrice,
                this.currentDepth
            );
            emit({ type: 'RENDER_SLICE', payload: slice, binSize: this.currentBinSize });

        }, 100);
    }

    private handleRestart(): void {
        // Invalidate the current connection generation immediately to stop any synchronous loops
        this.connectionId++;

        if (this.ws) {
            this.ws.onclose = null; // Detach to avoid double-firing loop
            this.ws.onerror = null; // Detach to prevent error bubbling
            this.ws.onmessage = null; // Detach
            this.ws.onopen = null; // Detach
            this.ws.close();
            this.ws = null;
        }

        if (this.throttleIntervalId !== null) {
            clearInterval(this.throttleIntervalId as any);
            this.throttleIntervalId = null;
        }

        if (this.keepAliveIntervalId !== null) {
            clearInterval(this.keepAliveIntervalId as any);
            this.keepAliveIntervalId = null;
        }

        // Exponential backoff logic: start at 2000ms, cap at 30000ms
        let backoffMs = Math.pow(2, this.reconnectAttempt) * 1000;
        if (backoffMs > 30000) {
            backoffMs = 30000;
        }
        this.reconnectAttempt++;

        logInfo('DATA', `[WS_RECONNECTING] Reconnecting in ${backoffMs}ms... (Attempt ${this.reconnectAttempt})`);

        setTimeout(() => {
            this.startSync();
        }, backoffMs);
    }

    private emitError(message: string): void {
        emit({ type: 'ERROR', message });
    }
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let connector: BinanceConnector | null = null;
let renderPort: MessagePort | null = null;
let probeIntervalId: ReturnType<typeof setInterval> | null = null;

const originalPost: (message: unknown) => void = globalThis.postMessage.bind(globalThis);

/**
 * Routes pipeline messages to the RenderWorker via the MessageChannel port;
 * all other messages (errors, status probes) go directly to the main thread.
 * Replaces the previous self.postMessage monkey-patch.
 */
function emit(message: WorkerMessage): void {
    if (renderPort && (
        message.type === 'INITIALISE_SNAPSHOT' ||
        message.type === 'DEPTH_UPDATE' ||
        message.type === 'RENDER_SLICE' ||
        message.type === 'MID_PRICE_UPDATE'
    )) {
        renderPort.postMessage(message);
    } else {
        originalPost(message);
    }
}

const startProbe = () => {
    if (probeIntervalId) clearInterval(probeIntervalId);
    probeIntervalId = setInterval(() => {
        // STATUS_PROBE always targets the main thread — sent via originalPost.
        // (connector as any) is used solely to access private fields for the debug probe
        // without polluting the BinanceConnector public API.
        originalPost({
            type: 'STATUS_PROBE',
            source: 'DATA',
            payload: {
                wsState: (connector as any)?.ws?.readyState ?? WebSocket.CLOSED,
                asksSize: (connector as any)?.asks?.prices?.length ?? 0,
                bidsSize: (connector as any)?.bids?.prices?.length ?? 0,
                isSyncing: (connector as any)?.isSyncing ?? false
            }
        });
    }, 2000);
};

self.onmessage = (e: MessageEvent) => {
    const data = e.data;

    if (data.type === 'INIT_PORT') {
        renderPort = data.port;
        renderPort?.start(); // CRITICAL: Start the port so it actually channels messages
        logInfo('DATA', 'Render Port initialised and started.');
    } else if (data.type === 'START_STREAM') {
        if (!connector) {
            logInfo('DATA', 'Starting Binance Connector...');
            connector = new BinanceConnector();
            startProbe();
        }
    } else if (data.type === 'SET_SYMBOL') {
        connector?.setSymbol(data.symbol);
    } else if (data.type === 'SET_DEPTH') {
        connector?.setDepth(data.depth);
    } else if (data.type === 'SET_BIN_SIZE') {
        connector?.setBinSize(data.payload);
    }
};
