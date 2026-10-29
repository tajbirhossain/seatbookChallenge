import { describe, it, expect } from 'vitest';
import { formatPrice, seatLabel, slugify, toPositiveInt } from '../src/utils/helpers';

describe('helpers', () => {
  it('formats cents as dollars', () => {
    expect(formatPrice(1500)).toBe('$15.00');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('labels seats by row letter and column number', () => {
    expect(seatLabel(0, 0)).toBe('A1');
    expect(seatLabel(2, 4)).toBe('C5');
  });

  it('parses positive integer ids strictly', () => {
    expect(toPositiveInt(5)).toBe(5);
    expect(toPositiveInt('42')).toBe(42);
    expect(toPositiveInt(2147483647)).toBe(2147483647);

    for (const bad of ['abc', '12abc', '1.5', '-1', '0', '', ' 5', 1.5, 0, -3, NaN, Infinity, 2147483648, true, [5], null, undefined, {}]) {
      expect(toPositiveInt(bad)).toBeNull();
    }
  });

  it('slugifies titles', () => {
    expect(slugify('  Postgres in Practice! ')).toBe('postgres-in-practice');
  });
});
