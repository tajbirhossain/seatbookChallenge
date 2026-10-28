import app from './app';
import { PORT, validateEnv } from './config/env';

validateEnv();

app.listen(PORT, () => {
  console.log(`Seatbook API running on http://localhost:${PORT}`);
});
