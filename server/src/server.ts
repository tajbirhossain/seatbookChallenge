import app from './app';
import { PORT, validateEnv } from './config/env';
import { releaseExpiredHolds } from './modules/bookings/bookings.service';

validateEnv();

// Request errors go through the error middleware. This only keeps a stray rejection from
// background work from taking the whole API down; it is logged so it is not hidden.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
});

const HOLD_SWEEP_INTERVAL_MS = 30 * 1000;

function sweepExpiredHolds() {
  releaseExpiredHolds().catch((err) => console.error('Failed to release expired holds', err));
}

app.listen(PORT, () => {
  console.log(`Seatbook API running on http://localhost:${PORT}`);

  sweepExpiredHolds();
  setInterval(sweepExpiredHolds, HOLD_SWEEP_INTERVAL_MS).unref();
});
