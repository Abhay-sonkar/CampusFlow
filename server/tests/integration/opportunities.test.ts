jest.mock('../../src/jobs/enqueue', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));

import { Application } from '../../src/models/Application';
import { Bookmark } from '../../src/models/Bookmark';
import { Opportunity } from '../../src/models/Opportunity';
import { TestUser, api, auth, makeUser } from '../helpers/api';
import { startTestDb, stopTestDb } from '../helpers/db';
import { daysFromNow, isoIn } from '../helpers/time';

let admin: TestUser;
let staff: TestUser;
let cse: TestUser; // CSE, year 3, knows react / node / mongodb
let ece: TestUser; // ECE, year 2, knows embedded / c

beforeAll(async () => {
  await startTestDb();
  admin = await makeUser('admin@test.com', 'COLLEGE_ADMIN');
  staff = await makeUser('staff@test.com', 'FACULTY');
  cse = await makeUser('cse@test.com', 'STUDENT', { branch: 'CSE', year: 3, skills: ['React', 'Node', 'MongoDB'] });
  ece = await makeUser('ece@test.com', 'STUDENT', { branch: 'ECE', year: 2, skills: ['Embedded', 'C'] });
});
afterAll(stopTestDb);

let counter = 0;
const body = (overrides: object = {}) => ({
  title: `Opportunity ${++counter}`,
  description: 'A test opportunity posting.',
  category: 'EVENT',
  organization: 'Acme',
  deadline: isoIn(10, 12),
  ...overrides,
});
const post = (token: string, overrides: object = {}) => api().post('/api/opportunities').set(auth(token)).send(body(overrides));
const idOf = (res: { body: { opportunity: { _id: string } } }) => res.body.opportunity._id;
const detail = (token: string, id: string) => api().get(`/api/opportunities/${id}`).set(auth(token));
const browse = (token: string, query: string) => api().get(`/api/opportunities?${query}`).set(auth(token));
const titlesOf = (res: { body: { items: { title: string }[] } }) => res.body.items.map((o) => o.title);

describe('posting opportunities', () => {
  it('lets staff post but not students', async () => {
    expect((await post(cse.token)).status).toBe(403);
    expect((await post(staff.token)).status).toBe(201);
  });

  it('rejects a past deadline, an unknown category and a non-http apply link', async () => {
    expect((await post(staff.token, { deadline: isoIn(-2, 12) })).status).toBe(400);
    expect((await post(staff.token, { category: 'PARTY' })).status).toBe(400);
    expect((await post(staff.token, { applyUrl: 'ftp://example.com/x' })).status).toBe(400);
  });

  it('cleans up branches and skills', async () => {
    const res = await post(staff.token, { eligibility: { branches: ['cse'] }, skills: ['React', 'react'] });
    expect(res.body.opportunity.eligibility.branches).toEqual(['CSE']);
    expect(res.body.opportunity.skills).toEqual(['react']);
  });

  it('lets you edit your own posting, not someone else\'s (an admin may edit any)', async () => {
    const mine = idOf(await post(staff.token));
    const theirs = idOf(await post(admin.token));
    expect((await api().patch(`/api/opportunities/${mine}`).set(auth(staff.token)).send({ title: 'Edited title' })).status).toBe(200);
    expect((await api().patch(`/api/opportunities/${theirs}`).set(auth(staff.token)).send({ title: 'Hijacked' })).status).toBe(403);
    expect((await api().patch(`/api/opportunities/${mine}`).set(auth(admin.token)).send({ location: 'Remote' })).status).toBe(200);
    expect((await api().patch(`/api/opportunities/${mine}`).set(auth(staff.token)).send({ deadline: isoIn(-1, 12) })).status).toBe(400);
  });

  it('deletes the bookmarks and applications along with the posting', async () => {
    const id = idOf(await post(staff.token));
    await api().post(`/api/opportunities/${id}/bookmark`).set(auth(cse.token));
    await api().post(`/api/opportunities/${id}/apply`).set(auth(cse.token));

    expect((await api().delete(`/api/opportunities/${id}`).set(auth(cse.token))).status).toBe(403);
    expect((await api().delete(`/api/opportunities/${id}`).set(auth(staff.token))).status).toBe(200);

    expect(await Bookmark.countDocuments({ opportunity: id })).toBe(0);
    expect(await Application.countDocuments({ opportunity: id })).toBe(0);
    expect((await detail(cse.token, id)).status).toBe(404);
  });
});

