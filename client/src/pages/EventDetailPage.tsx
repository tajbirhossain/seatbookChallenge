import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import HoldCountdown from '../components/HoldCountdown';
import ConfirmDialog from '../components/ConfirmDialog';
import { LIMITS } from '../limits';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);
  const [rows, setRows] = useState<any[][]>([]);
  const [selectedSeat, setSelectedSeat] = useState<any>(null);
  const [availableCount, setAvailableCount] = useState(0);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  const [holds, setHolds] = useState<any[]>([]);
  // Labels of seats the user can't take any more because their own hold on them expired.
  const [blockedLabels, setBlockedLabels] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const eventLoaded = useRef(false);
  // The action waiting for the user to confirm it in the dialog.
  const [pending, setPending] = useState<
    { kind: 'book'; seat: any } | { kind: 'hold'; seat: any } | { kind: 'confirmHold'; hold: any } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Before the event has loaded a failure replaces the page with an error message; once it is
  // showing, a failed refresh only raises a toast so the page isn't wiped.
  const handleLoadError = (message: string) => {
    if (eventLoaded.current) {
      showToast('error', '😢 ' + message);
    } else {
      setLoadError(message);
    }
  };

  const fetchEvent = async () => {
    let data: any;
    try {
      const res = await fetch(`${API_URL}/events/${id}`);
      data = await res.json().catch(() => null);

      if (!res.ok || !Array.isArray(data?.seats)) {
        handleLoadError(
          typeof data?.error === 'string' ? data.error : 'Something went wrong while loading this event'
        );
        return;
      }
    } catch {
      handleLoadError('Could not reach the server. Check your connection and try again.');
      return;
    }

    eventLoaded.current = true;
    setLoadError('');
    setEvent(data);

    const grouped: any[][] = [];
    data.seats.forEach((seat: any) => {
      if (!grouped[seat.row]) grouped[seat.row] = [];
      grouped[seat.row].push(seat);
    });
    setRows(grouped);

    // Drop the selection if someone else took that seat in the meantime.
    setSelectedSeat((current: any) =>
      current && data.seats.some((s: any) => s.id === current.id && s.available) ? current : null
    );

    let count = 0;
    data.seats.forEach((seat: any) => {
      if (seat.available) count++;
    });
    setAvailableCount(count);
  };

  // The logged-in user's active holds on this event.
  const fetchHolds = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setHolds([]);
      return;
    }

    fetch(`${API_URL}/bookings/holds`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setHolds(data.filter((h: any) => h.event.id === Number(id))))
      .catch(() => setHolds([]));
  };

  const fetchBlockedSeats = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setBlockedLabels([]);
      return;
    }

    fetch(`${API_URL}/bookings/blocked-seats?eventId=${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBlockedLabels(data.map((s: any) => s.label)))
      .catch(() => setBlockedLabels([]));
  };

  useEffect(() => {
    // Opening a different event starts from a clean slate instead of showing the previous one.
    eventLoaded.current = false;
    setEvent(null);
    setLoadError('');
    setSelectedSeat(null);

    fetchEvent();
    fetchHolds();
    fetchBlockedSeats();
  }, [id]);

  // If the hold being confirmed runs out while the dialog is open, there is nothing left to confirm.
  useEffect(() => {
    if (pending?.kind === 'confirmHold' && !busy && !holds.some((h) => h.id === pending.hold.id)) {
      setPending(null);
    }
  }, [holds, pending, busy]);

  const askBook = () => {
    if (!selectedSeat) {
      showToast('error', 'Please select a seat first! 🪑');
      return;
    }
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }
    setPending({ kind: 'book', seat: selectedSeat });
  };

  const askHold = () => {
    if (!selectedSeat) {
      showToast('error', 'Please select a seat first! 🪑');
      return;
    }
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }
    setPending({ kind: 'hold', seat: selectedSeat });
  };

  const runPending = async () => {
    if (!pending) return;

    setBusy(true);
    try {
      if (pending.kind === 'book') await handleBook();
      else if (pending.kind === 'hold') await handleHold();
      else await handleConfirmHold(pending.hold);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const handleBook = async () => {
    if (!selectedSeat) {
      setToast({ type: 'error', message: 'Please select a seat first! 🪑' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const res = await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seatId: selectedSeat.id }),
    });
    const data = await res.json();

    if (res.ok) {
      setToast({ type: 'success', message: `🎉 Woohoo! Seat ${selectedSeat.label} is yours!` });
      setTimeout(() => setToast(null), 3000);
      setSelectedSeat(null);
      fetchEvent();
    } else {
      setToast({ type: 'error', message: '😢 ' + data.error });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleHold = async () => {
    if (!selectedSeat) {
      showToast('error', 'Please select a seat first! 🪑');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const res = await fetch(`${API_URL}/bookings/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seatId: selectedSeat.id }),
    });
    const data = await res.json();

    if (res.ok) {
      showToast('success', `⏳ Seat ${selectedSeat.label} is held for 10 minutes`);
      setSelectedSeat(null);
    } else {
      showToast('error', '😢 ' + (data.error || data.msg));
    }
    fetchEvent();
    fetchHolds();
  };

  const handleConfirmHold = async (hold: any) => {
    const res = await fetch(`${API_URL}/bookings/${hold.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const data = await res.json();

    if (res.ok) {
      showToast('success', `🎉 Woohoo! Seat ${hold.seat} is yours!`);
    } else {
      showToast('error', '😢 ' + (data.error || data.msg));
    }
    fetchEvent();
    fetchHolds();
  };

  const handleHoldExpired = (hold: any) => {
    setHolds((current) => current.filter((h) => h.id !== hold.id));
    // Block the seat right away; the server list below confirms it.
    setBlockedLabels((current) => (current.includes(hold.seat) ? current : [...current, hold.seat]));
    showToast('error', `⌛ Your hold on seat ${hold.seat} expired`);
    fetchEvent();
    fetchBlockedSeats();
  };

  if (!event && loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="text-6xl">😕</div>
        <h1 className="mt-6 text-3xl font-extrabold">Couldn't load this event</h1>
        <p className="mt-3 text-white/60">{loadError}</p>
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => {
              setLoadError('');
              fetchEvent();
            }}
            className="px-6 py-3 rounded-2xl border border-white/20 text-white/80 hover:bg-white/10 transition-all duration-300"
          >
            Try again
          </button>
          <Link
            to="/"
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f97316] font-semibold hover:scale-105 transition-all duration-300"
          >
            Browse events
          </Link>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 border-4 border-[#ec4899] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-6 text-white/60 animate-pulse">Loading event... 🎭</p>
      </div>
    );
  }

  const price = parseFloat(event.price.replace('$', ''));
  const serviceFee = price * 0.05;
  const total = price + serviceFee;
  const isPast = new Date(event.startsAt) < new Date();
  const percentBooked = Math.round(((event.seats.length - availableCount) / event.seats.length) * 100);
  const heldLabels = new Set(holds.map((h) => h.seat));
  const blockedSet = new Set(blockedLabels);

  return (
    <div>
      {toast && (
        <div
          className={`fixed top-24 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-medium ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-[#22c55e] to-[#16a34a]'
              : 'bg-gradient-to-r from-[#ef4444] to-[#dc2626]'
          }`}
        >
          {toast.message}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'book'
              ? `Book seat ${pending.seat.label}?`
              : pending.kind === 'hold'
              ? `Hold seat ${pending.seat.label}?`
              : `Confirm seat ${pending.hold.seat}?`
          }
          confirmLabel={pending.kind === 'book' ? 'Book seat' : pending.kind === 'hold' ? 'Hold seat' : 'Confirm booking'}
          busy={busy}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        >
          {pending.kind === 'hold' ? (
            <>
              <p>
                Seat <strong className="text-white">{pending.seat.label}</strong> will be held for you for{' '}
                {LIMITS.holdMinutes} minutes.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Nobody else can book it while you hold it.</li>
                <li>You can hold at most {LIMITS.maxHolds} seats at a time.</li>
                <li>If the hold runs out, this seat will no longer be available to you.</li>
              </ul>
            </>
          ) : (
            <>
              <p>
                {pending.kind === 'book'
                  ? 'This books the seat right away. You can cancel it later from My Bookings.'
                  : 'This turns your hold into a booking.'}
              </p>
              <div className="rounded-2xl bg-white/5 p-4 space-y-2">
                <div className="flex justify-between gap-4">
                  <span>Event</span>
                  <span className="text-white text-right">{event.title}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Seat</span>
                  <span className="text-white">{pending.kind === 'confirmHold' ? pending.hold.seat : pending.seat.label}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Ticket</span>
                  <span className="text-white">${price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Service fee (5%)</span>
                  <span className="text-white">${serviceFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-white/10 pt-2 font-bold text-white">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}

      <div className="rounded-3xl p-10 bg-gradient-to-br from-[#a855f7]/30 via-[#ec4899]/20 to-[#f97316]/20 border border-white/10 glow">
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isPast ? 'bg-white/10 text-white/60' : 'bg-[#a855f7]/30 text-[#d8b4fe]'
          }`}
        >
          {isPast ? '⏰ ENDED' : '✨ LIVE NOW'}
        </span>
        <h1 className="mt-4 text-5xl font-extrabold">{event.title}</h1>
        <p className="mt-4 text-white/60 text-lg">{event.description}</p>
        <div className="mt-6 flex gap-6 text-white/70">
          <span>📍 {event.venue}</span>
          <span>📅 {new Date(event.startsAt).toDateString()}</span>
          <span>👤 {event.organizer.name}</span>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-8">
        <div className="col-span-2 glass rounded-3xl p-8">
          <h2 className="text-2xl font-bold mb-2">
            Choose Your <span className="gradient-text">Perfect Seat</span> 🪑
          </h2>
          <p className="text-white/50 mb-6">
            {availableCount} of {event.seats.length} available · {percentBooked}% booked 🔥
          </p>
          <div className="w-full h-2 rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] mb-10 opacity-60"></div>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-3 justify-center">
                {row.map((seat: any) => {
                  const isBlocked = blockedSet.has(seat.label);
                  // Booked or held seats (including your own holds) report available = false.
                  const isSelectable = seat.available && !isBlocked;

                  return (
                    <div
                      key={seat.id}
                      onClick={() => {
                        if (isSelectable) setSelectedSeat(seat);
                      }}
                      title={
                        isBlocked
                          ? 'Your hold on this seat expired, so it is no longer available to you'
                          : !seat.available && !heldLabels.has(seat.label)
                          ? 'This seat is not available'
                          : undefined
                      }
                      aria-disabled={!isSelectable}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                        isSelectable ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed'
                      } ${
                        isBlocked
                          ? 'border border-dashed border-white/25 bg-white/5 text-white/25 line-through'
                          : heldLabels.has(seat.label)
                          ? 'bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-lg shadow-amber-500/40'
                          : !seat.available
                          ? 'bg-gradient-to-br from-[#a855f7]/20 to-[#6366f1]/20 text-white/30'
                          : selectedSeat?.id === seat.id
                          ? 'bg-gradient-to-br from-[#ec4899] to-[#f97316] shadow-lg shadow-pink-500/50 scale-110'
                          : 'bg-gradient-to-br from-[#a855f7]/60 to-[#6366f1]/60 hover:from-[#a855f7] hover:to-[#6366f1]'
                      }`}
                    >
                      {seat.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {blockedLabels.length > 0 && (
            <p className="mt-8 text-center text-xs text-white/50">
              <span className="inline-block w-3 h-3 rounded border border-dashed border-white/40 align-middle mr-2"></span>
              Seats no longer available to you (your hold expired)
            </p>
          )}
          {holds.length > 0 && (
            <p className="mt-4 text-center text-xs text-white/50">
              <span className="inline-block w-3 h-3 rounded bg-[#f59e0b] align-middle mr-2"></span>
              Seats you are holding
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass rounded-3xl p-8 h-fit">
            <h3 className="text-xl font-bold mb-6">Order Summary 🧾</h3>
            <div className="space-y-4 text-white/70">
              <div className="flex justify-between">
                <span>Seat</span>
                <span className="font-bold text-white">{selectedSeat ? selectedSeat.label : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Ticket</span>
                <span>${price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Service fee (5%)</span>
                <span>${serviceFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-white/10 pt-4 flex justify-between text-xl font-bold text-white">
                <span>Total</span>
                <span className="gradient-text">${total.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={askBook}
              className="mt-8 w-full py-4 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f97316] font-bold text-lg hover:scale-[1.02] hover:shadow-2xl hover:shadow-pink-500/40 transition-all duration-300"
            >
              Book Now 🎟️
            </button>
            <button
              onClick={askHold}
              className="mt-3 w-full py-3 rounded-2xl border border-[#f59e0b]/60 text-[#fcd34d] font-semibold hover:bg-[#f59e0b]/10 transition-all duration-300"
            >
              Hold for 10 minutes ⏳
            </button>
            <p className="mt-4 text-center text-xs text-white/40">🔒 Secure checkout · Instant confirmation</p>
          </div>

          {holds.length > 0 && (
            <div className="glass rounded-3xl p-8 h-fit">
              <h3 className="text-xl font-bold mb-2">Your Holds ⏳</h3>
              <p className="text-white/50 text-sm mb-4">Confirm before the timer runs out or the seat is released.</p>
              <div className="space-y-3">
                {holds.map((hold) => (
                  <div key={hold.id} className="flex items-center justify-between gap-3">
                    <span className="px-3 py-1 rounded-full bg-[#f59e0b]/20 text-[#fcd34d] text-sm">💺 {hold.seat}</span>
                    <HoldCountdown expiresAt={hold.expiresAt} onExpire={() => handleHoldExpired(hold)} />
                    <button
                      onClick={() => setPending({ kind: 'confirmHold', hold })}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-sm font-semibold hover:scale-105 transition-all duration-300"
                    >
                      Confirm
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
