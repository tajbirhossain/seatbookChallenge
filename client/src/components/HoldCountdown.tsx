import { useEffect, useRef, useState } from 'react';

function remainingMs(expiresAt: string) {
  return new Date(expiresAt).getTime() - Date.now();
}

function format(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Counts down to a hold's expiry and calls onExpire once when it runs out.
export default function HoldCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(() => remainingMs(expiresAt));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const ms = remainingMs(expiresAt);
      setRemaining(ms);
      if (ms <= 0) {
        clearInterval(timer);
        onExpireRef.current();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <span className={`font-mono font-bold ${remaining < 60 * 1000 ? 'text-[#fca5a5]' : 'text-[#fcd34d]'}`}>
      ⏳ {format(remaining)}
    </span>
  );
}
