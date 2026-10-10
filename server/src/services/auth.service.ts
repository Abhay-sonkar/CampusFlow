import bcrypt from 'bcrypt';
import { HydratedDocument } from 'mongoose';
import { IUser, User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { LoginInput, RegisterInput } from '../validators/auth.schema';

export function toPublicUser(user: HydratedDocument<IUser>) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    branch: user.branch,
    year: user.year,
    skills: user.skills,
    isEmailVerified: user.isEmailVerified,
  };
}

async function issueTokens(user: HydratedDocument<IUser>) {
  const payload = { sub: user._id.toString(), role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  // Remember only the newest refresh token (rotation)
  await User.updateOne({ _id: user._id }, { refreshTokenHash: hashToken(refreshToken) });
  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new ApiError(409, 'Email already registered');

  // Role is always STUDENT here. Never trust a role sent by the client.
  const user = await User.create({ ...input, role: 'STUDENT' });
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function loginUser({ email, password }: LoginInput) {
  const user = await User.findOne({ email }).select('+password');
  // Same message for both cases so attackers can't tell which emails exist
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function refreshSession(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }
  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  // Must match the latest token we issued; old or stolen copies are rejected
  if (!user || user.refreshTokenHash !== hashToken(refreshToken)) {
    throw new ApiError(401, 'Invalid refresh token');
  }
  return issueTokens(user);
}

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await User.updateOne({ _id: payload.sub }, { $unset: { refreshTokenHash: 1 } });
  } catch {
    // Token already invalid: nothing to revoke
  }
}
