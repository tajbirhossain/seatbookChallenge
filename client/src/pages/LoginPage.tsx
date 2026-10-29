import { useState, FormEvent } from 'react';
import GradientButton from '../components/GradientButton';
import FormField from '../components/FormField';
import { LIMITS } from '../limits';

const inputClass =
  'w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  // The server limits passwords in bytes (bcrypt ignores everything after 72 bytes).
  const passwordBytes = new TextEncoder().encode(password).length;
  const passwordTooShort = password.length > 0 && password.length < LIMITS.passwordMin;
  const passwordTooLong = passwordBytes > LIMITS.passwordMaxBytes;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const res = await fetch(`http://localhost:4000/auth/${isLogin ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isLogin ? { email, password } : { email, password, name }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = '/';
  };

  return (
    <div className="flex justify-center py-10">
      <div className="glass rounded-3xl p-10 w-[440px] glow">
        <div className="text-center mb-8">
          <div className="text-6xl animate-float">🎟️</div>
          <h1 className="mt-4 text-4xl font-extrabold">
            {isLogin ? 'Welcome ' : 'Join '}
            <span className="gradient-text">{isLogin ? 'Back!' : 'Seatbook!'}</span>
          </h1>
          <p className="mt-2 text-white/50">
            {isLogin ? 'Sign in to continue your journey ✨' : 'Start booking amazing events today 🚀'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <FormField
              label="Full name"
              htmlFor="name"
              hint={`Up to ${LIMITS.name} characters`}
              limit={{ used: name.length, max: LIMITS.name }}
            >
              <input
                id="name"
                placeholder="👤 Full name"
                value={name}
                maxLength={LIMITS.name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </FormField>
          )}
          <FormField
            label="Email address"
            htmlFor="email"
            hint={isLogin ? undefined : 'Used to sign in. Capital letters don’t matter.'}
          >
            <input
              id="email"
              placeholder="📧 Email address"
              value={email}
              maxLength={LIMITS.email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            hint={
              isLogin
                ? undefined
                : `At least ${LIMITS.passwordMin} characters, up to ${LIMITS.passwordMaxBytes} bytes (accents and emoji count extra)`
            }
            invalid={!isLogin && (passwordTooShort || passwordTooLong)}
            limit={isLogin ? undefined : { used: passwordBytes, max: LIMITS.passwordMaxBytes }}
          >
            <input
              id="password"
              type="password"
              placeholder="🔒 Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </FormField>
          {error && <p className="text-[#fca5a5] text-sm">⚠️ {error}</p>}
          <GradientButton type="submit">{isLogin ? 'Sign In 🚀' : 'Create Account ✨'}</GradientButton>
        </form>
        <p className="mt-6 text-center text-white/50">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => setIsLogin(!isLogin)} className="text-[#a855f7] cursor-pointer hover:underline">
            {isLogin ? 'Sign up' : 'Sign in'}
          </span>
        </p>
      </div>
    </div>
  );
}
