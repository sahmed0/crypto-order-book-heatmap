// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import type { HeatmapSlice, Price, PaletteName } from '../engine/types';
import { PALETTE_BANDS, type RGB } from '../engine/palettes';
import { DEFAULT_PRICE_SPAN } from '../engine/types';

import { logInfo, logError } from '../engine/debug';

/**
 * Payload for initialising the RenderWorker.
 */
export interface InitRenderWorkerPayload {
    /** The OffscreenCanvas to render onto. */
    canvas: OffscreenCanvas;
    /** The device pixel ratio for high-DPI scaling. */
    pixelRatio: number;
    /** The initial width of the viewport. */
    width: number;
    /** The initial height of the viewport. */
    height: number;
}

// ---------------------------------------------------------------------------
// Renderer class
// ---------------------------------------------------------------------------

/**
 * Main renderer class for the DOM Heatmap.
 * Manages the offscreen canvas, history buffers, and the render loop.
 */
export class HeatmapRenderer {
    private mainCanvas: OffscreenCanvas | null = null;
    private mainCtx: OffscreenCanvasRenderingContext2D | null = null;

    // Tracker canvas stores market slices at a FIXED width (e.g. 4px)
    // This allows the render loop to scale them smoothly to any viewport width.
    private trackerCanvas: OffscreenCanvas | null = null;
    private trackerCtx: OffscreenCanvasRenderingContext2D | null = null;

    // Physical pixel dimensions
    private width = 0;
    private height = 0;
    private pixelRatio = 1;

    // coverage buffer property
    private coverageScratchpad: Float32Array | null = null;
private renderCentrePrice: Price = 0 as Price; // We will use this for Issue 2

    // Pre-allocated zero-allocation hot-path buffer
    private columnImageData: ImageData | null = null;
    private columnDataView: Uint32Array | null = null;

    // Scratchpad for sub-pixel Float32 RGB blending
    private columnScratchpad: Float32Array | null = null;

    // Viewport tracking
    private centrePrice: Price = 0 as Price;
    private previousCentrePrice: Price = 0 as Price;
    private priceSpanVisible: number = DEFAULT_PRICE_SPAN;
    private timeScale: number = 1;
    private timeRangeSeconds: number = 10;
    private latestTimestamp: number = 0;

    private getShiftX(): number {
        if (this.width <= 0) return 1;
        // Calculate number of slices based on the time range, assuming 100ms (10 slices per second)
        const visibleSlices = this.timeRangeSeconds * 10;
        return (this.width / visibleSlices) * this.timeScale;
    }

    // Interactive Viewport State
    private midPrice: number = 0;
    private isAutoCentring: boolean = true;

    // ---- Circular TypedArray Buffer State ----
    // MAX_HISTORY = 1800 slices (3 minutes at 10 slices/sec)
    private readonly MAX_HISTORY = 1800;
    private historyWriteIdx = 0;
    private historyCount = 0;

    // Metadata: [timestamp, midPrice, askBinCount, bidBinCount] per slice
    private readonly metadataBuffer = new Float64Array(this.MAX_HISTORY * 5);
    
    // Bin Data: [lowerPrice, intensity, rawQty] triplets. 
    // Fixed allocation: 1000 bins max per slice (500 per side). 
    // Total: 1800 * 1000 * 3 * 4 bytes = ~21.6MB
    private readonly MAX_BINS_PER_SLICE = 1000;
    private readonly binBuffer = new Float32Array(this.MAX_HISTORY * this.MAX_BINS_PER_SLICE * 3);

    // Thresholds: [ask1..5, bid1..5] = 10 per slice
    private readonly thresholdBuffer = new Float32Array(this.MAX_HISTORY * 10);

    private needsFullRedraw = false;

    // ---- UI-controlled parameters -----------------------------------------
    /** Normalised intensity threshold (0 \u2013 1). Bins below this are skipped. */
    private minVolume: number = 0;
    /** Pinned price in USD, or null when no pin is active. */
    private pinnedPrice: number | null = null;
    private binSize: number = 10;

