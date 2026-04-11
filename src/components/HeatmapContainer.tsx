// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { onCleanup, createSignal, Show, createEffect } from 'solid-js';
import { useHeatmapPipeline } from '../ui/useHeatmapPipeline';
import { cssYToPrice } from '../ui/utils';
import Controls from '../ui/Controls';
import PricePin from '../ui/PricePin';
import ProbeDashboard from './ProbeDashboard';
import PriceAxis from '../ui/PriceAxis';
import TimeAxis from '../ui/TimeAxis';
import { AdaptiveLegend } from '../ui/AdaptiveLegend';
import { MIN_PRICE_SPAN, MAX_PRICE_SPAN } from '../engine/types';
import { activeSymbol } from '../ui/store';
import { HeatmapProvider } from '../core/HeatmapContext';
import styles from './HeatmapContainer.module.css';

export default function HeatmapContainer() {
    // ---- DOM refs --------------------------------------------------------
    let canvasRef!: HTMLCanvasElement;
    let priceAxisRef!: HTMLDivElement;
    let timeAxisRef!: HTMLDivElement;

    // ---- Worker Pipeline State (Custom Hook) ------------------------------
    const {
        service, wsState, asksSize, bidsSize, isSyncing, canvasRes, fps,
        centrePrice, midPrice, priceSpan, pinnedVolume, pinnedSide, setPinnedVolume, canvasHeightCss, latency,
        latestTimestamp, timeRangeMs, askVolumeThresholds, bidVolumeThresholds
    } = useHeatmapPipeline(() => canvasRef);

    // ---- State --------------------------------------------------
    const [pinnedPrice, setPinnedPrice] = createSignal<number | null>(null);
    const [isAutoCentring, setIsAutoCentring] = createSignal(true);
    const [timeScale, setTimeScale] = createSignal(1);
    const [isSidebarOpen, setIsSidebarOpen] = createSignal(false);

    // ---- Canvas Interaction Handlers --------------------------------------
    createEffect(() => {
        const heatmapService = service();
        // Wait until service is ready AND DOM elements are rendered by the <Show> component
        if (!heatmapService || !canvasRef || !priceAxisRef || !timeAxisRef) return;

        const activePointers = new Map<number, { x: number; y: number }>();
        let lastY = 0;
        let dragDistance = 0;
        let lastPinchDistance: number | null = null;
        let lastPinchCentreY: number | null = null;

        const onTimeWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            const zoomSensitivity = e.ctrlKey ? 0.005 : 0.001;
            const zoomFactor = Math.exp(delta * zoomSensitivity);
            let newScale = Math.max(0.1, Math.min(10, timeScale() * zoomFactor));
            setTimeScale(newScale);
            heatmapService.sendTimeScale(newScale);
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.shiftKey) return onTimeWheel(e);
            
            if (e.ctrlKey) {
                const rect = canvasRef.getBoundingClientRect();
                const cursorY = e.clientY - rect.top;
                const ratioY = 0.5 - (cursorY / rect.height);
                const zoomSensitivity = 0.005;
                const zoomFactor = Math.exp(e.deltaY * zoomSensitivity);
                const oldSpan = priceSpan();
                let newSpan = oldSpan * zoomFactor;
                newSpan = Math.max(MIN_PRICE_SPAN, Math.min(MAX_PRICE_SPAN, newSpan));
                const newCentre = centrePrice() + ratioY * (oldSpan - newSpan);
                setIsAutoCentring(false);
                heatmapService.sendZoom(newSpan);
                heatmapService.sendPan(newCentre);
                } else {
                const canvasHeight = canvasRef.getBoundingClientRect().height;
                const priceDelta = (e.deltaY / canvasHeight) * priceSpan();
                const newCentre = centrePrice() - priceDelta;
                setIsAutoCentring(false);
                heatmapService.sendPan(newCentre);
                }
                };






        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size === 1) {
                lastY = e.clientY;
                dragDistance = 0;
            }
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.size === 1) {
                const deltaY = e.clientY - lastY;
                lastY = e.clientY;
                dragDistance += Math.abs(deltaY);
                const canvasHeight = canvasRef.getBoundingClientRect().height;
                const priceDelta = (deltaY / canvasHeight) * priceSpan();
                const newCentre = centrePrice() + priceDelta;
                setIsAutoCentring(false);
                heatmapService.sendPan(newCentre);
            } else if (activePointers.size === 2) {
                const pointers = Array.from(activePointers.values());
                const p1 = pointers[0];
                const p2 = pointers[1];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const centreY = (p1.y + p2.y) / 2;

                if (lastPinchDistance !== null && lastPinchCentreY !== null) {
                    const rect = canvasRef.getBoundingClientRect();
                    const oldSpan = priceSpan();
                    const safeDistance = Math.max(1, distance);
                    const pinchSensitivity = 5.0;
                    const zoomFactor = Math.pow(lastPinchDistance / safeDistance, pinchSensitivity);
                    let newSpan = oldSpan * zoomFactor;
                    newSpan = Math.max(MIN_PRICE_SPAN, Math.min(MAX_PRICE_SPAN, newSpan));
                    const cursorY = centreY - rect.top;
                    const ratioY = 0.5 - (cursorY / rect.height);
                    const deltaY = centreY - lastPinchCentreY;
                    const priceDelta = (deltaY / rect.height) * oldSpan;
                    const newCentre = centrePrice() + ratioY * (oldSpan - newSpan) + priceDelta;
                    setIsAutoCentring(false);
                    heatmapService.sendZoom(newSpan);
                    heatmapService.sendPan(newCentre);
                    dragDistance += Math.abs(distance - lastPinchDistance) + Math.abs(deltaY);
                }
                lastPinchDistance = distance;
                lastPinchCentreY = centreY;
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            activePointers.delete(e.pointerId);
            if (activePointers.size < 2) {
                lastPinchDistance = null;
                lastPinchCentreY = null;
            }
            if (activePointers.size === 1) {
                const remaining = Array.from(activePointers.values())[0];
                lastY = remaining.y;
            }
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

            if (activePointers.size === 0 && dragDistance <= 5) {
                const rect = canvasRef.getBoundingClientRect();
                const clickYCss = e.clientY - rect.top;
                const price = cssYToPrice(clickYCss, rect.height, centrePrice(), priceSpan());
                setPinnedPrice(price);
                setPinnedVolume(null);
                heatmapService.sendPinnedPrice(price);
            }
        };

        const onCanvasContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            setPinnedPrice(null);
            setPinnedVolume(null);
            heatmapService.sendPinnedPrice(null);
        };

        const onPointerCancel = (e: PointerEvent) => onPointerUp(e);

        canvasRef.addEventListener('wheel', onWheel, { passive: false });
        canvasRef.addEventListener('pointerdown', onPointerDown);
        canvasRef.addEventListener('pointermove', onPointerMove);
        canvasRef.addEventListener('pointerup', onPointerUp);
        canvasRef.addEventListener('pointercancel', onPointerCancel);
        canvasRef.addEventListener('contextmenu', onCanvasContextMenu);
        
        priceAxisRef.addEventListener('wheel', onWheel, { passive: false });
        priceAxisRef.addEventListener('pointerdown', onPointerDown);
        priceAxisRef.addEventListener('pointermove', onPointerMove);
        priceAxisRef.addEventListener('pointerup', onPointerUp);
        priceAxisRef.addEventListener('pointercancel', onPointerCancel);
        priceAxisRef.addEventListener('contextmenu', onCanvasContextMenu);

        timeAxisRef.addEventListener('wheel', onTimeWheel, { passive: false });

        onCleanup(() => {
            canvasRef.removeEventListener('wheel', onWheel);
            canvasRef.removeEventListener('pointerdown', onPointerDown);
            canvasRef.removeEventListener('pointermove', onPointerMove);
            canvasRef.removeEventListener('pointerup', onPointerUp);
            canvasRef.removeEventListener('pointercancel', onPointerCancel);
            canvasRef.removeEventListener('contextmenu', onCanvasContextMenu);
            
            priceAxisRef?.removeEventListener('wheel', onWheel);
            priceAxisRef?.removeEventListener('pointerdown', onPointerDown);
            priceAxisRef?.removeEventListener('pointermove', onPointerMove);
            priceAxisRef?.removeEventListener('pointerup', onPointerUp);
            priceAxisRef?.removeEventListener('pointercancel', onPointerCancel);
            priceAxisRef?.removeEventListener('contextmenu', onCanvasContextMenu);

            timeAxisRef?.removeEventListener('wheel', onTimeWheel);
        });
    });

    const onUnpin = () => {
        setPinnedPrice(null);
        setPinnedVolume(null);
        service()?.sendPinnedPrice(null);
    };

    const handleAutoCentre = () => {
        setIsAutoCentring(true);
        service()?.sendAutoCentre();
    };

    // ---- JSX --------------------------------------------------------------
    return (
        <div class={styles.container}>
            {/* Sidebar toggle button (mobile only) */}
            <button class={styles.toggleButton} onClick={() => setIsSidebarOpen(true)} aria-label="Toggle Settings">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>

            {/* Sidebar overlay (mobile only) */}
            <div 
                class={`${styles.sidebarOverlay} ${isSidebarOpen() ? styles.open : ''}`}
                onClick={() => setIsSidebarOpen(false)}
            />

            {/* ---- Left Sidebar: Controls, Pinned Info, Dashboard ---- */}
            <div class={`${styles.sidebar} ${isSidebarOpen() ? styles.open : ''}`}>
                <button class={styles.closeButton} onClick={() => setIsSidebarOpen(false)} aria-label="Close Settings">
                    ✕
                </button>
                {/* Ensure each child has width 100% or matches the container */}
                <div style={{ width: '100%' }}>
                    <Show when={service()}>
                        {(s) => (
                            <HeatmapProvider service={s()}>
                                <Controls
                                    onUnpin={onUnpin}
                                    isAutoCentring={isAutoCentring}
                                    onAutoCentre={handleAutoCentre}
                                />
                            </HeatmapProvider>
                        )}
                    </Show>
                </div>

                {/* ---- Pinned Price & Volume Bento Section ---- */}
                <div class={styles.bentoBox}>
                    <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '6px' }}>
                        <div style={{ 'font-weight': '800', color: '#3b82f6', 'font-size': '10px', 'letter-spacing': '0.12em', 'text-transform': 'uppercase', opacity: '0.8' }}>
                            PINNED LIQUIDITY
                        </div>
                        <Show when={pinnedPrice() !== null}>
                            <button
                                onClick={onUnpin}
                                style={{
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    width: '24px',
                                    height: '24px',
                                    display: 'flex',
                                    'align-items': 'center',
                                    'justify-content': 'center',
                                    'border-radius': '50%',
                                    'font-size': '10px',
                                    'font-weight': '800',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                                title="Unpin Price"
                            >
                                ✕
                            </button>
                        </Show>
                    </div>
                    <Show
                        when={pinnedPrice() !== null}
                        fallback={
                            <p style={{
                                'font-size': '12px',
                                color: '#64748b',
                                'line-height': '1.6',
                                'margin': '0',
                                'font-weight': '500',
                            }}>
                                <span style={{ color: '#3b82f6', 'font-weight': '700' }}>Click</span> the chart to pin a price level.<br />
                                <span style={{ color: '#3b82f6', 'font-weight': '700' }}>Right-click</span> to unpin.
                            </p>
                        }
                    >
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'baseline', 'margin-top': '4px' }}>
                            <span style={{ 'font-size': '24px', 'font-weight': '800', color: '#1e293b', 'letter-spacing': '-0.02em' }}>
                                ${pinnedPrice()?.toLocaleString()}
                            </span>
                            <span style={{ 'font-size': '11px', 'font-weight': '700', color: '#94a3b8' }}>
                                USD
                            </span>
                        </div>
                        <div style={{
                            'margin-top': '12px',
                            padding: '14px',
                            background: pinnedSide() === 'ask' ? 'rgba(239, 68, 68, 0.06)' : pinnedSide() === 'bid' ? 'rgba(34, 197, 94, 0.06)' : 'rgba(59, 130, 246, 0.06)',
                            'border-radius': '16px',
                            display: 'flex',
                            'flex-direction': 'column',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                        }}>
                            <div style={{
                                'font-size': '10px',
                                'color': pinnedSide() === 'ask' ? '#ef4444' : pinnedSide() === 'bid' ? '#22c55e' : '#64748b',
                                'font-weight': '700',
                                'letter-spacing': '0.05em',
                                'margin-bottom': '2px'
                            }}>
                                {pinnedSide() === 'ask' ? 'SELL LIQUIDITY' : pinnedSide() === 'bid' ? 'BUY LIQUIDITY' : 'LIQUIDITY'}
                            </div>
                            <div style={{
                                'font-size': '18px',
                                'font-weight': '800',
                                color: pinnedSide() === 'ask' ? '#ef4444' : pinnedSide() === 'bid' ? '#22c55e' : '#3b82f6',
                                'font-family': 'monospace'
                            }}>
                                {pinnedVolume() === null ? 'loading\u2026' : pinnedVolume()?.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                <span style={{ 'font-size': '12px', 'margin-left': '6px', opacity: 0.7 }}>{activeSymbol().replace('USDT', '')}</span>
                            </div>
                        </div>
                    </Show>
                </div>

                <div style={{ width: '100%', 'align-self': 'start' }}>
                    <ProbeDashboard
                        wsState={wsState()}
                        asksSize={asksSize()}
                        bidsSize={bidsSize()}
                        isSyncing={isSyncing()}
                        canvasRes={canvasRes()}
                        fps={fps()}
                        latency={latency()}
                    />
                </div>
            </div>

            <div class={styles.mainArea}>
                <div class={styles.chartContainer}>
                    <PricePin
                        pinnedPrice={pinnedPrice}
                        pinnedSide={pinnedSide}
                        centrePrice={centrePrice}
                        priceSpan={priceSpan}
                        canvasHeightCss={canvasHeightCss}
                    />

                    <canvas
                        ref={canvasRef!}
                        style={{
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            cursor: 'crosshair',
                            'touch-action': 'none', // Prevent browser panning
                        }}
                    />
                </div>

                <div class={styles.legendContainer}>
                    <AdaptiveLegend
                        askVolumeThresholds={askVolumeThresholds()}
                        bidVolumeThresholds={bidVolumeThresholds()}
                        magmaReverse={true}
                    />
                </div>

                <div ref={priceAxisRef!} class={styles.priceAxisContainer}>
                    <PriceAxis
                        centrePrice={centrePrice}
                        midPrice={midPrice}
                        priceSpan={priceSpan}
                        canvasHeightCss={canvasHeightCss}
                    />
                </div>

                <div ref={timeAxisRef!} class={styles.timeAxisContainer}>
                    <TimeAxis
                        latestTimestamp={latestTimestamp}
                        timeRangeMs={timeRangeMs}
                    />
                </div>
            </div>
        </div>
    );
}
