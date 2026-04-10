import type { HeatmapBin, HeatmapSlice, OrderBookStore, Price, Quantity, Timestamp } from './types';

/**
 * The maximum price index supported by the flat bin buffer.
 * Covers BTC/USDT up to $500,000 with binSize = 1.
 * Cost: 200,000 × 8 bytes = 1.6 MB, allocated once per worker lifetime.
 */
const MAX_BIN_INDEX = 200_000;
/**
 * Maximum number of unique price bins we can track in a single slice.
 * Covers extremely fragmented books or high-depth renders.
 */
const MAX_ACTIVE_BINS = 20_000;

/**
 * HeatmapProcessor handles the transformation of raw order book data into
 * normalised heatmap slices. It implements high-performance binning and
 * rank-based normalisation algorithms.
 */
export class HeatmapProcessor {
    /**
     * Pre-allocated flat quantity accumulators for bids and asks.
     * Index = Math.floor(price / binSize). Zero-filled at construction; only
     * written indices are reset between calls, so the full buffer is never
     * iterated on the hot path.
     */
    private readonly askBinBuffer = new Float64Array(MAX_BIN_INDEX);
    private readonly bidBinBuffer = new Float64Array(MAX_BIN_INDEX);

    /**
     * Tracks which indices of buffers were written in the current call,
     * so that only those entries need zeroing after the pass — avoiding a
     * full 1.6 MB memset on every tick. Split by side.
     */
    private readonly askActiveIndices = new Int32Array(MAX_ACTIVE_BINS);
    private askActiveCount = 0;

    private readonly bidActiveIndices = new Int32Array(MAX_ACTIVE_BINS);
    private bidActiveCount = 0;

    /**
     * Transforms an OrderBookStore into a normalised HeatmapSlice for rendering.
     * Uses optimised for-loops to minimise garbage collection in the hot path.
     *
     * @param book - The current state of the order book.
     * @param binSize - The vertical aggregation size in USD.
     * @param timestamp - The timestamp of the market event.
     * @param midPrice - The current mid-price.
     * @param depth - The maximum depth to process (default 5000).
     * @returns A processed heatmap slice ready for rendering.
     */
    public processSlice(
        book: OrderBookStore,
        binSize: number,
        timestamp: Timestamp,
        midPrice: number,
        depth: number = 5000
    ): HeatmapSlice {
        this.calculateBins(book, binSize, depth);
        const askData = this.normaliseVolumeByRank(this.askBinBuffer, this.askActiveIndices, this.askActiveCount, binSize);
        const bidData = this.normaliseVolumeByRank(this.bidBinBuffer, this.bidActiveIndices, this.bidActiveCount, binSize);
        this.resetBuffers();

        return {
            timestamp,
            midPrice,
            askBins: askData.bins,
            bidBins: bidData.bins,
            askVolumeThresholds: askData.thresholds,
            bidVolumeThresholds: bidData.thresholds
        };
    }

    /**
     * Aggregates fine-grained order book price levels into the pre-allocated
     * flat buffer. Operates in O(N) time with zero heap allocations.
     *
     * @param book - The source order book data.
     * @param binSize - The aggregation bin size.
     * @param depth - Maximum depth limit.
     */
    private calculateBins(book: OrderBookStore, binSize: number, depth: number): void {
        // Process Asks
        const askPrices = book.asks.prices;
        const askQuantities = book.asks.quantities;
        const askLimit = Math.min(askPrices.length, depth);
        for (let i = 0; i < askLimit; i++) {
            const binIndex = Math.floor(askPrices[i] / binSize);
            // CRITICAL: Boundary guard prevents NaN poisoning from OOB access
            if (binIndex >= 0 && binIndex < MAX_BIN_INDEX) {
                if (this.askBinBuffer[binIndex] === 0) {
                    // CRITICAL: Prevent tracking index overflow
                    if (this.askActiveCount < MAX_ACTIVE_BINS) {
                        this.askActiveIndices[this.askActiveCount++] = binIndex;
                        this.askBinBuffer[binIndex] = askQuantities[i];
                    }
                } else {
                    this.askBinBuffer[binIndex] += askQuantities[i];
                }
            }
        }

        // Process Bids
        const bidPrices = book.bids.prices;
        const bidQuantities = book.bids.quantities;
        const bidLimit = Math.min(bidPrices.length, depth);
        for (let i = 0; i < bidLimit; i++) {
            const binIndex = Math.floor(bidPrices[i] / binSize);
            if (binIndex >= 0 && binIndex < MAX_BIN_INDEX) {
                if (this.bidBinBuffer[binIndex] === 0) {
                    if (this.bidActiveCount < MAX_ACTIVE_BINS) {
                        this.bidActiveIndices[this.bidActiveCount++] = binIndex;
                        this.bidBinBuffer[binIndex] = bidQuantities[i];
                    }
                } else {
                    this.bidBinBuffer[binIndex] += bidQuantities[i];
                }
            }
        }
    }