    // Debug metrics & smoothing state
    private fpsCounter = 0;
    private probeIntervalId: ReturnType<typeof setInterval> | null = null;

    // Animation loop state
    private lastSliceTime = 0;

    constructor() {
        this.setupMessageListener();
        this.startProbe();

        // Start animation loop
        this.renderLoop = this.renderLoop.bind(this);
        requestAnimationFrame(this.renderLoop);
    }

    private startProbe(): void {
        if (this.probeIntervalId) clearInterval(this.probeIntervalId);
        this.probeIntervalId = setInterval(() => {
            postMessage({
                type: 'STATUS_PROBE',
                source: 'RENDER',
                payload: {
                    width: this.width,
                    height: this.height,
                    fps: this.fpsCounter / 2, // Interval is 2000ms
                }
            });
            this.fpsCounter = 0;
        }, 2000);
    }

    public clear(): void {
        this.historyWriteIdx = 0;
        this.historyCount = 0;
        this.previousCentrePrice = 0 as Price;
        this.needsFullRedraw = true;
        
        if (this.trackerCtx) {
            const intShiftX = Math.ceil(this.getShiftX());
            this.trackerCtx.fillStyle = '#ffffff';
            this.trackerCtx.fillRect(0, 0, this.width + intShiftX, this.height);
        }
        
        if (this.mainCtx) {
            this.mainCtx.fillStyle = '#ffffff';
            this.mainCtx.fillRect(0, 0, this.width, this.height);
        }
    }

    private setupMessageListener(): void {
        self.onmessage = (e: MessageEvent) => {
            const data = e.data;

            if (data.type === 'INIT_CANVAS' || data.type === 'INIT_RENDERER') {
                this.initialise(
                    (data.canvas ?? data.payload?.canvas) as OffscreenCanvas
                );

            } else if (data.type === 'RENDER_SLICE' && this.mainCtx) {
                this.pushToHistory(data.payload as HeatmapSlice);
                this.drawSlice(data.payload as HeatmapSlice);

            } else if (data.type === 'SET_ZOOM') {
                this.priceSpanVisible = data.payload;
                this.needsFullRedraw = true;

            } else if (data.type === 'SET_PAN') {
                this.centrePrice = data.payload as Price;
                this.isAutoCentring = false;
                this.needsFullRedraw = true;

            } else if (data.type === 'SET_AUTO_CENTRE') {
                this.isAutoCentring = true;
                this.centrePrice = this.midPrice as Price;
                this.needsFullRedraw = true;



            } else if (data.type === 'SET_TIME_SCALE') {
                this.timeScale = data.payload;
                this.resizeTrackerCanvas();

            } else if (data.type === 'SET_TIME_RANGE') {
                this.timeRangeSeconds = data.payload;
                this.resizeTrackerCanvas();

            } else if (data.type === 'RESIZE') {
                this.handleResize(data.width, data.height, data.dpr);

            } else if (data.type === 'INIT_PORT') {
                this.connectDataPort(data.port as MessagePort);

                // ---- UI control messages ----------------------------------------
            } else if (data.type === 'SET_MIN_VOLUME') {
                this.minVolume = data.value as number;
                logInfo('RENDER', `minVolume threshold set to ${this.minVolume.toFixed(2)}`);

            } else if (data.type === 'PIN_PRICE') {
                this.pinnedPrice = data.price as number | null;
                logInfo('RENDER', `Pinned price set to ${this.pinnedPrice}`);
            }

            else if (data.type === 'SET_BIN_SIZE') {
                this.binSize = data.payload as number;
                logInfo('RENDER', `Bin size set to ${this.binSize}`);
            }
        };
    }

