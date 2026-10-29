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

  describe('in production', () => {
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://seatbook:3f9a1c77d0b24e55a8c6@db:5432/seatbook',
      PORT: '4000',
      JWT_SECRET: 'b7d2f4a6c8e0913f5a7b9d1c3e5f70829a4c6e8b0d2f4a61',
    };

    it('accepts a strong secret and database password', () => {
      expect(getEnvErrors(production)).toEqual([]);
    });

    it.each([
      ['the compose development secret', 'dev-only-jwt-secret-change-me'],
      ['the .env.example placeholder', 'change-me'],
      ['the old hardcoded secret', 'seatbook-secret-123'],
      ['a placeholder padded to 32+ characters', 'please-change-me-before-you-deploy-this'],
      ['a short secret', 'abc123'],
      ['a 31 character secret', 'a'.repeat(31)],
      ['the word secret', 'secret'],
    ])('rejects %s', (_name, JWT_SECRET) => {
      expect(getEnvErrors({ ...production, JWT_SECRET }).join()).toMatch(/JWT_SECRET is too weak for production/);
    });

    it('accepts a secret of exactly 32 characters', () => {
      expect(getEnvErrors({ ...production, JWT_SECRET: 'q7w3e9r1t5y2u8i4o6p0a1s3d5f7g9h2' })).toEqual([]);
    });

    it.each([
      ['the development password', 'postgresql://seatbook:seatbook@db:5432/seatbook'],
      ['the default postgres password', 'postgresql://postgres:postgres@db:5432/seatbook'],
      ['an uppercase default', 'postgresql://seatbook:PASSWORD@db:5432/seatbook'],
      ['no password', 'postgresql://seatbook@db:5432/seatbook'],
      ['an empty password', 'postgresql://seatbook:@db:5432/seatbook'],
    ])('rejects a database URL with %s', (_name, DATABASE_URL) => {
      expect(getEnvErrors({ ...production, DATABASE_URL }).join()).toMatch(/empty or default database password/);
    });

    it('still reports a missing JWT_SECRET as required, not as weak', () => {
      expect(getEnvErrors({ ...production, JWT_SECRET: undefined })).toEqual(['JWT_SECRET is required']);
    });

    it('reports every production problem at once', () => {
      expect(getEnvErrors({ ...production, JWT_SECRET: 'change-me', DATABASE_URL: 'postgresql://seatbook:seatbook@db/x' })).toHaveLength(2);
    });
  });

  describe('outside production', () => {
    it.each(['development', 'test', undefined])('still allows the development values when NODE_ENV is %s', (NODE_ENV) => {
      expect(
        getEnvErrors({
          NODE_ENV,
          DATABASE_URL: 'postgresql://seatbook:seatbook@db:5432/seatbook',
          JWT_SECRET: 'dev-only-jwt-secret-change-me',
        })
      ).toEqual([]);
    });
  });

  it('still validates DATABASE_URL and PORT', () => {
    expect(getEnvErrors({ ...valid, DATABASE_URL: undefined })).toContain('DATABASE_URL is required');
    expect(getEnvErrors({ ...valid, DATABASE_URL: 'mysql://x' })).toHaveLength(1);
    expect(getEnvErrors({ ...valid, PORT: '70000' })).toHaveLength(1);
  });
});