    /**
     * Applies rank normalisation — the theoretically optimal transform for
     * power-law distributed order book volumes.
     *
     * 5-step discrete quantisation (Weather Radar style) is applied.
     * Optimised to sort indices in-place on a TypedArray subarray, reducing GC pressure.
     *
     * @param buffer - The flat quantity buffer.
     * @param activeIndices - Indices that contain non-zero quantities.
     * @param activeCount - Number of active indices.
     * @param binSize - The bin size for bound calculation.
     * @returns Normalised bins and volume thresholds.
     */
    private normaliseVolumeByRank(
        buffer: Float64Array,
        activeIndices: Int32Array,
        activeCount: number,
        binSize: number
    ): { bins: HeatmapBin[], thresholds: number[] } {
        if (activeCount === 0) return { bins: [], thresholds: [0, 0, 0, 0, 0] };

        // 1. Sort a view of the active indices by their quantity in the buffer
        // Sorting the TypedArray view directly avoids creating thousands of {qty, binIndex} objects
        const sortedView = activeIndices.subarray(0, activeCount);
        sortedView.sort((a, b) => buffer[a] - buffer[b]);

        // 2. Assign rank-based intensity and build result bins
        const results: HeatmapBin[] = new Array(activeCount);
        const thresholds = [0, 0, 0, 0, 0];
        let currentLevel = 1;

        for (let rank = 0; rank < activeCount; rank++) {
            const binIndex = sortedView[rank];
            const qty = buffer[binIndex];
            const baseIntensity = (rank + 1) / activeCount;

            // Discrete Quantisation: "Snaps" to 5 discrete levels for a Weather Radar effect
            const level = Math.ceil(baseIntensity * 5);
            const intensity = (level / 5) as Quantity;
            
            // Capture the minimum volume for each level
            while (currentLevel <= level && currentLevel <= 5) {
                thresholds[currentLevel - 1] = qty;
                currentLevel++;
            }

            const lowerBound = (binIndex * binSize) as Price;

            results[rank] = {
                lowerPriceBound: lowerBound,
                upperPriceBound: (lowerBound + binSize) as Price,
                aggregatedQuantity: intensity,
                rawQuantity: qty as Quantity
            };
        }

        // Fallback for cases with very few points: fill remaining levels with the max volume
        while (currentLevel <= 5) {
            thresholds[currentLevel - 1] = buffer[sortedView[activeCount - 1]];
            currentLevel++;
        }

        return { bins: results, thresholds };
    }

    /**
     * Zeroes only the indices that were written during this tick.
     * O(active levels) — never O(MAX_BIN_INDEX).
     */
    private resetBuffers(): void {
        for (let i = 0; i < this.askActiveCount; i++) {
            this.askBinBuffer[this.askActiveIndices[i]] = 0;
        }
        this.askActiveCount = 0;

        for (let i = 0; i < this.bidActiveCount; i++) {
            this.bidBinBuffer[this.bidActiveIndices[i]] = 0;
        }
        this.bidActiveCount = 0;
    }
}
