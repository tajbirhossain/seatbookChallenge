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

const MIN_PRODUCTION_SECRET_LENGTH = 32;
// Placeholder and development values that ship in this repository. They are public, so a
// production server must never run with them.
const KNOWN_DEV_SECRET = /change-?me|dev-only|seatbook-secret|^secret$|^password$/i;
const KNOWN_DEV_DB_PASSWORDS = new Set(['seatbook', 'postgres', 'password']);

export function getEnvErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  } else if (isProduction) {
    try {
      const password = decodeURIComponent(new URL(databaseUrl).password);
      if (!password || KNOWN_DEV_DB_PASSWORDS.has(password.toLowerCase())) {
        errors.push('DATABASE_URL has an empty or default database password, which is not allowed in production');
      }
    } catch {
      errors.push('DATABASE_URL could not be parsed');
    }
  }

  const rawPort = env.PORT || 4000;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be an integer between 1 and 65535 (got "${rawPort}")`);
  }

  if (!env.JWT_SECRET?.trim()) {
    errors.push('JWT_SECRET is required');
  } else if (isProduction && (env.JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH || KNOWN_DEV_SECRET.test(env.JWT_SECRET))) {
    errors.push(
      `JWT_SECRET is too weak for production: use at least ${MIN_PRODUCTION_SECRET_LENGTH} random characters, ` +
        'not a placeholder (for example `openssl rand -hex 32`)'
    );
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
