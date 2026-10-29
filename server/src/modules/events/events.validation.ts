import type { ValidationResult } from '../auth/auth.validation';

export const MAX_ROWS = 26;
export const MAX_COLS = 30;
const MAX_TITLE_LENGTH = 200;
const MAX_VENUE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_PRICE_CENTS = 100_000_000; // $1,000,000

export type CreateEventInput = {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  rows: number;
  cols: number;
  priceCents: number;
};

const isMissing = (value: unknown) => value === undefined || value === null || value === '';
const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

// Returns the cleaned input (strings trimmed, defaults applied) or the first problem found.
export function validateCreateEvent(body: any): ValidationResult<CreateEventInput> {
  const { title, description, venue, startsAt, rows, cols, priceCents } = body ?? {};

  if ([title, venue, startsAt, rows, cols].some(isMissing)) {
    return { error: 'Missing required fields' };
  }

  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    return { error: `title must be text of 1 to ${MAX_TITLE_LENGTH} characters` };
  }
  if (typeof venue !== 'string' || !venue.trim() || venue.trim().length > MAX_VENUE_LENGTH) {
    return { error: `venue must be text of 1 to ${MAX_VENUE_LENGTH} characters` };
  }
  if (!isMissing(description) && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
    return { error: `description must be text of at most ${MAX_DESCRIPTION_LENGTH} characters` };
  }

  if (typeof startsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(startsAt) || Number.isNaN(new Date(startsAt).getTime())) {
    return { error: 'startsAt must be a valid ISO 8601 date' };
  }
  if (new Date(startsAt).getTime() <= Date.now()) {
    return { error: 'startsAt must be in the future' };
  }

  if (!isWholeNumber(rows) || rows < 1) {
    return { error: 'rows must be a whole number of at least 1' };
  }
  if (!isWholeNumber(cols) || cols < 1) {
    return { error: 'cols must be a whole number of at least 1' };
  }
  if (rows > MAX_ROWS || cols > MAX_COLS) {
    return { error: `Seat grid too large (max ${MAX_ROWS} rows x ${MAX_COLS} cols)` };
  }

  if (priceCents !== undefined && (!isWholeNumber(priceCents) || priceCents < 0 || priceCents > MAX_PRICE_CENTS)) {
    return { error: `priceCents must be a whole number between 0 and ${MAX_PRICE_CENTS}` };
  }

  return {
    data: {
      title: title.trim(),
      description: isMissing(description) ? '' : description,
      venue: venue.trim(),
      startsAt,
      rows,
      cols,
      priceCents: priceCents ?? 0,
    },
  };
}
