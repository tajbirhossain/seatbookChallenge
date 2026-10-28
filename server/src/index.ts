import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes';
import eventRoutes from './modules/events/events.routes';
import bookingRoutes from './modules/bookings/bookings.routes';
import { PORT } from './config/env';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRoutes);
app.use('/events', eventRoutes);
app.use('/bookings', bookingRoutes);

app.listen(PORT, () => {
  console.log(`Seatbook API running on http://localhost:${PORT}`);
});
