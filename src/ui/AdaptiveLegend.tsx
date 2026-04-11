// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { For } from 'solid-js';
import { PALETTE_BANDS } from '../engine/palettes';
import type { PaletteName } from '../engine/types';
import styles from './AdaptiveLegend.module.css';

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
        <div class={styles.legendWrapper}>
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
    
    const displayPalette = () => {
        const p = [...palette];
        return props.reverse ? p : p.reverse();
    };

    const displayThresholds = () => {
        const t = [...props.thresholds];
        return props.reverse ? t : t.reverse();
    };

    return (
        <div class={styles.section}>
            <div class={styles.title}>
                {props.title}
            </div>

            <div class={styles.list}>
                <For each={displayPalette()}>
                    {(colour, i) => (
                        <div class={styles.item}>
                            <div class={styles.colourBox} style={{ background: `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})` }} />
                            <span class={styles.valueText}>
                                {props.format(displayThresholds()[i()])}
                            </span>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}
