jest.mock('../../src/jobs/enqueue', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));

import fs from 'fs';
import path from 'path';
import { enqueueJob } from '../../src/jobs/enqueue';
import { TestUser, api, auth, makeUser } from '../helpers/api';
import { startTestDb, stopTestDb } from '../helpers/db';

const enqueueMock = enqueueJob as jest.Mock;

let admin: TestUser;
let student: TestUser;
let otherStudent: TestUser;
let staff: TestUser;
let otherStaff: TestUser;
let department: string;

beforeAll(async () => {
  await startTestDb();
  admin = await makeUser('admin@test.com', 'COLLEGE_ADMIN');
  student = await makeUser('student@test.com');
  otherStudent = await makeUser('other@test.com');
  staff = await makeUser('staff@test.com', 'FACULTY');
  otherStaff = await makeUser('staff2@test.com', 'FACULTY');
  const res = await api().post('/api/departments').set(auth(admin.token)).send({ name: 'IT Support' });
  department = res.body.department._id;
});
afterAll(stopTestDb);

async function file(title = 'Wi-Fi is down in lab 3') {
  const res = await api()
    .post('/api/complaints')
    .set(auth(student.token))
    .send({ title, description: 'The Wi-Fi has not worked since this morning.', department });
  return res.body.complaint._id as string;
}
const assign = (id: string, assigneeId: string = staff.id, token: string = admin.token) =>
  api().post(`/api/complaints/${id}/assign`).set(auth(token)).send({ assigneeId });
const setStatus = (id: string, status: string, token: string, note?: string) =>
  api().post(`/api/complaints/${id}/status`).set(auth(token)).send({ status, note });
const get = (id: string, token: string) => api().get(`/api/complaints/${id}`).set(auth(token));

describe('filing a complaint', () => {
  it('starts OPEN, with the first history entry', async () => {
    const res = await api()
      .post('/api/complaints')
      .set(auth(student.token))
      .send({ title: 'Projector is broken', description: 'The projector in room 12 shows nothing.', department });
    expect(res.status).toBe(201);
    expect(res.body.complaint.status).toBe('OPEN');
    expect(res.body.complaint.history).toHaveLength(1);
  });

  it('rejects an unknown department (400) and invalid input (400)', async () => {
    const unknown = await api().post('/api/complaints').set(auth(student.token)).send({ title: 'Broken fan', description: 'The fan in room 4 is broken.', department: '000000000000000000000000' });
    expect(unknown.status).toBe(400);
    const invalid = await api().post('/api/complaints').set(auth(student.token)).send({ title: 'x', description: 'short', department });
    expect(invalid.status).toBe(400);
  });
});

describe('who can see a complaint', () => {
  it('shows it to its owner and to admins, but pretends it does not exist for others (404)', async () => {
    const id = await file();
    expect((await get(id, student.token)).status).toBe(200);
    expect((await get(id, admin.token)).status).toBe(200);
    expect((await get(id, otherStudent.token)).status).toBe(404);
    expect((await get(id, otherStaff.token)).status).toBe(404);
  });

  it('only lists complaints you filed or are assigned to', async () => {
    const id = await file('Listing visibility test');
    await assign(id);
    const mine = await api().get('/api/complaints').set(auth(student.token));
    const assigned = await api().get('/api/complaints').set(auth(staff.token));
    const stranger = await api().get('/api/complaints').set(auth(otherStudent.token));

    expect(mine.body.items.map((c: { _id: string }) => c._id)).toContain(id);
    expect(assigned.body.items.map((c: { _id: string }) => c._id)).toContain(id);
    expect(stranger.body.pagination.total).toBe(0);
  });
});

describe('assigning', () => {
  it('can only be done by an admin, and only to a staff member', async () => {
    const id = await file();
    expect((await assign(id, staff.id, student.token)).status).toBe(403);
    expect((await assign(id, otherStudent.id)).status).toBe(400);

    const ok = await assign(id);
    expect(ok.status).toBe(200);
    expect(ok.body.complaint.status).toBe('ASSIGNED');
    expect(ok.body.complaint.assignedTo._id).toBe(staff.id);
  });

  it('announces the change for the background worker', async () => {
    const id = await file();
    enqueueMock.mockClear();
    await assign(id);
    expect(enqueueMock).toHaveBeenCalledWith('complaint.updated', { complaintId: id, actorId: admin.id, status: 'ASSIGNED' });
  });
});

