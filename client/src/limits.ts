// Input limits. These mirror the server's validation (server/src/modules/*/*.validation.ts);
// the server is what actually enforces them.
export const LIMITS = {
  email: 254,
  name: 100,
  passwordMin: 8,
  passwordMaxBytes: 72,
  title: 200,
  venue: 200,
  description: 5000,
  rows: 26,
  cols: 30,
  priceMaxDollars: 1_000_000,
  holdMinutes: 10,
  maxHolds: 2,
};
