import { createMemo, For, Show } from 'solid-js';
import { priceToCssY } from './utils';

/**
 * Props for the PriceAxis component.
 */
export interface PriceAxisProps {
    /** Accessor for the live centre price. */
    centrePrice: () => number;
    /** Accessor for the live mid-price. */
    midPrice: () => number;
    /** Accessor for the live price span. */
    priceSpan: () => number;
    /** Accessor for the canvas height in CSS pixels. */
    canvasHeightCss: () => number;
}

/**
 * Renders the vertical price axis labels and tick marks.
 *
 * @param props - Component properties.
 * @returns A reactive price axis component.
 */
export default function PriceAxis(props: PriceAxisProps) {
    const ticks = createMemo(() => {
        const height = props.canvasHeightCss();
        const span = props.priceSpan();
        const centre = props.centrePrice();

        if (height <= 0 || span <= 0) return [];

        const idealSpacing = span / 8;
        const magnitude = Math.pow(10, Math.floor(Math.log10(idealSpacing)));
        let interval = magnitude;
        if (idealSpacing / magnitude >= 5) interval = magnitude * 5;
        else if (idealSpacing / magnitude >= 2) interval = magnitude * 2;

        const minPrice = centre - span / 2;
        const maxPrice = centre + span / 2;

        const firstTick = Math.ceil(minPrice / interval) * interval;
        const result = [];

        // Determine decimal places for formatting based on interval magnitude
        const decimals = interval < 1 ? Math.abs(Math.floor(Math.log10(interval))) : 0;

        const epsilon = interval * 0.001;
        for (let p = firstTick; p <= maxPrice + epsilon; p += interval) {
            // Fix floating point representation issues like 0.05000000000000001
            const cleanP = parseFloat(p.toPrecision(12));
            const y = priceToCssY(cleanP, height, centre, span);
            result.push({ 
                price: cleanP, 
                label: cleanP.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
                y 
            });
        }

        return result;
    });

    const midPriceY = createMemo(() => {
        const mp = props.midPrice();
        if (mp === 0) return null;
        return priceToCssY(mp, props.canvasHeightCss(), props.centrePrice(), props.priceSpan());
    });

    const midPriceDecimals = createMemo(() => {
        const span = props.priceSpan();
        if (span === 0) return 2;
        const idealSpacing = span / 8;
        const magnitude = Math.pow(10, Math.floor(Math.log10(idealSpacing)));
        let interval = magnitude;
        if (idealSpacing / magnitude >= 5) interval = magnitude * 5;
        else if (idealSpacing / magnitude >= 2) interval = magnitude * 2;
        return interval < 1 ? Math.abs(Math.floor(Math.log10(interval))) + 1 : 2;
    });

    return (
        <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            'pointer-events': 'none',
            'font-family': "'Inter', system-ui, sans-serif",
            'font-size': '10px',
            'font-weight': '600',
            color: '#64748b',
            'user-select': 'none',
        }}>
            <For each={ticks()}>
                {(tick) => (
                    <div style={{
                        position: 'absolute',
                        top: `${tick.y}px`,
                        left: '0',
                        width: '100%',
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: '0',
                            left: '0',
                            width: '6px',
                            height: '1px',
                            background: 'rgba(59, 130, 246, 0.2)',
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: '0',
                            left: '10px',
                            transform: 'translateY(-50%)',
                            'white-space': 'nowrap',
                            opacity: 0.8,
                        }}>
                            ${tick.label}
                        </div>
                    </div>
                )}
            </For>

            <Show when={midPriceY() !== null}>
                <div style={{
                    position: 'absolute',
                    top: `${midPriceY()}px`,
                    left: '0',
                    width: '100%',
                    'z-index': 10,
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '0',
                        left: '20px',
                        width: '10px',
                        height: '2px',
                        background: '#FF00FF',
                        'border-radius': '1px',
                        'box-shadow': '0 0 8px rgba(59, 130, 246, 0.4)',
                    }} />
                    <div style={{
                        position: 'absolute',
                        top: '0',
                        left: '60%',
                        transform: 'translateY(-50%)',
                        'white-space': 'nowrap',
                        background: '#FF00FF',
                        color: '#ffffff',
                        padding: '3px 6px',
                        'border-radius': '6px',
                        'font-weight': '800',
                        'font-size': '10px',
                        'margin-left': '6px',
                        'box-shadow': '0 4px 12px rgba(59, 130, 246, 0.2)',
                    }}>
                        ${props.midPrice().toLocaleString(undefined, { minimumFractionDigits: midPriceDecimals(), maximumFractionDigits: midPriceDecimals() })}
                    </div>
                </div>
            </Show>
        </div>
    );
}
