const isNonEmptyString = (value: unknown) => typeof value === 'string' && value.length > 0;

export function validateRegister(body: any): string | null {
  const { email, password, name } = body;
  if (!isNonEmptyString(email) || !isNonEmptyString(password) || !isNonEmptyString(name)) {
    return 'email, password and name are required';
  }
  return null;
}

export function validateLogin(body: any): string | null {
  const { email, password } = body;
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return 'email and password are required';
  }
  return null;
}
