export function validateRegister(body: any): string | null {
  const { email, password, name } = body;
  if (!email || !password || !name) {
    return 'email, password and name are required';
  }
  return null;
}
