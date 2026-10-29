import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes';
import eventRoutes from './modules/events/events.routes';
import bookingRoutes from './modules/bookings/bookings.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRoutes);
app.use('/events', eventRoutes);
app.use('/bookings', bookingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
