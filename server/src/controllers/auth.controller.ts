import { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { User } from '../models/User';
import * as authService from '../services/auth.service';
import { ApiError } from '../utils/ApiError';

const REFRESH_COOKIE = 'refreshToken';
const isProd = env.NODE_ENV === 'production';

// httpOnly: JavaScript in the browser can't read it, which blocks XSS theft
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax', // 'none' needed when frontend and API are on different domains
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

export async function register(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.registerUser(req.body);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.status(201).json({ success: true, user, accessToken });
}

export async function login(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.loginUser(req.body);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ success: true, user, accessToken });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new ApiError(401, 'Refresh token missing');
  const { accessToken, refreshToken } = await authService.refreshSession(token);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ success: true, accessToken });
}

export async function logout(req: Request, res: Response) {
  await authService.logoutUser(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ success: true, message: 'Logged out' });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ success: true, user: authService.toPublicUser(user) });
}
