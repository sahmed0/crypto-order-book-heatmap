// Strictly defined high-contrast colour bands for "Weather Radar" style rendering.
// Removed 256-colour LUTs and HSL interpolation in favour of discrete steps.

import type { PaletteName } from './types';

export type RGB = readonly [number, number, number];

/**
 * High-contrast colour steps for each palette.
 * Carefully selected for maximum legibility in "Weather Radar" mode.
 */
export const PALETTE_BANDS: Record<PaletteName, RGB[]> = {
    'magma': [
        [20, 10, 40],   // Deep Purple
        [120, 30, 120], // Mid Purple
        [220, 60, 50],  // Red-Orange
        [250, 180, 20], // Amber
        [255, 240, 50]  // Yellow
    ],
    'viridis': [
        [68, 1, 84],    // Deep Purple
        [62, 74, 137],  // Blue
        [33, 145, 140], // Dark Green
        [144, 215, 67], // Lime
        [253, 231, 37]  // Yellow
    ],
};
