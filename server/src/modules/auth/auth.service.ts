import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { signToken } from '../../lib/jwt';

function toAuthResponse(user: { id: number; email: string; name: string; role: 'ORGANIZER' | 'ATTENDEE' }) {
  const token = signToken({ id: user.id, email: user.email, role: user.role });

  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function register(input: { email: string; password: string; name: string; role?: string }) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role === 'ORGANIZER' ? 'ORGANIZER' : 'ATTENDEE',
      },
    });

    return toAuthResponse(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Email already registered');
    }
    throw err;
  }
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
