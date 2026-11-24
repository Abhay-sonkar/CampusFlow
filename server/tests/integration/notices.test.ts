jest.mock('../../src/jobs/enqueue', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));

import { enqueueJob } from '../../src/jobs/enqueue';
import { TestUser, api, auth, makeUser } from '../helpers/api';
import { startTestDb, stopTestDb } from '../helpers/db';

const enqueueMock = enqueueJob as jest.Mock;

let admin: TestUser;
let faculty: TestUser;
let otherFaculty: TestUser;
let cse: TestUser; // registered with a LOWER case branch on purpose
let ece: TestUser;

beforeAll(async () => {
  await startTestDb();
  admin = await makeUser('admin@test.com', 'COLLEGE_ADMIN');
  faculty = await makeUser('fac1@test.com', 'FACULTY');
  otherFaculty = await makeUser('fac2@test.com', 'FACULTY');
  cse = await makeUser('cse@test.com', 'STUDENT', { branch: 'cse', year: 3 });
  ece = await makeUser('ece@test.com', 'STUDENT', { branch: 'ECE', year: 2 });
});
afterAll(stopTestDb);

const create = (token: string, body: object) => api().post('/api/notices').set(auth(token)).send(body);
const publish = (token: string, id: string) => api().post(`/api/notices/${id}/publish`).set(auth(token));
const feed = (token: string, query = '') => api().get(`/api/notices${query}`).set(auth(token));
const titles = (res: { body: { items: { title: string }[] } }) => res.body.items.map((n) => n.title);

describe('who can write notices', () => {
  it('keeps students out (403)', async () => {
    const res = await create(cse.token, { title: 'Hello world', content: 'Not allowed.' });
    expect(res.status).toBe(403);
  });

  it('lets faculty create one, always as a draft', async () => {
    const res = await create(faculty.token, { title: 'Lab timings changed', content: 'New timings from Monday.' });
    expect(res.status).toBe(201);
    expect(res.body.notice.status).toBe('DRAFT');
  });

  it('lets only a COLLEGE_ADMIN pin a notice', async () => {
    const body = { title: 'Important announcement', content: 'Read this.', isPinned: true };
    expect((await create(faculty.token, body)).status).toBe(403);
    expect((await create(admin.token, body)).status).toBe(201);
  });

  it('validates the input (400)', async () => {
    expect((await create(faculty.token, { title: 'ab', content: 'x' })).status).toBe(400);
  });

  it('lets you edit your own notice but not someone else\'s; an admin may edit any', async () => {
    const created = await create(faculty.token, { title: 'Draft by faculty one', content: 'Some content.' });
    const id = created.body.notice._id;

    const strangerEdit = await api().patch(`/api/notices/${id}`).set(auth(otherFaculty.token)).send({ title: 'Hijacked title' });
    const ownerEdit = await api().patch(`/api/notices/${id}`).set(auth(faculty.token)).send({ title: 'Edited by owner' });
    const adminEdit = await api().patch(`/api/notices/${id}`).set(auth(admin.token)).send({ title: 'Edited by admin' });

    expect(strangerEdit.status).toBe(403);
    expect(ownerEdit.status).toBe(200);
    expect(adminEdit.body.notice.title).toBe('Edited by admin');
  });
});

describe('the personalised feed', () => {
  it('hides drafts, and shows a published notice only to its audience', async () => {
    const created = await create(faculty.token, {
      title: 'CSE third year exam schedule',
      content: 'Exams begin next week.',
      audience: { branches: ['CSE'], years: [3] },
    });
    const id = created.body.notice._id;

    expect(titles(await feed(cse.token))).not.toContain('CSE third year exam schedule'); // still a draft

    await publish(faculty.token, id);

    expect(titles(await feed(cse.token))).toContain('CSE third year exam schedule');
    expect(titles(await feed(ece.token))).not.toContain('CSE third year exam schedule');
  });

  it('matches the branch ignoring upper/lower case (the CSE student was registered as "cse")', async () => {
    const created = await create(faculty.token, { title: 'Case insensitive audience', content: 'Hello.', audience: { branches: ['CSE'] } });
    await publish(faculty.token, created.body.notice._id);
    expect(titles(await feed(cse.token))).toContain('Case insensitive audience');
  });

  it('shows a notice with no audience to everybody', async () => {
    const created = await create(faculty.token, { title: 'Holiday on Friday', content: 'Campus closed.' });
    await publish(faculty.token, created.body.notice._id);
    expect(titles(await feed(cse.token))).toContain('Holiday on Friday');
    expect(titles(await feed(ece.token))).toContain('Holiday on Friday');
  });

  it('hides a notice again when it is unpublished', async () => {
    const created = await create(faculty.token, { title: 'Temporary notice', content: 'Soon gone.' });
    const id = created.body.notice._id;
    await publish(faculty.token, id);
    expect(titles(await feed(cse.token))).toContain('Temporary notice');

    await api().post(`/api/notices/${id}/unpublish`).set(auth(faculty.token));
    expect(titles(await feed(cse.token))).not.toContain('Temporary notice');
  });

  it('puts pinned notices first', async () => {
    const created = await create(admin.token, { title: 'Pinned for everyone', content: 'Top of the list.', isPinned: true });
    await publish(admin.token, created.body.notice._id);
    const res = await feed(cse.token);
    expect(res.body.items[0].isPinned).toBe(true);
  });

  it('finds notices by search', async () => {
    const created = await create(faculty.token, { title: 'Quarterly robotics workshop', content: 'Bring a laptop.' });
    await publish(faculty.token, created.body.notice._id);
    expect(titles(await feed(cse.token, '?q=robotics'))).toContain('Quarterly robotics workshop');
  });

  it('paginates', async () => {
    const res = await feed(cse.token, '?limit=2');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination.pages).toBeGreaterThan(1);
  });

  it('says BYPASS in X-Cache when Redis is not in use', async () => {
    expect((await feed(cse.token)).headers['x-cache']).toBe('BYPASS');
  });

  it('answers 404 for a notice that is not meant for you, and 401 without a login', async () => {
    const created = await create(faculty.token, { title: 'For ECE only', content: 'Secret.', audience: { branches: ['ECE'] } });
    const id = created.body.notice._id;
    await publish(faculty.token, id);

    expect((await api().get(`/api/notices/${id}`).set(auth(ece.token))).status).toBe(200);
    expect((await api().get(`/api/notices/${id}`).set(auth(cse.token))).status).toBe(404);
    expect((await api().get(`/api/notices/${id}`)).status).toBe(401);
  });
});

describe('events for the background worker', () => {
  it('announces a publication with the notice id', async () => {
    const created = await create(faculty.token, { title: 'Event test notice', content: 'Hello.' });
    const id = created.body.notice._id;

    enqueueMock.mockClear();
    await publish(faculty.token, id);

    expect(enqueueMock).toHaveBeenCalledWith('notice.published', { noticeId: id });
  });

  it('announces nothing for a draft', async () => {
    enqueueMock.mockClear();
    await create(faculty.token, { title: 'Quiet draft notice', content: 'Hello.' });
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