describe('browsing and filtering', () => {
  let internship: string;
  let hidden: string;

  // Six postings that share one search word ("zzbrowse"), so the filters below only look at these
  beforeAll(async () => {
    internship = idOf(await post(staff.token, { title: 'zzbrowse React Internship', category: 'INTERNSHIP', skills: ['react', 'node'], eligibility: { branches: ['CSE'], years: [3, 4] }, deadline: isoIn(5, 12) }));
    await post(admin.token, { title: 'zzbrowse Embedded Hackathon', category: 'HACKATHON', skills: ['embedded', 'c'], eligibility: { branches: ['ECE', 'EEE'] }, deadline: isoIn(20, 12) });
    await post(admin.token, { title: 'zzbrowse Open Scholarship', category: 'SCHOLARSHIP', deadline: isoIn(30, 12) });
    await post(admin.token, { title: 'zzbrowse First Year Workshop', category: 'WORKSHOP', eligibility: { years: [1] }, deadline: isoIn(10, 12) });
    await post(admin.token, { title: 'zzbrowse Node Contest', category: 'CONTEST', skills: ['node'], deadline: isoIn(3, 12) });
    hidden = idOf(await post(staff.token, { title: 'zzbrowse Open Internship', category: 'INTERNSHIP', deadline: isoIn(25, 12) }));
  });

  it('lists everything, soonest deadline first', async () => {
    const res = await browse(cse.token, 'q=zzbrowse');
    expect(res.body.pagination.total).toBe(6);
    expect(res.body.items[0].title).toBe('zzbrowse Node Contest');
  });

  it('filters by category, skill, and days until the deadline', async () => {
    expect((await browse(cse.token, 'q=zzbrowse&category=INTERNSHIP')).body.pagination.total).toBe(2);
    expect((await browse(cse.token, 'q=zzbrowse&skills=node')).body.pagination.total).toBe(2);
    expect((await browse(cse.token, 'q=zzbrowse&closingWithin=7')).body.pagination.total).toBe(2);
  });

  it('shows only what the student is eligible for', async () => {
    expect(titlesOf(await browse(cse.token, 'q=zzbrowse&eligibleForMe=true')).sort()).toEqual([
      'zzbrowse Node Contest',
      'zzbrowse Open Internship',
      'zzbrowse Open Scholarship',
      'zzbrowse React Internship',
    ]);
    expect((await browse(ece.token, 'q=zzbrowse&eligibleForMe=true')).body.pagination.total).toBe(4);
  });

  it('filters by a branch', async () => {
    expect((await browse(cse.token, 'q=zzbrowse&branch=ECE')).body.pagination.total).toBe(5); // everything except the CSE-only internship
  });

  it('sorts by newest and paginates', async () => {
    expect((await browse(cse.token, 'q=zzbrowse&sort=newest')).body.items[0].title).toBe('zzbrowse Open Internship');
    const page2 = await browse(cse.token, 'q=zzbrowse&limit=4&page=2');
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.pagination.pages).toBe(2);
  });

  it('rejects an unknown category filter (400) and a missing login (401)', async () => {
    expect((await browse(cse.token, 'category=PARTY')).status).toBe(400);
    expect((await api().get('/api/opportunities')).status).toBe(401);
  });

  it('tells each viewer whether they are eligible', async () => {
    expect((await detail(cse.token, internship)).body.opportunity.viewer.eligible).toBe(true);
    expect((await detail(ece.token, internship)).body.opportunity.viewer.eligible).toBe(false);
  });

  it('hides a deactivated posting from students but not from its owner', async () => {
    await api().patch(`/api/opportunities/${hidden}`).set(auth(staff.token)).send({ isActive: false });

    expect((await browse(cse.token, 'q=zzbrowse')).body.pagination.total).toBe(5);
    expect((await detail(cse.token, hidden)).status).toBe(404);
    expect((await detail(staff.token, hidden)).status).toBe(200);
    expect((await browse(staff.token, 'q=zzbrowse&mine=true')).body.pagination.total).toBe(2); // the internship and the hidden one
  });
});

