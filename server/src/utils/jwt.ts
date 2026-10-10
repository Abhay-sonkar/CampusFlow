import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '../models/User';

export interface TokenPayload {
  sub: string; // user id
  role: Role;
}

export const signAccessToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// jwtid makes every refresh token unique, even if issued in the same second
export const signRefreshToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d', jwtid: crypto.randomUUID() });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as TokenPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as TokenPayload;

// We store only a hash of the refresh token in the database
export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');