    private connectDataPort(port: MessagePort): void {
        port.onmessage = (portEvent: MessageEvent) => {
            const portData = portEvent.data;

            if (portData.type === 'INITIALISE_SNAPSHOT') {
                logInfo('RENDER', 'Initial Snapshot Seed received over port.');

            } else if (portData.type === 'CLEAR_HEATMAP') {
                logInfo('RENDER', 'Clearing heatmap for symbol change.');
                this.clear();

            } else if (portData.type === 'MID_PRICE_UPDATE') {
                this.midPrice = portData.payload;
                if (this.isAutoCentring) {
                    this.centrePrice = this.midPrice as Price;
                }

            } else if (portData.type === 'RENDER_SLICE') {
                const slice = portData.payload as HeatmapSlice;
                this.binSize = portData.binSize; // grab bin size from data worker
                this.pushToHistory(slice);
                this.drawSlice(slice);
            }
        };
        port.start();
        logInfo('RENDER', 'DataWorker Messaging Port initialised and started.');
    }

    private pushToHistory(slice: HeatmapSlice): void {
        const idx = this.historyWriteIdx;
        
        // 1. Pack Metadata
        const mBase = idx * 5;
        this.metadataBuffer[mBase] = slice.timestamp;
        this.metadataBuffer[mBase + 1] = slice.midPrice;
        this.metadataBuffer[mBase + 2] = slice.askBins.length;
        this.metadataBuffer[mBase + 3] = slice.bidBins.length;
        this.metadataBuffer[mBase + 4] = this.binSize;

        // 2. Pack Bins
        const bBase = idx * this.MAX_BINS_PER_SLICE * 3;
        let bPtr = bBase;
        
        const packBins = (bins: readonly any[]) => {
            const limit = Math.min(bins.length, this.MAX_BINS_PER_SLICE / 2);
            for (let i = 0; i < limit; i++) {
                const b = bins[i];
                this.binBuffer[bPtr++] = b.lowerPriceBound;
                this.binBuffer[bPtr++] = b.aggregatedQuantity;
                this.binBuffer[bPtr++] = b.rawQuantity;
            }
        };

        packBins(slice.askBins);
        // Ensure we don't overflow the fixed slice allocation
        bPtr = bBase + (this.MAX_BINS_PER_SLICE / 2) * 3;
        packBins(slice.bidBins);

        // 3. Pack Thresholds
        const tBase = idx * 10;
        for (let i = 0; i < 5; i++) {
            this.thresholdBuffer[tBase + i] = slice.askVolumeThresholds[i] || 0;
            this.thresholdBuffer[tBase + 5 + i] = slice.bidVolumeThresholds[i] || 0;
        }

        this.historyWriteIdx = (this.historyWriteIdx + 1) % this.MAX_HISTORY;
        if (this.historyCount < this.MAX_HISTORY) this.historyCount++;
    }

    private initialise(canvas: OffscreenCanvas): void {
        this.mainCanvas = canvas;
        this.mainCtx = this.mainCanvas.getContext('2d', { alpha: false });
        if (!this.mainCtx) {
            logError('RENDER', 'Failed to acquire OffscreenCanvas 2D context.');
            throw new Error('Failed to acquire OffscreenCanvas 2D context.');
        }
        logInfo('RENDER', 'OffscreenCanvas initialised.');
    }

    private resizeTrackerCanvas(): void {
        if (!this.mainCanvas || !this.mainCtx) return;

        const intShiftX = Math.ceil(this.getShiftX());
        // Tracker canvas needs an extra column width so it can be smoothly panned without cutting off the left edge
        this.trackerCanvas = new OffscreenCanvas(this.width + intShiftX, this.height);
        this.trackerCtx = this.trackerCanvas.getContext('2d', { alpha: false });

        if (this.trackerCtx) {
            this.trackerCtx.fillStyle = '#ffffff';
            this.trackerCtx.fillRect(0, 0, this.width + intShiftX, this.height);
        }

        this.columnImageData = new ImageData(intShiftX, this.height);
        this.columnDataView = new Uint32Array(this.columnImageData.data.buffer);

        // Scratchpad of Float32 vectors for smooth R, G, B blending
        this.columnScratchpad = new Float32Array(this.height * 3);
        this.coverageScratchpad = new Float32Array(this.height);
        
        this.needsFullRedraw = true;
    }

