import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  // bcrypt only uses the first 72 bytes, so cap the length
  password: z.string().min(8).max(72),
  branch: z.string().trim().optional(),
  year: z.coerce.number().int().min(1).max(5).optional(),
  skills: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
