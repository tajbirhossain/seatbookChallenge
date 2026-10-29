import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HoldCountdown from '../components/HoldCountdown';
import ConfirmDialog from '../components/ConfirmDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [holds, setHolds] = useState<any[]>([]);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  // The action waiting for the user to confirm it in the dialog.
  const [pending, setPending] = useState<{ kind: 'cancel'; booking: any } | { kind: 'confirmHold'; hold: any } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadHolds = () => {
    fetch(`${API_URL}/bookings/holds`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setHolds(data))
      .catch(() => setHolds([]));
  };

  const loadBookings = () => {
    fetch(`${API_URL}/bookings/mine`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setBookings(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadBookings();
    loadHolds();
  }, []);

  // If the hold being confirmed runs out while the dialog is open, there is nothing left to confirm.
  useEffect(() => {
    if (pending?.kind === 'confirmHold' && !busy && !holds.some((h) => h.id === pending.hold.id)) {
      setPending(null);
    }
  }, [holds, pending, busy]);

  const runPending = async () => {
    if (!pending) return;

    setBusy(true);
    try {
      if (pending.kind === 'cancel') await cancelBooking(pending.booking.id);
      else await confirmHold(pending.hold);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const confirmHold = async (hold: any) => {
    const res = await fetch(`${API_URL}/bookings/${hold.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });

    if (res.ok) {
      showToast('success', `Seat ${hold.seat} confirmed! 🎉`);
    } else {
      const data = await res.json();
      showToast('error', '😢 ' + (data.error || data.msg));
    }
    loadBookings();
    loadHolds();
  };

  const holdExpired = (hold: any) => {
    setHolds((current) => current.filter((h) => h.id !== hold.id));
    showToast('error', `⌛ Your hold on seat ${hold.seat} expired`);
  };

  const cancelBooking = async (id: number) => {
    const res = await fetch(`${API_URL}/bookings/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });

    if (res.ok) {
      showToast('success', 'Booking cancelled successfully! ✅');
    } else {
      const data = await res.json().catch(() => null);
      showToast('error', '😢 ' + (data?.error || 'Could not cancel the booking'));
    }
    loadBookings();
  };

  // The summary boxes are worked out from the list, so they always match it and update after a cancel.
  // Cancelled bookings are counted on their own and left out of "Upcoming" and "Total Spent".
  const confirmed = bookings.filter((b) => b.status !== 'CANCELLED');
  const cancelledCount = bookings.length - confirmed.length;
  const upcoming = confirmed.filter((b) => new Date(b.event.startsAt) > new Date()).length;
  // Summed in cents so amounts like $0.10 + $0.20 don't pick up floating-point noise.
  const totalSpentCents = confirmed.reduce((sum, b) => sum + Math.round(parseFloat(b.event.price.replace('$', '')) * 100), 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-6 text-white/60 animate-pulse">Loading your bookings... 🎟️</p>
      </div>
    );
  }

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
          title={pending.kind === 'cancel' ? 'Cancel this booking?' : `Confirm seat ${pending.hold.seat}?`}
          confirmLabel={pending.kind === 'cancel' ? 'Yes, cancel booking' : 'Confirm booking'}
          cancelLabel={pending.kind === 'cancel' ? 'Keep booking' : 'Go back'}
          tone={pending.kind === 'cancel' ? 'danger' : 'primary'}
          busy={busy}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        >
          {(() => {
            const item = pending.kind === 'cancel' ? pending.booking : pending.hold;
            return (
              <>
                <p>
                  {pending.kind === 'cancel'
                    ? 'Your seat will be released and anyone will be able to book it. This can’t be undone.'
                    : 'This turns your hold into a booking.'}
                </p>
                <div className="rounded-2xl bg-white/5 p-4 space-y-2">
                  <div className="flex justify-between gap-4">
                    <span>Event</span>
                    <span className="text-white text-right">{item.event.title}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Seat</span>
                    <span className="text-white">{item.seat}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Date</span>
                    <span className="text-white">{item.event.startsAt.split('T')[0]}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Price</span>
                    <span className="text-white">{item.event.price}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </ConfirmDialog>
      )}

      <h1 className="text-5xl font-extrabold mb-2">
        My <span className="gradient-text">Bookings</span> 🎟️
      </h1>
      <p className="text-white/50 mb-10">All your amazing experiences in one place ✨</p>

      <div className="grid grid-cols-4 gap-6 mb-10">
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Total Bookings</div>
          <div className="text-4xl font-bold gradient-text">{bookings.length}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Upcoming</div>
          <div className="text-4xl font-bold gradient-text">{upcoming}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Cancelled</div>
          <div className="text-4xl font-bold text-[#fca5a5]">{cancelledCount}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Total Spent</div>
          <div className="text-4xl font-bold gradient-text">${(totalSpentCents / 100).toFixed(2)}</div>
        </div>
      </div>

      {holds.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-4">
            On <span className="gradient-text">Hold</span> ⏳
          </h2>
          <div className="space-y-4">
            {holds.map((h) => (
              <div key={h.id} className="glass rounded-2xl p-6 flex items-center justify-between min-w-[760px]">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center text-2xl">
                    ⏳
                  </div>
                  <div>
                    <div className="font-bold text-lg">{h.event.title}</div>
                    <div className="text-white/50 text-sm">
                      📍 {h.event.venue} · 📅 {h.event.startsAt.split('T')[0]}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="px-3 py-1 rounded-full bg-[#f59e0b]/20 text-[#fcd34d] text-sm">💺 {h.seat}</span>
                  <span className="font-bold">{h.event.price}</span>
                  <HoldCountdown expiresAt={h.expiresAt} onExpire={() => holdExpired(h)} />
                  <button
                    onClick={() => setPending({ kind: 'confirmHold', hold: h })}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-sm font-semibold hover:scale-105 transition-all duration-300"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookings.length === 0 && holds.length === 0 && (
        <div className="text-center py-20 text-white/40">
          <div className="text-6xl">🎭</div>
          <p className="mt-4">No bookings yet!</p>
          <Link to="/" className="text-[#a855f7]">
            Explore events →
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((b) => (
          <div key={b.id} className="glass rounded-2xl p-6 flex items-center justify-between min-w-[760px]">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f97316] flex items-center justify-center text-2xl">
                🎭
              </div>
              <div>
                <div className="font-bold text-lg">{b.event.title}</div>
                <div className="text-white/50 text-sm">
                  📍 {b.event.venue} · 📅 {b.event.startsAt.split('T')[0]}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="px-3 py-1 rounded-full bg-[#a855f7]/20 text-[#d8b4fe] text-sm">💺 {b.seat}</span>
              <span className="font-bold">{b.event.price}</span>
              <span
                className={`px-3 py-1 rounded-full text-sm ${
                  b.status === 'CANCELLED' ? 'bg-[#ef4444]/20 text-[#fca5a5]' : 'bg-[#22c55e]/20 text-[#86efac]'
                }`}
              >
                {b.status === 'CANCELLED' ? '✕' : '✓'} {b.status}
              </span>
              {b.status === 'CONFIRMED' && (
                <button
                  onClick={() => setPending({ kind: 'cancel', booking: b })}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-sm font-semibold hover:scale-105 transition-all duration-300"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
