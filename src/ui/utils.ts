// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

/**
 * Pure coordinate helper \u2014 converts a CSS-pixel Y offset inside the canvas
 * into the nearest $1 price bin boundary.
 *
 * Maths:
 *   The canvas renders prices top-to-bottom from (centrePrice + priceSpan/2)
 *   down to (centrePrice \u2212 priceSpan/2).  A click at clickYCss pixels from
 *   the canvas top maps to:
 *     rawPrice = topPrice \u2212 (clickYCss / canvasHeightCss) * priceSpan
 *
 * @param clickYCss - The Y coordinate of the click in CSS pixels.
 * @param canvasHeightCss - The total height of the canvas in CSS pixels.
 * @param centrePrice - The current centre price of the viewport.
 * @param priceSpan - The total price range visible in the viewport.
 * @returns The price corresponding to the click Y coordinate.
 */
export function cssYToPrice(
    clickYCss: number,
    canvasHeightCss: number,
    centrePrice: number,
    priceSpan: number,
): number {
    const topPrice = centrePrice + priceSpan / 2;
    const fraction = clickYCss / canvasHeightCss;       // 0 = top, 1 = bottom
    const rawPrice = topPrice - fraction * priceSpan;

    // Snap to the nearest $1 bin and ensure non-negative
    return Math.max(0, Math.round(rawPrice));
}

/**
 * Coordinate helper — converts a raw price back to a CSS-pixel Y offset.
 *
 * @param price - The price to convert.
 * @param canvasHeightCss - The total height of the canvas in CSS pixels.
 * @param centrePrice - The current centre price of the viewport.
 * @param priceSpan - The total price range visible in the viewport.
 * @returns The Y coordinate in CSS pixels.
 */
export function priceToCssY(
    price: number,
    canvasHeightCss: number,
    centrePrice: number,
    priceSpan: number,
): number {
    const topPrice = centrePrice + priceSpan / 2;
    const fraction = (topPrice - price) / priceSpan;
    return fraction * canvasHeightCss;
}

/**
 * WebSocket readyState \u2192 human-readable label
 *
 * @param state - The numeric WebSocket readyState.
 * @returns A human-readable string representation of the state.
 */
export function wsReadyStateLabel(state: number): string {

    const labels: Record<number, string> = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED',
    };
    return labels[state] ?? 'UNKNOWN';
}
