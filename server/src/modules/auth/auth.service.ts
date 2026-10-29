import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { signToken } from '../../lib/jwt';

function toAuthResponse(user: { id: number; email: string; name: string; role: 'ORGANIZER' | 'ATTENDEE' }) {
  const token = signToken({ id: user.id, email: user.email, role: user.role });

  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function register(input: { email: string; password: string; name: string; role?: string }) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role === 'ORGANIZER' ? 'ORGANIZER' : 'ATTENDEE',
    },
  });

  return toAuthResponse(user);
}

// Returns null when the credentials are wrong.
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return null;
  }

  return toAuthResponse(user);
}
