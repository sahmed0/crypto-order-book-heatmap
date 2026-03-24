/**
 * Core utility functions for managing the order book using high-performance parallel arrays.
 * This file encapsulates the complex logic of maintaining sorted arrays and binary
 * searching, keeping the state management in the worker clean.
 */

import type { OrderBookSide } from './types';

/**
 * Creates an empty order book side.
 */
export function createOrderBookSide(): OrderBookSide {
    return {
        prices: [],
        quantities: []
    };
}

/**
 * Performs a binary search on the sorted prices array.
 * @param prices The sorted array of prices.
 * @param targetPrice The price to find.
 * @param isAscending True if asks (lowest first), false if bids (highest first).
 * @returns The index of the price if found, or -(insertion_point + 1) if not found.
 */
export function binarySearch(prices: readonly number[], targetPrice: number, isAscending: boolean): number {
    let low = 0;
    let high = prices.length - 1;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        const midVal = prices[mid];

        if (midVal === targetPrice) {
            return mid;
        }

        if (isAscending) {
            if (midVal < targetPrice) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        } else {
            if (midVal > targetPrice) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
    }

    // Return the bitwise complement of the insertion point.
    // This allows the caller to know exactly where to insert the new element
    // to maintain the sorted order.
    return ~(low);
}

/**
 * Updates an order book side with a new price and quantity.
 * If quantity is 0, the price level is removed.
 * If the price exists, the quantity is updated in place.
 * If the price does not exist, it is inserted at the correct sorted position.
 *
 * @param side The order book side to modify.
 * @param price The price to update.
 * @param quantity The new quantity.
 * @param isAscending True if asks (lowest first), false if bids (highest first).
 */
export function updateOrderBookSide(side: OrderBookSide, price: number, quantity: number, isAscending: boolean): void {
    const prices = side.prices;
    const quantities = side.quantities;

    // Find the current index or the insertion point
    const searchResult = binarySearch(prices, price, isAscending);

    if (searchResult >= 0) {
        // Price exists
        if (quantity === 0) {
            // Remove the price level
            prices.splice(searchResult, 1);
            quantities.splice(searchResult, 1);
        } else {
            // Update the quantity in place
            quantities[searchResult] = quantity;
        }
    } else {
        // Price does not exist
        if (quantity !== 0) {
            // Insert the new price level at the correct sorted position
            const insertionPoint = ~searchResult;
            prices.splice(insertionPoint, 0, price);
            quantities.splice(insertionPoint, 0, quantity);
        }
    }
}

/**
 * Prunes the order book side to the specified limit.
 * Since the arrays are always kept sorted, this is a simple O(1) truncation.
 *
 * @param side The order book side to prune.
 * @param limit The maximum number of levels to keep.
 */
export function pruneOrderBookSide(side: OrderBookSide, limit: number): void {
    if (side.prices.length > limit) {
        // Truncate the arrays to drop the worst prices
        side.prices.length = limit;
        side.quantities.length = limit;
    }
}
