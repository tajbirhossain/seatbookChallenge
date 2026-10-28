import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HoldCountdown from '../components/HoldCountdown';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);
  const [upcoming, setUpcoming] = useState(0);
  const [holds, setHolds] = useState<any[]>([]);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

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

        let spent = 0;
        let up = 0;
        data.forEach((b: any) => {
          spent += parseFloat(b.event.price.replace('$', ''));
          if (new Date(b.event.startsAt) > new Date()) up++;
        });
        setTotalSpent(spent);
        setUpcoming(up);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadBookings();
    loadHolds();
  }, []);

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
    if (!window.confirm('Are you sure you want to cancel? 😢')) return;

    await fetch(`${API_URL}/bookings/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    showToast('success', 'Booking cancelled successfully! ✅');
    loadBookings();
  };

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

      <h1 className="text-5xl font-extrabold mb-2">
        My <span className="gradient-text">Bookings</span> 🎟️
      </h1>
      <p className="text-white/50 mb-10">All your amazing experiences in one place ✨</p>

      <div className="grid grid-cols-3 gap-6 mb-10">
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Total Bookings</div>
          <div className="text-4xl font-bold gradient-text">{bookings.length}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Upcoming</div>
          <div className="text-4xl font-bold gradient-text">{upcoming}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Total Spent</div>
          <div className="text-4xl font-bold gradient-text">${totalSpent.toFixed(2)}</div>
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
                    onClick={() => confirmHold(h)}
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
              <span className="px-3 py-1 rounded-full bg-[#22c55e]/20 text-[#86efac] text-sm">✓ {b.status}</span>
              <button
                onClick={() => cancelBooking(b.id)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-sm font-semibold hover:scale-105 transition-all duration-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