describe('the workflow rules', () => {
  it('refuses to skip steps', async () => {
    const id = await file();
    await assign(id);
    expect((await setStatus(id, 'RESOLVED', staff.token)).status).toBe(409); // ASSIGNED -> RESOLVED is not allowed
    expect((await api().post(`/api/complaints/${id}/confirm`).set(auth(student.token))).status).toBe(409); // not resolved yet
  });

  it('keeps students out of status changes (403) and strangers out entirely (404)', async () => {
    const id = await file();
    await assign(id);
    expect((await setStatus(id, 'IN_PROGRESS', student.token)).status).toBe(403);
    expect((await setStatus(id, 'IN_PROGRESS', otherStaff.token)).status).toBe(404);
  });

  it('lets only the student who filed it confirm the fix', async () => {
    const id = await file();
    await assign(id);
    await setStatus(id, 'IN_PROGRESS', staff.token);
    await setStatus(id, 'RESOLVED', staff.token, 'Router replaced');

    expect((await api().post(`/api/complaints/${id}/confirm`).set(auth(staff.token))).status).toBe(403);
    const confirmed = await api().post(`/api/complaints/${id}/confirm`).set(auth(student.token));
    expect(confirmed.body.complaint.status).toBe('CLOSED');
  });

  it('needs a reason to reopen, and a full cycle leaves 7 history entries', async () => {
    const id = await file();
    await assign(id);
    await setStatus(id, 'IN_PROGRESS', staff.token);
    await setStatus(id, 'RESOLVED', staff.token);

    expect((await api().post(`/api/complaints/${id}/reopen`).set(auth(student.token)).send({})).status).toBe(400);
    const reopened = await api().post(`/api/complaints/${id}/reopen`).set(auth(student.token)).send({ note: 'Still no Wi-Fi in the back row' });
    expect(reopened.body.complaint.status).toBe('IN_PROGRESS');

    await setStatus(id, 'RESOLVED', staff.token);
    await api().post(`/api/complaints/${id}/confirm`).set(auth(student.token));

    const final = await get(id, admin.token);
    expect(final.body.complaint.status).toBe('CLOSED');
    expect(final.body.complaint.history.map((h: { to: string }) => h.to)).toEqual([
      'OPEN',
      'ASSIGNED',
      'IN_PROGRESS',
      'RESOLVED',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
    ]);
  });

  it('lets only one of two simultaneous changes win (no silent overwrite)', async () => {
    const id = await file();
    await assign(id);
    const [a, b] = await Promise.all([setStatus(id, 'IN_PROGRESS', staff.token), setStatus(id, 'IN_PROGRESS', admin.token)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe('comments and evidence', () => {
  it('lets participants comment, keeps outsiders out, and stops after closing', async () => {
    const id = await file();
    await assign(id);

    const comment = (token: string) => api().post(`/api/complaints/${id}/comments`).set(auth(token)).send({ text: 'Any news on this?' });
    expect((await comment(student.token)).status).toBe(201);
    expect((await comment(staff.token)).status).toBe(201);
    expect((await comment(otherStudent.token)).status).toBe(404);

    await setStatus(id, 'IN_PROGRESS', staff.token);
    await setStatus(id, 'RESOLVED', staff.token);
    await api().post(`/api/complaints/${id}/confirm`).set(auth(student.token));
    expect((await comment(student.token)).status).toBe(409);
  });

  it('accepts a picture as evidence and refuses other file types', async () => {
    const id = await file();
    const upload = (content: Buffer, filename: string, contentType: string) =>
      api().post(`/api/complaints/${id}/evidence`).set(auth(student.token)).attach('files', content, { filename, contentType });

    const png = await upload(Buffer.from('not really a picture, but sent as one'), 'proof.png', 'image/png');
    expect(png.status).toBe(200);
    expect(png.body.complaint.evidence).toHaveLength(1);

    // Tidy up the file the test just wrote to the uploads folder
    fs.unlinkSync(path.join(process.cwd(), png.body.complaint.evidence[0].url));

    const text = await upload(Buffer.from('plain text'), 'notes.txt', 'text/plain');
    expect(text.status).toBe(400);
  });

  it('refuses a request with no file', async () => {
    const id = await file();
    expect((await api().post(`/api/complaints/${id}/evidence`).set(auth(student.token))).status).toBe(400);
  });
});
