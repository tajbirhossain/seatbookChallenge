import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import FormField from '../components/FormField';
import { LIMITS } from '../limits';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const inputClass =
  'w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300';

// The API answers every failure with { "error": "message" }.
async function readErrorMessage(res: Response) {
  try {
    const data = await res.json();
    if (typeof data?.error === 'string' && data.error) return data.error;
  } catch {
    // body was not JSON
  }
  return 'Something went wrong 😢';
}

// "YYYY-MM-DDTHH:mm" in local time, the format a datetime-local input expects.
function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function CreateEventPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(8);
  const [price, setPrice] = useState('0');
  const [error, setError] = useState('');

  // Only flagged once something has been entered, so an untouched form isn't covered in red.
  const startsInPast = startsAt !== '' && new Date(startsAt).getTime() <= Date.now();
  const rowsInvalid = !Number.isInteger(rows) || rows < 1 || rows > LIMITS.rows;
  const colsInvalid = !Number.isInteger(cols) || cols < 1 || cols > LIMITS.cols;
  const priceNumber = parseFloat(price);
  const priceInvalid = price.trim() === '' || Number.isNaN(priceNumber) || priceNumber < 0 || priceNumber > LIMITS.priceMaxDollars;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          title,
          description,
          venue,
          startsAt: new Date(startsAt).toISOString(),
          rows: Number(rows),
          cols: Number(cols),
          priceCents: Math.round(parseFloat(price) * 100),
        }),
      });

      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }

      const event = await res.json();
      navigate(`/events/${event.id}`);
    } catch (err) {
      console.error(err);
      setError('Something went wrong 😢');
    }
  };

  const previewRows = [];
  for (let r = 0; r < Number(rows); r++) {
    const seats = [];
    for (let c = 0; c < Number(cols); c++) {
      seats.push(String.fromCharCode(65 + r) + (c + 1));
    }
    previewRows.push(seats);
  }

  return (
    <div>
      <h1 className="text-5xl font-extrabold mb-2">
        Create <span className="gradient-text">Event</span> ✨
      </h1>
      <p className="text-white/50 mb-10">Bring people together for something amazing 🎉</p>

      <div className="grid grid-cols-2 gap-8">
        <form onSubmit={handleSubmit} className="glass rounded-3xl p-8 space-y-4">
          <FormField
            label="Event title"
            htmlFor="title"
            badge="required"
            hint={`Up to ${LIMITS.title} characters`}
            limit={{ used: title.length, max: LIMITS.title }}
          >
            <input
              id="title"
              placeholder="🎭 Event title"
              value={title}
              maxLength={LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField
            label="Description"
            htmlFor="description"
            badge="optional"
            hint={`Up to ${LIMITS.description} characters`}
            limit={{ used: description.length, max: LIMITS.description }}
          >
            <textarea
              id="description"
              placeholder="📝 Description"
              value={description}
              maxLength={LIMITS.description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField
            label="Venue"
            htmlFor="venue"
            badge="required"
            hint={`Up to ${LIMITS.venue} characters`}
            limit={{ used: venue.length, max: LIMITS.venue }}
          >
            <input
              id="venue"
              placeholder="📍 Venue"
              value={venue}
              maxLength={LIMITS.venue}
              onChange={(e) => setVenue(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField
            label="Date and time"
            htmlFor="startsAt"
            badge="required"
            hint={startsInPast ? 'This is in the past. Pick a future date and time.' : 'Must be in the future.'}
            invalid={startsInPast}
          >
            <input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              min={localNow()}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              label="Rows"
              htmlFor="rows"
              badge="required"
              hint={`Whole number, 1 to ${LIMITS.rows}`}
              invalid={rowsInvalid}
            >
              <input
                id="rows"
                type="number"
                min={1}
                max={LIMITS.rows}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Seats per row"
              htmlFor="cols"
              badge="required"
              hint={`Whole number, 1 to ${LIMITS.cols}`}
              invalid={colsInvalid}
            >
              <input
                id="cols"
                type="number"
                min={1}
                max={LIMITS.cols}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Ticket price ($)"
              htmlFor="price"
              hint="In dollars, e.g. 15.00. Use 0 for free."
              invalid={priceInvalid}
            >
              <input
                id="price"
                placeholder="💰 Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>
          <p className="text-xs text-white/40">
            {rowsInvalid || colsInvalid
              ? `The seat grid can be at most ${LIMITS.rows} rows by ${LIMITS.cols} seats per row.`
              : `${rows * cols} seats in total (${rows} rows × ${cols} seats per row).`}
          </p>
          {error && <p className="text-[#fca5a5] text-sm">⚠️ {error}</p>}
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f97316] font-bold text-lg hover:scale-[1.02] hover:shadow-2xl hover:shadow-pink-500/40 transition-all duration-300"
          >
            Launch Event 🚀
          </button>
        </form>

        <div className="glass rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6">Live Preview 👀</h3>
          <div className="space-y-3">
            {previewRows.map((row, i) => (
              <div key={i} className="flex gap-3 justify-center">
                {row.map((label) => (
                  <div
                    key={label}
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold bg-gradient-to-br from-[#a855f7]/60 to-[#6366f1]/60"
                  >
                    {label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
