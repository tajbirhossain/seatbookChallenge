import { describe, expect, it } from 'vitest';
import { getEnvErrors } from '../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  PORT: '4000',
  JWT_SECRET: 'a-long-random-secret',
};

describe('getEnvErrors', () => {
  it('accepts a complete environment', () => {
    expect(getEnvErrors(valid)).toEqual([]);
  });

  it('requires JWT_SECRET', () => {
    const { JWT_SECRET, ...withoutSecret } = valid;

    expect(getEnvErrors(withoutSecret)).toContain('JWT_SECRET is required');
  });

  it('rejects an empty or blank JWT_SECRET', () => {
    expect(getEnvErrors({ ...valid, JWT_SECRET: '' })).toContain('JWT_SECRET is required');
    expect(getEnvErrors({ ...valid, JWT_SECRET: '   ' })).toContain('JWT_SECRET is required');
  });

  it('requires JWT_SECRET outside production too', () => {
    expect(getEnvErrors({ ...valid, JWT_SECRET: undefined, NODE_ENV: 'development' })).toContain(
      'JWT_SECRET is required'
    );
  });

  it('reports every problem at once', () => {
    expect(getEnvErrors({ PORT: 'abc' })).toHaveLength(3);
  });

  it('still validates DATABASE_URL and PORT', () => {
    expect(getEnvErrors({ ...valid, DATABASE_URL: undefined })).toContain('DATABASE_URL is required');
    expect(getEnvErrors({ ...valid, DATABASE_URL: 'mysql://x' })).toHaveLength(1);
    expect(getEnvErrors({ ...valid, PORT: '70000' })).toHaveLength(1);
  });
});