describe('expired postings', () => {
  // The API refuses a past deadline, so these are inserted straight into the database
  let expired: string;
  beforeAll(async () => {
    const doc = await Opportunity.create({
      title: 'zzexpired Old Hackathon',
      description: 'This one is over.',
      category: 'HACKATHON',
      organization: 'Acme',
      deadline: daysFromNow(-2),
      createdBy: staff.id,
    });
    expired = doc.id;
  });

  it('are hidden unless you ask for them', async () => {
    expect((await browse(cse.token, 'q=zzexpired')).body.pagination.total).toBe(0);
    expect((await browse(cse.token, 'q=zzexpired&includeExpired=true')).body.pagination.total).toBe(1);
  });

  it('cannot be applied to (409)', async () => {
    expect((await api().post(`/api/opportunities/${expired}/apply`).set(auth(cse.token))).status).toBe(409);
  });
});

describe('bookmarks', () => {
  it('can be added twice without counting twice, and removed again', async () => {
    const id = idOf(await post(staff.token));
    const add = () => api().post(`/api/opportunities/${id}/bookmark`).set(auth(cse.token));
    const remove = () => api().delete(`/api/opportunities/${id}/bookmark`).set(auth(cse.token));

    await add();
    await add();
    expect((await detail(cse.token, id)).body.opportunity).toMatchObject({ bookmarkCount: 1, viewer: { bookmarked: true } });

    const listed = await api().get('/api/opportunities/bookmarks').set(auth(cse.token));
    expect(listed.body.items.map((b: { opportunity: { _id: string } }) => b.opportunity._id)).toContain(id);
    expect((await api().get('/api/opportunities/bookmarks').set(auth(ece.token))).body.pagination.total).toBe(0);

    await remove();
    await remove(); // removing twice must not push the counter below zero
    expect((await detail(cse.token, id)).body.opportunity.bookmarkCount).toBe(0);
  });

  it('answers 404 for an unknown posting', async () => {
    expect((await api().post('/api/opportunities/000000000000000000000000/bookmark').set(auth(cse.token))).status).toBe(404);
  });
});

describe('the application tracker', () => {
  it('lets an eligible student apply once, with or without notes', async () => {
    const id = idOf(await post(staff.token, { eligibility: { branches: ['CSE'] } }));
    const first = await api().post(`/api/opportunities/${id}/apply`).set(auth(cse.token));
    expect(first.status).toBe(201);
    expect(first.body.application.status).toBe('APPLIED');
    expect((await api().post(`/api/opportunities/${id}/apply`).set(auth(cse.token)).send({ notes: 'Again' })).status).toBe(409);
    expect((await detail(cse.token, id)).body.opportunity).toMatchObject({ applicationCount: 1, viewer: { applicationStatus: 'APPLIED' } });
  });

  it('refuses a student who is not eligible (403)', async () => {
    const id = idOf(await post(staff.token, { eligibility: { branches: ['CSE'] } }));
    expect((await api().post(`/api/opportunities/${id}/apply`).set(auth(ece.token))).status).toBe(403);
  });

  it('lets students update and remove only their own applications', async () => {
    const id = idOf(await post(staff.token));
    const applied = await api().post(`/api/opportunities/${id}/apply`).set(auth(cse.token));
    const appId = applied.body.application._id;

    const updated = await api().patch(`/api/applications/${appId}`).set(auth(cse.token)).send({ status: 'SHORTLISTED', notes: 'Interview on Friday' });
    expect(updated.body.application.status).toBe('SHORTLISTED');
    expect((await api().patch(`/api/applications/${appId}`).set(auth(cse.token)).send({ status: 'WON' })).status).toBe(400);
    expect((await api().patch(`/api/applications/${appId}`).set(auth(ece.token)).send({ status: 'REJECTED' })).status).toBe(404);

    const shortlisted = await api().get('/api/applications?status=SHORTLISTED').set(auth(cse.token));
    expect(shortlisted.body.items.map((a: { _id: string }) => a._id)).toContain(appId);

    expect((await api().delete(`/api/applications/${appId}`).set(auth(cse.token))).status).toBe(200);
    expect((await detail(cse.token, id)).body.opportunity.applicationCount).toBe(0);
  });
});

