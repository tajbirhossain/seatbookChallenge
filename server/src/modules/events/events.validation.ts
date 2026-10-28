export type ValidationError = { status: number; body: Record<string, string> };

export function validateCreateEvent(body: any): ValidationError | null {
  const { title, venue, startsAt, rows, cols } = body;

  if (!title || !venue || !startsAt || !rows || !cols) {
    return { status: 400, body: { error: 'Missing required fields' } };
  }

  if (rows > 26 || cols > 30) {
    return { status: 400, body: { msg: 'Seat grid too large (max 26 rows x 30 cols)' } };
  }

  return null;
}
