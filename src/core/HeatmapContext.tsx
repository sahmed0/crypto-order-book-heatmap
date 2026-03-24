// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { createContext, useContext } from 'solid-js';
import type { JSX } from 'solid-js';
import type { HeatmapService } from './HeatmapService';

/**
 * Context for providing a specific HeatmapService instance to the component tree.
 * Allows for dependency injection and support for multiple heatmap instances.
 */
const HeatmapContext = createContext<HeatmapService>();

export function HeatmapProvider(props: { service: HeatmapService; children: JSX.Element }) {
    return (
        <HeatmapContext.Provider value={props.service}>
            {props.children}
        </HeatmapContext.Provider>
    );
}

/**
 * Hook to access the current HeatmapService.
 * Throws if used outside of a HeatmapProvider.
 */
export function useHeatmap() {
    const context = useContext(HeatmapContext);
    if (!context) {
        throw new Error('useHeatmap must be used within a HeatmapProvider');
    }
    return context;
}
