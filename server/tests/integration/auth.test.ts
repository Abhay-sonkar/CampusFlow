import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { PASSWORD, api, auth, makeUser } from '../helpers/api';
import { startTestDb, stopTestDb } from '../helpers/db';

beforeAll(startTestDb);
afterAll(stopTestDb);

const register = (body: object) => api().post('/api/auth/register').send(body);
const login = (email: string, password = PASSWORD) => api().post('/api/auth/login').send({ email, password });
// "refreshToken=abc..." from the Set-Cookie header
const cookieOf = (res: { headers: any }) => (res.headers['set-cookie'][0] as string).split(';')[0];

describe('registration', () => {
  it('creates a STUDENT, returns an access token and sets a refresh cookie', async () => {
    const res = await register({ name: 'Asha', email: 'asha@test.com', password: PASSWORD, branch: 'CSE', year: 3 });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'asha@test.com', role: 'STUDENT', branch: 'CSE', year: 3 });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=.*HttpOnly/i);
  });

  it('ignores a role sent by the client (no promoting yourself to admin)', async () => {
    const res = await register({ name: 'Sneaky', email: 'sneaky@test.com', password: PASSWORD, role: 'COLLEGE_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STUDENT');
    expect((await User.findOne({ email: 'sneaky@test.com' }))?.role).toBe('STUDENT');
  });

  it('stores only a bcrypt hash of the password', async () => {
    await register({ name: 'Hashed', email: 'hashed@test.com', password: PASSWORD });
    const stored = await User.findOne({ email: 'hashed@test.com' }).select('+password');
    expect(stored?.password).not.toBe(PASSWORD);
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
  });

  it('never sends the password back', async () => {
    const res = await register({ name: 'Quiet', email: 'quiet@test.com', password: PASSWORD });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('refuses a second account with the same email, ignoring upper/lower case (409)', async () => {
    await register({ name: 'First', email: 'twin@test.com', password: PASSWORD });
    const again = await register({ name: 'Second', email: 'TWIN@test.com', password: PASSWORD });
    expect(again.status).toBe(409);
  });

  it('names the fields that failed validation (400)', async () => {
    const res = await register({ name: 'X', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('login', () => {
  beforeAll(async () => {
    await register({ name: 'Login User', email: 'login@test.com', password: PASSWORD });
  });

  it('returns a token for the right password', async () => {
    const res = await login('login@test.com');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('gives the same answer for a wrong password and an unknown email (so attackers learn nothing)', async () => {
    const wrongPassword = await login('login@test.com', 'Wrong@1234');
    const unknownEmail = await login('nobody@test.com');
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });
});

describe('access tokens', () => {
  it('lets a logged-in user read their own profile', async () => {
    const user = await makeUser('me@test.com');
    const res = await api().get('/api/auth/me').set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@test.com');
  });

  it('refuses requests with no token, a garbage token, an expired token or a token signed with another secret', async () => {
    const user = await makeUser('tokens@test.com');
    const expired = jwt.sign({ sub: user.id, role: 'STUDENT' }, 'test-access-secret-0123456789', { expiresIn: -10 });
    const forged = jwt.sign({ sub: user.id, role: 'COLLEGE_ADMIN' }, 'some-other-secret-key-123456');

    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(expired))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(forged))).status).toBe(401);
  });

  it('answers 404 when the account behind a valid token was deleted', async () => {
    const user = await makeUser('deleted@test.com');
    await User.deleteOne({ _id: user.id });
    expect((await api().get('/api/auth/me').set(auth(user.token))).status).toBe(404);
  });
});

describe('role-based access', () => {
  it('keeps students out of admin routes (403) and lets admins in', async () => {
    const student = await makeUser('student-rbac@test.com');
    const admin = await makeUser('admin-rbac@test.com', 'COLLEGE_ADMIN');
    expect((await api().get('/api/auth/admin-check').set(auth(student.token))).status).toBe(403);
    expect((await api().get('/api/auth/admin-check').set(auth(admin.token))).status).toBe(200);
  });
});

describe('refresh tokens', () => {
  it('issues a new access token from the cookie', async () => {
    await register({ name: 'Refresher', email: 'refresh@test.com', password: PASSWORD });
    const agent = request.agent(app); // an agent remembers cookies, like a browser
    await agent.post('/api/auth/login').send({ email: 'refresh@test.com', password: PASSWORD });
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('refuses a refresh with no cookie', async () => {
    expect((await api().post('/api/auth/refresh')).status).toBe(401);
  });

  it('replaces the token on every refresh, so a stolen old one stops working', async () => {
    await register({ name: 'Rotator', email: 'rotate@test.com', password: PASSWORD });
    const first = cookieOf(await login('rotate@test.com'));

    const refreshed = await api().post('/api/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);

    const replay = await api().post('/api/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    await register({ name: 'Leaver', email: 'leave@test.com', password: PASSWORD });
    const cookie = cookieOf(await login('leave@test.com'));

    expect((await api().post('/api/auth/logout').set('Cookie', cookie)).status).toBe(200);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('profile updates', () => {
  it('cleans up branch and skills', async () => {
    const user = await makeUser('profile@test.com');
    const res = await api().patch('/api/users/me').set(auth(user.token)).send({ branch: 'cse', year: 2, skills: ['React', 'react', 'Node'] });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ branch: 'CSE', year: 2, skills: ['react', 'node'] });
  });

  it('rejects an empty update, an impossible year, and a missing login', async () => {
    const user = await makeUser('profile2@test.com');
    expect((await api().patch('/api/users/me').set(auth(user.token)).send({})).status).toBe(400);
    expect((await api().patch('/api/users/me').set(auth(user.token)).send({ year: 9 })).status).toBe(400);
    expect((await api().patch('/api/users/me').send({ year: 2 })).status).toBe(401);
  });
});
