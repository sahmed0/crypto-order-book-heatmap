// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { createMemo, Show } from 'solid-js';

/**
 * Props for the PricePin component.
 */
export interface PricePinProps {
    /** The pinned price level in USD, or null if no pin is active. */
    pinnedPrice: () => number | null;
    /** Whether the pinned price is on the Bid or Ask side. */
    pinnedSide: () => 'bid' | 'ask' | null;
    /** Live centre price received from the RenderWorker viewport update. */
    centrePrice: () => number;
    /** Vertical price range visible on the canvas, in USD. */
    priceSpan: () => number;
    /** CSS height of the canvas element in logical pixels. */
    canvasHeightCss: () => number;
}

/**
 * Renders a horizontal overlay line fixed to a pinned price level.
 *
 * ## Accuracy Invariant
 * The pin stores the price value, not a pixel offset. The Y position is
 * re-computed every render cycle via the formula:
 *
 *   pinY_css = ((centrePrice + priceSpan/2) - pinnedPrice) / (priceSpan / canvasHeightCss)
 *
 * Because `centrePrice` and `priceSpan` are always current (echoed from the
 * RenderWorker on every frame), the line auto-corrects after:
 *   - The price scrolling in either direction.
 *   - The user resizing the window (canvasHeightCss updates via ResizeObserver).
 *   - A price jump that clears the canvas.
 *
 * The overlay lives in the main-thread DOM and is composited independently,
 * meaning it never causes a repaint inside the OffscreenCanvas.
 *
 * @param props - Component properties.
 * @returns A reactive price pin overlay.
 */
export default function PricePin(props: PricePinProps) {
    /** Y position in CSS pixels from the top of the canvas wrapper. */
    const pinYCss = createMemo(() => {
        const price = props.pinnedPrice();
        if (price === null) return null;

        const topPrice = props.centrePrice() + props.priceSpan() / 2;
        const pricesPerPx = props.priceSpan() / props.canvasHeightCss();
        const y = (topPrice - price) / pricesPerPx;

        // Clamp to visible area with a small margin
        return Math.max(0, Math.min(props.canvasHeightCss(), y));
    });

    const formattedPrice = createMemo(() => {
        const p = props.pinnedPrice();
        if (p === null) return '';
        
        const span = props.priceSpan();
        let decimals = 0;
        if (span > 0) {
            const idealSpacing = span / 8;
            const magnitude = Math.pow(10, Math.floor(Math.log10(idealSpacing)));
            let interval = magnitude;
            if (idealSpacing / magnitude >= 5) interval = magnitude * 5;
            else if (idealSpacing / magnitude >= 2) interval = magnitude * 2;
            decimals = interval < 1 ? Math.abs(Math.floor(Math.log10(interval))) : 0;
        }

        return `$${p.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals})}`;
    });

    const pinColour = createMemo(() => {
        const side = props.pinnedSide();
        if (side === 'ask') return '#ef4444'; // Red for Ask
        if (side === 'bid') return '#22c55e'; // Green for Bid
        return '#00FFFF'; // Cyan default
    });

    return (
        <Show when={pinYCss() !== null}>
            <div
                aria-label={`Pinned price: ${formattedPrice()}`}
                style={{
                    position: 'absolute',
                    left: '0',
                    right: '0',
                    top: `${pinYCss()}px`,
                    'pointer-events': 'none',
                    'z-index': 15,
                }}
            >
                {/* Dashed horizontal rule: matches the 3-physical-pixel width and [5,5] dash of the reference line */}
                <div style={{
                    width: '100%',
                    height: `${3 / (window.devicePixelRatio || 1)}px`,
                    'background-image': `linear-gradient(to right, ${pinColour()} 50%, transparent 50%)`,
                    'background-size': `${10 / (window.devicePixelRatio || 1)}px 100%`,
                    'background-repeat': 'repeat-x',
                    'transform': 'translateY(-50%)',
                }} />

                {/* Price label at the right edge over the axis */}
                <div style={{
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    transform: 'translateY(-50%)',
                    background: pinColour(),
                    padding: '2px 4px',
                    'border-radius': '2px',
                    'font-family': "'Inter', 'Segoe UI', monospace",
                    'font-size': '11px',
                    'font-weight': '600',
                    color: '#000000',
                    'white-space': 'nowrap',
                    'margin-left': '4px',
                    'z-index': 20,
                }}>
                    {formattedPrice()}
                </div>
            </div>
        </Show>
    );
}
