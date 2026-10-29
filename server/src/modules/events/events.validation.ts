// Returns an error message for the first problem found, or null when the body is valid.
export function validateCreateEvent(body: any): string | null {
  const { title, venue, startsAt, rows, cols } = body;

  if (!title || !venue || !startsAt || !rows || !cols) {
    return 'Missing required fields';
  }

  if (rows > 26 || cols > 30) {
    return 'Seat grid too large (max 26 rows x 30 cols)';
  }

  return null;
}
