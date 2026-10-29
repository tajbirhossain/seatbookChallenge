// Load server/.env when present (no-op in Docker, where compose sets the variables).
// Variables that are already set are not overridden.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const PORT = process.env.PORT || 4000;

// No default: validateEnv() stops the server from starting when it is missing.
export const JWT_SECRET = process.env.JWT_SECRET ?? '';

export function getEnvErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  }

  const rawPort = env.PORT || 4000;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be an integer between 1 and 65535 (got "${rawPort}")`);
  }

  if (!env.JWT_SECRET?.trim()) {
    errors.push('JWT_SECRET is required');
  }

  return errors;
}

// Fails fast with every problem listed, instead of crashing later on the first request.
export function validateEnv() {
  const errors = getEnvErrors();

  if (errors.length > 0) {
    console.error('Invalid environment configuration:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}
