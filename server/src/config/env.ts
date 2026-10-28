// Load server/.env when present (no-op in Docker, where compose sets the variables).
// Variables that are already set are not overridden.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const PORT = process.env.PORT || 4000;

export const JWT_SECRET = process.env.JWT_SECRET || 'seatbook-secret-123';

// Fails fast with every problem listed, instead of crashing later on the first request.
export function validateEnv() {
  const errors: string[] = [];

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  }

  const port = Number(PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be an integer between 1 and 65535 (got "${PORT}")`);
  }

  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required when NODE_ENV=production');
  }

  if (errors.length > 0) {
    console.error('Invalid environment configuration:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}
