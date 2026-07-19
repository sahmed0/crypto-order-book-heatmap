import { describe, expect, it } from 'vitest';
import { createOrderBookSide, updateOrderBookSide } from './bookCore';

describe('updateOrderBookSide', () => {
    it('inserts a level into an empty side', () => {
        const side = createOrderBookSide();

        updateOrderBookSide(side, 100, 2, true);

        expect(side.prices).toEqual([100]);
        expect(side.quantities).toEqual([2]);
    });
});
