import request from 'supertest';
import { app } from '../../src/app';
import { Role, User } from '../../src/models/User';
import { signAccessToken } from '../../src/utils/jwt';

export const PASSWORD = 'Test@1234';

// Supertest calls the Express app directly: no server to start, no port to open
export const api = () => request(app);
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

// Registers through the real API, then (if needed) promotes the user and signs a token with the new role
export async function makeUser(
  email: string,
  role: Role = 'STUDENT',
  profile: { name?: string; branch?: string; year?: number; skills?: string[] } = {}
): Promise<TestUser> {
  const res = await api()
    .post('/api/auth/register')
    .send({ name: email.split('@')[0], password: PASSWORD, email, ...profile });
  if (res.status !== 201) throw new Error(`Could not create ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const id: string = res.body.user.id;
  if (role !== 'STUDENT') await User.updateOne({ _id: id }, { role }); // registration always creates a STUDENT
  return { id, email, role, token: signAccessToken({ sub: id, role }) };
}
