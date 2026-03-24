import { createSignal, Show, For } from 'solid-js';

import { useHeatmap } from '../core/HeatmapContext';
import { activeSymbol, setActiveSymbol } from './store';
import { SUPPORTED_PAIRS } from '../engine/types';
import styles from './Controls.module.css';

/**
 * Props for the Controls component.
 */
export interface ControlsProps {
    /** Callback to clear the pinned price. */
    onUnpin: () => void;
    /** Accessor for the current auto-centring state. */
    isAutoCentring: () => boolean;
    /** Callback to re-enable auto-centring. */
    onAutoCentre: () => void;
}

const DEPTH_OPTIONS = [5, 10, 20, 50, 100, 500, 1000, 5000];
const BIN_SIZE_OPTIONS = [1, 5, 10, 50, 100];
const TIME_RANGE_OPTIONS = [5, 10, 15, 20, 30, 60, 120, 180];

/**
 * Side-panel containing the Liquidity Filter slider,
 * Colour Palette dropdown, and an active pin indicator.
 * UI-only \u2014 delegates all worker communication to the HeatmapService.
 *
 * @param props - Component properties.
 * @returns A reactive controls panel.
 */
export default function Controls(props: ControlsProps) {
    const service = useHeatmap();
    const [minVolume, setMinVolume] = createSignal(0);
    const [depth, setDepth] = createSignal(5000);
    const [binSize, setBinSize] = createSignal(10);
    const [timeRange, setTimeRange] = createSignal(10);

    const handleSymbolChange = (e: Event) => {
        const newSymbol = (e.target as HTMLSelectElement).value;
        setActiveSymbol(newSymbol);
        service.sendSymbol(newSymbol);
    };

    const handleVolumeInput = (e: Event) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        setMinVolume(value);
        service.sendMinVolume(value);
    };

    const handleDepthChange = (e: Event) => {
        const value = parseInt((e.target as HTMLSelectElement).value, 10);
        setDepth(value);
        service.sendDepth(value);
    };

    const handleBinSizeChange = (e: Event) => {
        const value = parseInt((e.target as HTMLSelectElement).value, 10);
        setBinSize(value);
        service.sendBinSize(value);
    };

    const handleTimeRangeChange = (e: Event) => {
        const value = parseInt((e.target as HTMLSelectElement).value, 10);
        setTimeRange(value);
        service.sendTimeRange(value);
    };

    return (
        <aside class={styles.panel} style={{
            position: 'relative',
            top: 'auto',
            right: 'auto',
            bottom: 'auto',
            left: 'auto',
            'box-shadow': '0 5px 5px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.2)',
        }}>
            <div style={{
                display: 'flex',
                'justify-content': 'space-between',
                'align-items': 'center',
                'margin-bottom': '2px',
                'padding-bottom': '10px',
                'border-bottom': '1px solid var(--panel-border)',
            }}>
                <div class={styles.panelTitle} style={{ padding: 0, margin: 0, border: 'none' }}>Controls</div>
            </div>

            {/* ---- Symbol ---- */}
            <div class={styles.controlRow}>
                <div class={styles.controlLabel}>
                    <span>Crypto Pair</span>
                </div>
                <select
                    id="symbol-select"
                    class={styles.select}
                    value={activeSymbol()}
                    onChange={handleSymbolChange}
                    aria-label="Symbol"
                >
                    <For each={SUPPORTED_PAIRS}>
                        {(s) => <option value={s}>{s}</option>}
                    </For>
                </select>
            </div>

            <div class={styles.divider} />

            {/* ---- Liquidity Filter ---- */}
            <div class={styles.controlRow}>
                <div class={styles.controlLabel}>
                    <span>Liquidity Filter</span>
                    <span class={styles.controlValue}>{(minVolume() * 100).toFixed(0)}%</span>
                </div>
                <input
                    id="liquidity-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={minVolume()}
                    onInput={handleVolumeInput}
                    class={styles.slider}
                    aria-label="Minimum volume threshold"
                />
            </div>

            <div class={styles.divider} />

            {/* ---- Order Book Depth ---- */}
            <div class={styles.controlRow}>
                <div class={styles.controlLabel}>
                    <span>Bid/Ask Order Depth</span>
                </div>
                <select
                    id="depth-select"
                    class={styles.select}
                    value={depth()}
                    onChange={handleDepthChange}
                    aria-label="Order book depth"
                >
                    {DEPTH_OPTIONS.map(d => (
                        <option value={d}>{d}</option>
                    ))}
                </select>
            </div>

            {/* ---- Aggregation (Bin Size) ---- */}
            <div class={styles.controlRow}>
                <div class={styles.controlLabel}>
                    <span>Price Aggregation (Bin Size)</span>
                </div>
                <select
                    id="bin-size-select"
                    class={styles.select}
                    value={binSize()}
                    onChange={handleBinSizeChange}
                    aria-label="Aggregation Bin Size"
                >
                    {BIN_SIZE_OPTIONS.map(s => (
                        <option value={s}>${s}</option>
                    ))}
                </select>
            </div>

            <div class={styles.divider} />

            {/* ---- Time Range ---- */}
            <div class={styles.controlRow}>
                <div class={styles.controlLabel}>
                    <span>Time Range</span>
                </div>
                <select
                    id="time-range-select"
                    class={styles.select}
                    value={timeRange()}
                    onChange={handleTimeRangeChange}
                    aria-label="Time Range"
                >
                    {TIME_RANGE_OPTIONS.map(s => (
                        <option value={s}>{s}s</option>
                    ))}
                </select>
            </div>

            <div class={styles.divider} />

            {/* ---- Auto Centre Button ---- */}
            <Show when={!props.isAutoCentring()}>
                <div style={{ display: 'flex', 'justify-content': 'center', 'margin-bottom': '12px' }}>
                    <button
                        onClick={props.onAutoCentre}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            'border-radius': '6px',
                            cursor: 'pointer',
                            'font-family': 'monospace',
                            'font-size': '12px',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
                    >
                        ⌖ Auto-Centre
                    </button>
                </div>
            </Show>
        </aside>
    );
}