describe('recommendations', () => {
  const marked = (res: { body: { items: { title: string }[] } }) => res.body.items.filter((o) => o.title.includes('zzrec'));
  let react: string;

  beforeAll(async () => {
    react = idOf(await post(staff.token, { title: 'zzrec React Internship', category: 'INTERNSHIP', skills: ['react', 'node'], eligibility: { branches: ['CSE'], years: [3, 4] }, deadline: isoIn(5, 12) }));
    await post(admin.token, { title: 'zzrec Node Contest', category: 'CONTEST', skills: ['node'], deadline: isoIn(3, 12) });
    await post(admin.token, { title: 'zzrec Open Scholarship', category: 'SCHOLARSHIP', deadline: isoIn(30, 12) });
    await post(admin.token, { title: 'zzrec First Year Workshop', category: 'WORKSHOP', eligibility: { years: [1] }, deadline: isoIn(10, 12) });
    await post(admin.token, { title: 'zzrec Embedded Hackathon', category: 'HACKATHON', skills: ['embedded', 'c'], eligibility: { branches: ['ECE', 'EEE'] }, deadline: isoIn(20, 12) });
    await post(staff.token, { title: 'zzrec Open Internship', category: 'INTERNSHIP', deadline: isoIn(25, 12) });
  });

  it('ranks the best match first, with exact scores and reasons', async () => {
    const items = marked(await api().get('/api/opportunities/recommended?limit=20').set(auth(cse.token)));
    expect(items.map((o: any) => [o.title, o.score])).toEqual([
      ['zzrec React Internship', 75],
      ['zzrec Node Contest', 30],
    ]);
    expect((items[0] as any).reasons.join(' ')).toContain('skills');
  });

  it('never recommends what the student is not eligible for, or has nothing to do with them', async () => {
    const titles = marked(await api().get('/api/opportunities/recommended?limit=20').set(auth(cse.token))).map((o) => o.title);
    expect(titles).not.toContain('zzrec Embedded Hackathon'); // wrong branch
    expect(titles).not.toContain('zzrec First Year Workshop'); // wrong year
    expect(titles).not.toContain('zzrec Open Scholarship'); // open to all, but nothing links it to this student
    expect(titles).not.toContain('zzrec Open Internship');
  });

  it('recommends the embedded hackathon to the ECE student', async () => {
    const items = marked(await api().get('/api/opportunities/recommended?limit=20').set(auth(ece.token)));
    expect(items.map((o: any) => [o.title, o.score])).toEqual([['zzrec Embedded Hackathon', 55]]);
  });

  it('stops recommending what you applied to, and learns your interests from it', async () => {
    await api().post(`/api/opportunities/${react}/apply`).set(auth(cse.token));
    const items = marked(await api().get('/api/opportunities/recommended?limit=20').set(auth(cse.token)));
    expect(items.map((o: any) => [o.title, o.score])).toEqual([
      ['zzrec Node Contest', 30],
      ['zzrec Open Internship', 10], // now relevant: the student applied to an internship before
    ]);
    expect((items[1] as any).reasons.join(' ')).toContain('interest');
  });
});