    private handleResize(physicalWidth: number, physicalHeight: number, dpr: number): void {
        if (!this.mainCanvas || !this.mainCtx) return;

        this.pixelRatio = dpr;
        this.width = physicalWidth;
        this.height = physicalHeight;

        this.mainCanvas.width = this.width;
        this.mainCanvas.height = this.height;

        this.resizeTrackerCanvas();

        this.mainCtx.fillStyle = '#ffffff';
        this.mainCtx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Executes the Shift-and-Draw pipeline for a newly arrived HeatmapSlice on the TrackerCanvas.
     * Uses Sub-Pixel exact float coverage algorithms for blending fractional boundaries.
     */
    private drawSlice(slice: HeatmapSlice): void {
        if (!this.trackerCtx || !this.columnImageData || !this.columnDataView || !this.columnScratchpad || !this.trackerCanvas) return;

        const shiftX = this.getShiftX();

        // Out-of-Bounds Clearance — flush tracker if price jumps more than half the viewport
        if (
            this.previousCentrePrice !== 0 &&
            Math.abs(this.centrePrice - this.previousCentrePrice) > this.priceSpanVisible / 2 &&
            this.isAutoCentring
        ) {
            this.needsFullRedraw = true;
        }

        // 2. Decide if we can use the fast shift-path or need a full redraw
        if (this.needsFullRedraw) {
            this.redrawEntireBuffer();
        } else {
            const intShiftX = Math.ceil(shiftX);
            // Shift Tracker Canvas left by one column
            this.trackerCtx.drawImage(this.trackerCanvas, -intShiftX, 0);
            
            const historyIdx = (this.historyWriteIdx - 1 + this.MAX_HISTORY) % this.MAX_HISTORY;
            const { volume, side } = this.drawHistorySliceAtX(historyIdx, this.width, intShiftX);

            // Draw the mid-price line segment for this frame
            if (this.historyCount > 1 && slice.midPrice > 0) {
                const prevIdx = (this.historyWriteIdx - 2 + this.MAX_HISTORY) % this.MAX_HISTORY;
                const prevMidPrice = this.metadataBuffer[prevIdx * 4 + 1];

                if (prevMidPrice > 0) {
                    this.trackerCtx.beginPath();
                    this.trackerCtx.setLineDash([5, 5]);
                    this.trackerCtx.moveTo(this.width - intShiftX + (intShiftX / 2), this.priceToY(prevMidPrice));
                    this.trackerCtx.lineTo(this.width + (intShiftX / 2), this.priceToY(slice.midPrice));
                    this.trackerCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; 
                    this.trackerCtx.lineWidth = Math.max(2, Math.floor(this.pixelRatio));
                    this.trackerCtx.lineCap = 'round';
                    this.trackerCtx.stroke();
                    this.trackerCtx.setLineDash([]);
                }
            }

            this.reportViewportUpdate(slice.timestamp, volume, side, slice.askVolumeThresholds, slice.bidVolumeThresholds);
        }

        this.previousCentrePrice = this.centrePrice;

        // Record timestamp for animation
        this.lastSliceTime = performance.now();
    }

    private redrawEntireBuffer(): void {
        if (!this.trackerCtx || !this.columnImageData || !this.columnDataView || !this.columnScratchpad || !this.trackerCanvas) return;

        const shiftX = this.getShiftX();
        const intShiftX = Math.ceil(shiftX);

        // Clear entire canvas
        this.trackerCtx.fillStyle = '#ffffff';
        this.trackerCtx.fillRect(0, 0, this.width + intShiftX, this.height);

        // Iterate backwards from the newest slice on the right
        let currentX = this.width;
        let lastPinnedVol: number | null = null;
        let lastPinnedSide: 'bid' | 'ask' | null = null;
        let lastTimestamp = 0;
        let lastAskThresholds: number[] | undefined;
        let lastBidThresholds: number[] | undefined;

        for (let i = 0; i < this.historyCount; i++) {
            const logicalIdx = (this.historyWriteIdx - 1 - i + this.MAX_HISTORY) % this.MAX_HISTORY;
            const { volume, side } = this.drawHistorySliceAtX(logicalIdx, currentX, intShiftX);

            if (i === 0) {
                lastPinnedVol = volume;
                lastPinnedSide = side;
                lastTimestamp = this.metadataBuffer[logicalIdx * 5];
                
                const tBase = logicalIdx * 10;
                lastAskThresholds = Array.from(this.thresholdBuffer.subarray(tBase, tBase + 5));
                lastBidThresholds = Array.from(this.thresholdBuffer.subarray(tBase + 5, tBase + 10));
            }

            currentX -= shiftX;
            if (currentX < -shiftX) break; // Stop if we've rendered past the left edge
        }

        // Draw the continuous mid-price line over the newly redrawn buffer
        if (this.historyCount > 0) {
            this.trackerCtx.beginPath();
            this.trackerCtx.setLineDash([5, 5]);
            let hasStarted = false;
            
            for (let i = 0; i < this.historyCount; i++) {
                const logicalIdx = (this.historyWriteIdx - this.historyCount + i + this.MAX_HISTORY) % this.MAX_HISTORY;
                const midPrice = this.metadataBuffer[logicalIdx * 5 + 1];
                if (midPrice === 0) continue;

                const offsetFromEnd = (this.historyCount - 1 - i);
                const sliceX = this.width - (offsetFromEnd * shiftX) + (shiftX / 2);
                const y = this.priceToY(midPrice);

                if (!hasStarted) {
                    this.trackerCtx.moveTo(sliceX, y);
                    hasStarted = true;
                } else {
                    this.trackerCtx.lineTo(sliceX, y);
                }
            }
            if (hasStarted) {
                this.trackerCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                this.trackerCtx.lineWidth = Math.max(2, Math.floor(this.pixelRatio));
                this.trackerCtx.lineJoin = 'round';
                this.trackerCtx.lineCap = 'round';
                this.trackerCtx.stroke();
            }
            this.trackerCtx.setLineDash([]);
        }

        this.needsFullRedraw = false;
        this.reportViewportUpdate(lastTimestamp, lastPinnedVol, lastPinnedSide, lastAskThresholds, lastBidThresholds);
    }

    private drawHistorySliceAtX(historyIdx: number, destinationX: number, shiftX: number): { volume: number | null, side: 'bid' | 'ask' | null } {
        if (!this.trackerCtx || !this.columnScratchpad || !this.trackerCanvas) return { volume: null, side: null };

        const intShiftX = Math.ceil(shiftX);
        const intDestX = Math.round(destinationX);

        if (!this.columnImageData || this.columnImageData.width !== intShiftX) {
            this.columnImageData = new ImageData(intShiftX, this.height);
            this.columnDataView = new Uint32Array(this.columnImageData.data.buffer);
        }

        const dataView = this.columnDataView!;
        const imgData = this.columnImageData!;
        this.columnScratchpad.fill(0);
        this.coverageScratchpad!.fill(0);
        dataView.fill(0xFFFFFFFF);

        const mBase = historyIdx * 5;
        const askCount = this.metadataBuffer[mBase + 2];
        const bidCount = this.metadataBuffer[mBase + 3];
        const historicalBinSize = this.metadataBuffer[mBase + 4];
        
        const halfSpan = this.priceSpanVisible / 2;
        const effectiveCentre = this.renderCentrePrice || this.centrePrice;
        const pricesPerPixel = this.priceSpanVisible / this.height;
        const topViewportPrice = effectiveCentre + halfSpan;

        let pinnedVolume: number | null = null;
        let pinnedSide: 'bid' | 'ask' | null = null;

        const bBase = historyIdx * this.MAX_BINS_PER_SLICE * 3;

        const renderBinsFromBuffer = (startPtr: number, count: number, palette: PaletteName, side: 'bid' | 'ask') => {
            for (let i = 0; i < count; i++) {
                const ptr = startPtr + i * 3;
                const lowerPriceBound = this.binBuffer[ptr];
                const aggregatedQuantity = this.binBuffer[ptr + 1];
                const rawQuantity = this.binBuffer[ptr + 2];

                if (aggregatedQuantity < this.minVolume) continue;

                const distanceFromTop = topViewportPrice - (lowerPriceBound + historicalBinSize);
                const exactYStart = distanceFromTop / pricesPerPixel;

                const exactHeight = historicalBinSize / pricesPerPixel;
                const exactYEnd = exactYStart + exactHeight;

                const yMin = Math.max(0, Math.floor(exactYStart));
                const yMax = Math.min(this.height - 1, Math.floor(exactYEnd));

                if (yMin >= this.height || yMax < 0) continue;

                const rgb = this.getRGBForIntensity(aggregatedQuantity, palette);

                for (let y = yMin; y <= yMax; y++) {
                    const coverage = Math.max(0, Math.min(y + 1, exactYEnd) - Math.max(y, exactYStart));
                    if (coverage > 0) {
                        const idx = y * 3;
                        const scratch = this.columnScratchpad!;
                        // Old way
                        // scratch[idx] = scratch[idx] * (1 - coverage) + rgb[0] * coverage;
                        // scratch[idx + 1] = scratch[idx + 1] * (1 - coverage) + rgb[1] * coverage;
                        // scratch[idx + 2] = scratch[idx + 2] * (1 - coverage) + rgb[2] * coverage;

                        // New way
                        scratch[idx] += rgb[0] * coverage;
                        scratch[idx + 1] += rgb[1] * coverage;
                        scratch[idx + 2] += rgb[2] * coverage;
                        this.coverageScratchpad![y] += coverage;
                    }
                }

                if (this.pinnedPrice !== null && this.pinnedPrice >= lowerPriceBound && this.pinnedPrice < lowerPriceBound + this.binSize) {
                    pinnedVolume = rawQuantity;
                    pinnedSide = side;
                }
            }
        };

        renderBinsFromBuffer(bBase, askCount, 'magma', 'ask');
        renderBinsFromBuffer(bBase + (this.MAX_BINS_PER_SLICE / 2) * 3, bidCount, 'viridis', 'bid');

        for (let y = 0; y < this.height; y++) {
            const idx = y * 3;
            const cov = Math.min(1, this.coverageScratchpad![y]);
            const remainder = 1 - cov; // Any uncovered space in the pixel stays white
            // Old way
            // const r = Math.round(this.columnScratchpad[idx]);
            // const g = Math.round(this.columnScratchpad[idx + 1]);
            // const b = Math.round(this.columnScratchpad[idx + 2]);
            // New way
            const r = Math.min(255, Math.round(this.columnScratchpad![idx] + 255 * remainder));
            const g = Math.min(255, Math.round(this.columnScratchpad![idx + 1] + 255 * remainder));
            const b = Math.min(255, Math.round(this.columnScratchpad![idx + 2] + 255 * remainder));

            const c32 = this.packRGB([r, g, b]);
            const rowOffset = y * intShiftX;
            for (let x = 0; x < intShiftX; x++) dataView[rowOffset + x] = c32;
        }

        this.trackerCtx.putImageData(imgData, intDestX, 0);
        return { volume: pinnedVolume, side: pinnedSide };
    }

    private priceToY(price: number): number {
        const halfSpan = this.priceSpanVisible / 2;
        const effectiveCentre = this.centrePrice;
        const topViewportPrice = effectiveCentre + halfSpan;
        const pricesPerPixel = this.priceSpanVisible / this.height;
        return (topViewportPrice - price) / pricesPerPixel;
    }

    private reportViewportUpdate(
        timestamp: number, 
        pinnedVolume: number | null, 
        pinnedSide: 'bid' | 'ask' | null,
        askVolumeThresholds?: readonly number[], 
        bidVolumeThresholds?: readonly number[]
    ): void {
        this.latestTimestamp = timestamp;
        const latency = timestamp ? (Date.now() - timestamp) : 0;
        const shiftX = this.getShiftX();
        const timeRangeMs = (this.width / shiftX) * 100;

        postMessage({
            type: 'VIEWPORT_UPDATE',
            payload: {
                centrePrice: this.centrePrice,
                midPrice: this.midPrice,
                priceSpan: this.priceSpanVisible,
                pinnedVolume,
                pinnedSide,
                latency,
                latestTimestamp: this.latestTimestamp,
                timeScale: this.timeScale,
                timeRangeMs,
                askVolumeThresholds,
                bidVolumeThresholds
            }
        });
    }

    /**
     * requestAnimationFrame tick for Horizontal Flow Smoothing
     */
    private renderLoop(time: number): void {
        requestAnimationFrame(this.renderLoop);
        if (!this.mainCtx || !this.trackerCanvas) return;

        const shiftX = this.getShiftX();
        const intShiftX = Math.ceil(shiftX);
        const elapsed = time - this.lastSliceTime;

        // At 100ms elapsed, progress = 1.0 (fully slid left)
        const progress = Math.min(1, elapsed / 100);

        // Offset starts at +intShiftX, and smoothly glides to 0 as 100ms passes
        const currentOffset = intShiftX * (1 - progress);

        // We draw the tracker canvas shifted left by `intShiftX` to discard the leftmost "buffer" column
        this.mainCtx.drawImage(this.trackerCanvas, -intShiftX + currentOffset, 0);

        // Draw horizontal reference line at latest midPrice
        if (this.midPrice > 0) {
            const y = this.priceToY(this.midPrice);
            this.mainCtx.beginPath();
            this.mainCtx.setLineDash([5, 5]);
            this.mainCtx.moveTo(0, y);
            this.mainCtx.lineTo(this.width, y);
            this.mainCtx.strokeStyle = '#FF00FF'; // Bright Pink to stand out from heatmap colours
            this.mainCtx.lineWidth = 3;

            this.mainCtx.stroke();
            this.mainCtx.setLineDash([]); // Reset dash for other draws
        }

        this.fpsCounter++;
    }

    /**
     * Discrete Band Lookup for "Weather Radar" style.
     * Intensity was already quantised to (1/N, 2/N, ... N/N) in the DataWorker.
     */
    private getRGBForIntensity(intensity: number, palette: PaletteName): RGB {
        const bands = PALETTE_BANDS[palette];
        const levels = bands.length; // Will be 5
        // Calculate the discrete level (1 to N)
        const level = Math.round(intensity * levels);
        // Clamp to valid array indices (0 to N-1)
        const index = Math.max(0, Math.min(levels - 1, level - 1));
        return bands[index];
    }

    /**
     * Packs an RGB array into a Little-Endian 32-bit ABGR integer
     * for direct Uint32Array buffer manipulation.
     */
    private packRGB(rgb: readonly number[]): number {
        const r = rgb[0] & 0xFF;
        const g = rgb[1] & 0xFF;
        const b = rgb[2] & 0xFF;
        // AAAAAAAA BBBBBBBB GGGGGGGG RRRRRRRR (Little Endian)
        return (255 << 24) | (b << 16) | (g << 8) | r;
    }
}

// Initialise the Renderer background worker
new HeatmapRenderer();
