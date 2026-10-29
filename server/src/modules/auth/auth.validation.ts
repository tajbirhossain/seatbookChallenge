export type ValidationResult<T> = { data: T } | { error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes, so a longer password would silently be cut short.
export const MAX_PASSWORD_BYTES = 72;
// Login accepts older, longer passwords; this only stops absurdly large inputs.
const MAX_LOGIN_PASSWORD_LENGTH = 1000;

const isString = (value: unknown): value is string => typeof value === 'string';

// Emails are stored and matched trimmed and lowercase, so "A@x.com" and "a@x.com" are one account.
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validateRegister(body: any): ValidationResult<{ email: string; password: string; name: string }> {
  const { email, password, name } = body ?? {};

  if (!isString(email) || !isString(password) || !isString(name) || !email.trim() || !password || !name.trim()) {
    return { error: 'email, password and name are required' };
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { error: 'email must be a valid email address' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return { error: `password is too long (max ${MAX_PASSWORD_BYTES} bytes)` };
  }

  const trimmedName = name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return { error: `name must be at most ${MAX_NAME_LENGTH} characters` };
  }

  return { data: { email: normalizedEmail, password, name: trimmedName } };
}

export function validateLogin(body: any): ValidationResult<{ email: string; password: string }> {
  const { email, password } = body ?? {};

  if (!isString(email) || !isString(password) || !email.trim() || !password) {
    return { error: 'email and password are required' };
  }
  if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_LOGIN_PASSWORD_LENGTH) {
    return { error: 'email or password is too long' };
  }

  return { data: { email: normalizeEmail(email), password } };
}
