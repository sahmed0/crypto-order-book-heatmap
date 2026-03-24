// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { createSignal, onMount, onCleanup } from 'solid-js';
import type { InboundDataMessage, InboundRenderMessage } from '../engine/types';
import { DEFAULT_PRICE_SPAN } from '../engine/types';
import { HeatmapService } from '../core/HeatmapService';

/**
 * Custom hook to manage the lifecycle of the DOM Heatmap worker pipeline.
 * Coordinates between the main thread, DataWorker, and RenderWorker.
 *
 * @param canvasRefFn - A function that returns the HTMLCanvasElement.
 * @returns An object containing live viewport state and control signals.
 */
export function useHeatmapPipeline(canvasRefFn: () => HTMLCanvasElement | undefined) {
    // ---- Infrastructure state
    const [service, setService] = createSignal<HeatmapService | null>(null);

    // ---- Liveness / health signals (fed by STATUS_PROBE from both workers)
    const [wsState, setWsState] = createSignal<number>(0);
    const [asksSize, setAsksSize] = createSignal(0);
    const [bidsSize, setBidsSize] = createSignal(0);
    const [isSyncing, setIsSyncing] = createSignal(false);
    const [canvasRes, setCanvasRes] = createSignal({ w: 0, h: 0 });
    const [fps, setFps] = createSignal(0);

    // ---- Viewport state (echoed by VIEWPORT_UPDATE from RenderWorker on every frame)
    const [centrePrice, setCentrePrice] = createSignal(0);
    const [midPrice, setMidPrice] = createSignal(0);
    const [priceSpan, setPriceSpan] = createSignal(DEFAULT_PRICE_SPAN);
    const [pinnedVolume, setPinnedVolume] = createSignal<number | null>(null);
    const [pinnedSide, setPinnedSide] = createSignal<'bid' | 'ask' | null>(null);
    const [latency, setLatency] = createSignal(0);
    const [latestTimestamp, setLatestTimestamp] = createSignal(0);
    const [echoedTimeScale, setEchoedTimeScale] = createSignal(1);
    const [timeRangeMs, setTimeRangeMs] = createSignal(0);
    const [askVolumeThresholds, setAskVolumeThresholds] = createSignal<readonly number[]>([]);
    const [bidVolumeThresholds, setBidVolumeThresholds] = createSignal<readonly number[]>([]);

    // ---- Layout state — CSS-pixel canvas height for DOM overlay positioning
    const [canvasHeightCss, setCanvasHeightCss] = createSignal(0);

    onMount(() => {
        const canvasRef = canvasRefFn();
        if (!canvasRef) return;

        // Step 1 — Instantiate both workers.
        const dataWorker = new Worker(
            new URL('../workers/data.worker.ts', import.meta.url),
            { type: 'module' },
        );
        const renderWorker = new Worker(
            new URL('../workers/render.worker.ts', import.meta.url),
            { type: 'module' },
        );

        // Step 2 — Create the service instance to manage communication.
        const heatmapService = new HeatmapService(renderWorker, dataWorker);
        setService(heatmapService);

        // Step 3 — Attach inbound message handlers.
        dataWorker.onmessage = (e: MessageEvent<InboundDataMessage>) => {
            const msg = e.data;
            switch (msg.type) {
                case 'STATUS_PROBE':
                    setWsState(msg.payload.wsState);
                    setAsksSize(msg.payload.asksSize);
                    setBidsSize(msg.payload.bidsSize);
                    setIsSyncing(msg.payload.isSyncing);
                    break;
                case 'ERROR':
                    console.warn('[DataWorker]', msg.message);
                    break;
            }
        };

        renderWorker.onmessage = (e: MessageEvent<InboundRenderMessage>) => {
            const msg = e.data;
            switch (msg.type) {
                case 'STATUS_PROBE':
                    setCanvasRes({ w: msg.payload.width, h: msg.payload.height });
                    setFps(msg.payload.fps);
                    break;
                case 'VIEWPORT_UPDATE':
                    setCentrePrice(msg.payload.centrePrice);
                    setMidPrice(msg.payload.midPrice);
                    setPriceSpan(msg.payload.priceSpan);
                    setLatestTimestamp(msg.payload.latestTimestamp);
                    setEchoedTimeScale(msg.payload.timeScale);
                    setTimeRangeMs(msg.payload.timeRangeMs);
                    if (msg.payload.pinnedVolume !== undefined) {
                        setPinnedVolume(msg.payload.pinnedVolume);
                    }
                    if (msg.payload.pinnedSide !== undefined) {
                        setPinnedSide(msg.payload.pinnedSide);
                    }
                    if (msg.payload.latency !== undefined) {
                        setLatency(msg.payload.latency);
                    }
                    if (msg.payload.askVolumeThresholds !== undefined) {
                        setAskVolumeThresholds(msg.payload.askVolumeThresholds);
                    }
                    if (msg.payload.bidVolumeThresholds !== undefined) {
                        setBidVolumeThresholds(msg.payload.bidVolumeThresholds);
                    }
                    break;
            }
        };


        // Step 4 — Transfer the canvas to the RenderWorker.
        const offscreen = canvasRef.transferControlToOffscreen();
        renderWorker.postMessage({ type: 'INIT_CANVAS', canvas: offscreen }, [offscreen]);

        // Step 5 — Wire a direct MessageChannel between the two workers.
        const pipelineChannel = new MessageChannel();
        renderWorker.postMessage(
            { type: 'INIT_PORT', port: pipelineChannel.port2 },
            [pipelineChannel.port2],
        );
        dataWorker.postMessage(
            { type: 'INIT_PORT', port: pipelineChannel.port1 },
            [pipelineChannel.port1],
        );

        // Step 6 — Start the data engine.
        dataWorker.postMessage({ type: 'START_STREAM' });

        // Step 7 — Track canvas dimensions via ResizeObserver.
        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;

            const { width: cssW, height: cssH } = entry.contentRect;
            const dpr = window.devicePixelRatio || 1;

            setCanvasHeightCss(cssH);

            renderWorker.postMessage({
                type: 'RESIZE',
                width: Math.floor(cssW * dpr),
                height: Math.floor(cssH * dpr),
                dpr,
            });
        });

        resizeObserver.observe(canvasRef);

        // Step 8 — Teardown on unmount
        onCleanup(() => {
            resizeObserver.disconnect();
            heatmapService.terminate();
            pipelineChannel.port1.close();
            pipelineChannel.port2.close();
        });
    });

    return {
        service,
        wsState,
        asksSize,
        bidsSize,
        isSyncing,
        canvasRes,
        fps,
        centrePrice,
        midPrice,
        priceSpan,
        pinnedVolume,
        pinnedSide,
        setPinnedVolume,
        canvasHeightCss,
        latency,
        latestTimestamp,
        echoedTimeScale,
        timeRangeMs,
        askVolumeThresholds,
        bidVolumeThresholds,
    };
}
