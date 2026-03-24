// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { For } from 'solid-js';
import { PALETTE_BANDS } from '../engine/palettes';
import type { PaletteName } from '../engine/types';

interface AdaptiveLegendProps {
    askVolumeThresholds: readonly number[];
    bidVolumeThresholds: readonly number[];
    magmaReverse?: boolean;
}

export function AdaptiveLegend(props: AdaptiveLegendProps) {
    const formatVolume = (vol: number | undefined) => {
        if (vol === undefined) return '-';
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}k`;
        if (vol === 0) return '0';
        return vol.toFixed(1);
    };

    return (
        <div style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '12px',
            height: '100%',
            width: '100%',
            'box-sizing': 'border-box',
        }}>
            {/* ---- Asks (Magma) ---- */}
            <LegendSection
                title="Asks"
                paletteName="magma"
                thresholds={props.askVolumeThresholds}
                reverse={props.magmaReverse ?? false}
                format={formatVolume}
            />

            {/* ---- Bids (Viridis) ---- */}
            <LegendSection
                title="Bids"
                paletteName="viridis"
                thresholds={props.bidVolumeThresholds}
                reverse={false}
                format={formatVolume}
            />
        </div>
    );
}

interface LegendSectionProps {
    title: string;
    paletteName: PaletteName;
    thresholds: readonly number[];
    reverse: boolean;
    format: (v: number | undefined) => string;
}

function LegendSection(props: LegendSectionProps) {
    const palette = PALETTE_BANDS[props.paletteName];
    
    // We want to render the colours in a vertical stack.
    // By default (to top), the first colour in PALETTE_BANDS (dark) is at the bottom.
    // If reverse (to bottom), the first colour (dark) is at the top.
    
    const displayPalette = () => {
        // PALETTE_BANDS[0] is dark, PALETTE_BANDS[4] is bright.
        // For a vertical legend:
        // Default (to top): Bright [4] at top, Dark [0] at bottom.
        // Reverse (to bottom): Dark [0] at top, Bright [4] at bottom.
        const p = [...palette];
        return props.reverse ? p : p.reverse();
    };

    const displayThresholds = () => {
        // thresholds[0] is lowest vol (dark), thresholds[4] is highest (bright).
        // Default: Bright [4] top, Dark [0] bottom.
        // Reverse: Dark [0] top, Bright [4] bottom.
        const t = [...props.thresholds];
        return props.reverse ? t : t.reverse();
    };

    return (
        <div style={{
            display: 'flex',
            'flex-direction': 'column',
            flex: 1,
            'align-items': 'center',
            width: '100%',
        }}>
            <div style={{ 
                'font-size': '10px', 
                'font-weight': 800, 
                color: '#3b82f6', 
                'text-transform': 'uppercase',
                'margin-bottom': '6px',
                'text-align': 'center',
                'letter-spacing': '0.05em',
                opacity: 0.8
            }}>
                {props.title}
            </div>

            <div style={{
                display: 'flex',
                'flex-direction': 'column',
                flex: 1,
                width: '100%',
                gap: '3px',
            }}>
                <For each={displayPalette()}>
                    {(colour, i) => (
                        <div style={{
                            display: 'flex',
                            'align-items': 'center',
                            flex: 1,
                            width: '100%',
                            gap: '8px',
                        }}>
                            <div style={{
                                width: '12px',
                                height: '100%',
                                background: `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})`,
                                'border-radius': '3px',
                                'min-height': '6px',
                                'box-shadow': 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
                            }} />
                            <span style={{
                                'font-size': '10px',
                                'font-weight': 700,
                                color: '#94a3b8',
                                'font-family': "'Inter', system-ui, sans-serif",
                                'white-space': 'nowrap',
                                opacity: 0.9
                            }}>
                                {props.format(displayThresholds()[i()])}
                            </span>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}
