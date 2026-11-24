jest.mock('../../src/jobs/enqueue', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));

import mongoose from 'mongoose';
import { enqueueJob } from '../../src/jobs/enqueue';
import { processJob } from '../../src/jobs/handlers';
import { Application } from '../../src/models/Application';
import { Bookmark } from '../../src/models/Bookmark';
import { Booking } from '../../src/models/Booking';
import { Complaint } from '../../src/models/Complaint';
import { Notice } from '../../src/models/Notice';
import { Notification } from '../../src/models/Notification';
import { Opportunity } from '../../src/models/Opportunity';
import { slotsFor } from '../../src/utils/slots';
import { TestUser, api, auth, makeUser } from '../helpers/api';
import { startTestDb, stopTestDb } from '../helpers/db';
import { daysFromNow, hoursFromNow } from '../helpers/time';

const enqueueMock = enqueueJob as jest.Mock;

let admin: TestUser;
let author: TestUser; // FACULTY, also CSE year 3, to prove authors are never told about their own notice
let cse1: TestUser;
let cse2: TestUser; // branch registered in lower case
let ece: TestUser;

beforeAll(async () => {
  await startTestDb();
  admin = await makeUser('admin@test.com', 'COLLEGE_ADMIN', { branch: 'CSE', year: 3 });
  author = await makeUser('author@test.com', 'FACULTY', { branch: 'CSE', year: 3 });
  cse1 = await makeUser('cse1@test.com', 'STUDENT', { branch: 'CSE', year: 3 });
  cse2 = await makeUser('cse2@test.com', 'STUDENT', { branch: 'cse', year: 3 });
  ece = await makeUser('ece@test.com', 'STUDENT', { branch: 'ECE', year: 2 });
});
afterAll(stopTestDb);

const recipients = async (dedupeKey: string) => (await Notification.find({ dedupeKey })).map((n) => String(n.user)).sort();
const emailJobs = () => enqueueMock.mock.calls.filter((call) => call[0] === 'email.send');

describe('job: notice.published', () => {
  const publishedNotice = (overrides: object = {}) =>
    Notice.create({
      title: 'Mid-sem schedule',
      content: 'Exams begin next week.',
      createdBy: author.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      audience: { roles: [], branches: ['CSE'], years: [3] },
      ...overrides,
    });

  it('notifies exactly the audience, never the author', async () => {
    const notice = await publishedNotice();
    await processJob('notice.published', { noticeId: notice.id });
    // The admin is CSE year 3 as well, so they are part of the audience too
    expect(await recipients(`notice:${notice.id}`)).toEqual([admin.id, cse1.id, cse2.id].sort());
  });

  it('is safe to run twice: no duplicate notifications', async () => {
    const notice = await publishedNotice({ title: 'Run twice notice' });
    await processJob('notice.published', { noticeId: notice.id });
    await processJob('notice.published', { noticeId: notice.id });
    expect(await Notification.countDocuments({ dedupeKey: `notice:${notice.id}` })).toBe(3);
  });

  it('does nothing for a notice that is no longer published', async () => {
    const notice = await publishedNotice({ title: 'Unpublished notice', status: 'DRAFT' });
    await processJob('notice.published', { noticeId: notice.id });
    expect(await Notification.countDocuments({ dedupeKey: `notice:${notice.id}` })).toBe(0);
  });

  it('also queues emails, but only for pinned notices', async () => {
    const normal = await publishedNotice({ title: 'Ordinary notice' });
    enqueueMock.mockClear();
    await processJob('notice.published', { noticeId: normal.id });
    expect(emailJobs()).toHaveLength(0);

    const pinned = await publishedNotice({ title: 'Pinned notice', isPinned: true });
    enqueueMock.mockClear();
    await processJob('notice.published', { noticeId: pinned.id });
    expect(emailJobs()).toHaveLength(3);
    expect(emailJobs()[0][1]).toMatchObject({ subject: 'New notice: Pinned notice' });
  });
});

describe('job: complaint.updated', () => {
  const complaint = (status: string, history: object[]) =>
    Complaint.create({
      title: 'Wi-Fi down in lab 3',
      description: 'The Wi-Fi has not worked since this morning.',
      department: new mongoose.Types.ObjectId(),
      createdBy: cse1.id,
      assignedTo: author.id,
      status,
      history,
    });
  const step = (from: string | null, to: string, by: string, note?: string) => ({ from, to, by, note });

  it('tells the student and the assignee when the admin assigns it', async () => {
    const c = await complaint('ASSIGNED', [step(null, 'OPEN', cse1.id), step('OPEN', 'ASSIGNED', admin.id)]);
    await processJob('complaint.updated', { complaintId: c.id, actorId: admin.id, status: 'ASSIGNED' });

    const mine = await Notification.find({ dedupeKey: `complaint:${c.id}:2` });
    expect(mine.map((n) => [String(n.user), n.title])).toEqual(
      expect.arrayContaining([
        [cse1.id, 'Your complaint was assigned: Wi-Fi down in lab 3'],
        [author.id, 'New complaint assigned to you: Wi-Fi down in lab 3'],
      ])
    );
    expect(mine).toHaveLength(2); // the admin who did it is not told
  });

  it('does not tell people about their own action, and emails the student when resolved', async () => {
    const c = await complaint('RESOLVED', [step(null, 'OPEN', cse1.id), step('OPEN', 'ASSIGNED', admin.id), step('ASSIGNED', 'IN_PROGRESS', author.id), step('IN_PROGRESS', 'RESOLVED', author.id)]);
    enqueueMock.mockClear();
    await processJob('complaint.updated', { complaintId: c.id, actorId: author.id, status: 'RESOLVED' });

    expect(await recipients(`complaint:${c.id}:4`)).toEqual([cse1.id]);
    expect(emailJobs()).toHaveLength(1);
  });
});

describe('job: booking.decided', () => {
  const decidedBooking = async (status: string, extra: object = {}) => {
    // Inserted without the Resource model on purpose: the worker does not load the API, so the handler
    // has to register every model it needs itself. If it did not, populate() would fail here.
const { insertedId } = await mongoose.connection.collection('resources').insertOne({
  name: `Lab Regression ${Date.now()}-${Math.random()}`,
  type: 'LAB',
  isActive: true,
});
    const start = new Date(Date.UTC(2031, 0, 5, 10));
    const end = new Date(Date.UTC(2031, 0, 5, 11));
    return Booking.create({
      resource: insertedId,
      bookedBy: cse1.id,
      purpose: 'Project work',
      start,
      end,
      slots: slotsFor(start, end),
      status,
      holdsSlot: status === 'APPROVED',
      decidedBy: admin.id,
      ...extra,
    });
  };

  it('tells the student their booking was approved, and emails them', async () => {
    const booking = await decidedBooking('APPROVED');
    enqueueMock.mockClear();
    await processJob('booking.decided', { bookingId: booking.id });

    const [note] = await Notification.find({ dedupeKey: `booking:${booking.id}:APPROVED` });
    expect(String(note.user)).toBe(cse1.id);
    expect(note.title).toMatch(/^Booking approved: Lab Regression/);
    expect(emailJobs()).toHaveLength(1);
  });

  it('includes the reason when a booking is rejected', async () => {
    const booking = await decidedBooking('REJECTED', { decisionNote: 'Lab is needed for an exam' });
    await processJob('booking.decided', { bookingId: booking.id });

    const [note] = await Notification.find({ dedupeKey: `booking:${booking.id}:REJECTED` });
    expect(note.title).toMatch(/^Booking rejected/);
    expect(note.body).toContain('Lab is needed for an exam');
  });

  it('stays quiet when someone decides their own booking', async () => {
    const booking = await decidedBooking('APPROVED', { decidedBy: cse1.id });
    await processJob('booking.decided', { bookingId: booking.id });
    expect(await Notification.countDocuments({ dedupeKey: `booking:${booking.id}:APPROVED` })).toBe(0);
  });
});

describe('job: opportunity.created', () => {
  it('tells only the students the posting is open to', async () => {
    const opp = await Opportunity.create({
      title: 'CSE only internship',
      description: 'Open to CSE students.',
      category: 'INTERNSHIP',
      organization: 'Acme',
      deadline: daysFromNow(10),
      eligibility: { branches: ['CSE'], years: [] },
      createdBy: author.id,
    });
    await processJob('opportunity.created', { opportunityId: opp.id });
    // The faculty author and the admin are not STUDENTs, and the ECE student is not eligible
    expect(await recipients(`opp:${opp.id}:new`)).toEqual([cse1.id, cse2.id].sort());
  });
});

describe('job: deadlines.scan', () => {
  const opportunity = (title: string, deadline: Date, extra: object = {}) =>
    Opportunity.create({ title, description: 'A posting with a deadline.', category: 'CONTEST', organization: 'Acme', deadline, createdBy: author.id, ...extra });
  const reminders = (title: string) => Notification.find({ title: `Closing within 24 hours: ${title}` });

  it('reminds people who saved a posting but have not applied, once', async () => {
    const soon = await opportunity('Closing contest', hoursFromNow(10));
    await Bookmark.create({ user: cse1.id, opportunity: soon._id }); // saved, not applied -> reminded
    await Bookmark.create({ user: cse2.id, opportunity: soon._id }); // saved AND applied -> not reminded
    await Application.create({ user: cse2.id, opportunity: soon._id });
    // ece did nothing -> not reminded

    enqueueMock.mockClear();
    await processJob('deadlines.scan', {});
    await processJob('deadlines.scan', {}); // the hourly scan sees it again and again

    expect((await reminders('Closing contest')).map((n) => String(n.user))).toEqual([cse1.id]);
    const uniqueEmailJobIds = new Set(emailJobs().map(([, , opts]: any) => opts?.jobId));
    expect(uniqueEmailJobIds.size).toBe(1);
  });

  it('ignores postings that close later, already closed, or are switched off', async () => {
    const later = await opportunity('Later contest', daysFromNow(3));
    const over = await opportunity('Over contest', hoursFromNow(-5));
    const off = await opportunity('Switched off contest', hoursFromNow(10), { isActive: false });
    for (const opp of [later, over, off]) await Bookmark.create({ user: cse1.id, opportunity: opp._id });

    await processJob('deadlines.scan', {});

    for (const title of ['Later contest', 'Over contest', 'Switched off contest']) {
      expect(await reminders(title)).toHaveLength(0);
    }
  });

  it('also reminds the audience of a notice with a deadline tomorrow', async () => {
    const notice = await Notice.create({
      title: 'Fee payment',
      content: 'Pay before the deadline.',
      createdBy: author.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      deadline: hoursFromNow(6),
    });
    await processJob('deadlines.scan', {});
    expect(await recipients(`deadline:notice:${notice.id}`)).toEqual(expect.arrayContaining([cse1.id, ece.id]));
  });
});

describe('the notification inbox (API)', () => {
  const make = (user: string, title: string) => Notification.create({ user, type: 'NOTICE', title });

  it('lists only your own notifications and counts the unread ones', async () => {
    await Notification.deleteMany({});
    await make(cse1.id, 'First');
    await make(cse1.id, 'Second');
    await make(ece.id, 'Not yours');

    const res = await api().get('/api/notifications').set(auth(cse1.token));
    expect(res.body.items.map((n: { title: string }) => n.title).sort()).toEqual(['First', 'Second']);
    expect(res.body.unread).toBe(2);
    expect((await api().get('/api/notifications/unread-count').set(auth(cse1.token))).body.count).toBe(2);
  });

  it('marks one as read, once, and only for its owner', async () => {
    const note = await make(cse2.id, 'Read me');
    expect((await api().post(`/api/notifications/${note.id}/read`).set(auth(ece.token))).status).toBe(404);

    const first = await api().post(`/api/notifications/${note.id}/read`).set(auth(cse2.token));
    expect(first.body.notification.readAt).toBeTruthy();
    const again = await api().post(`/api/notifications/${note.id}/read`).set(auth(cse2.token));
    expect(again.body.notification.readAt).toBe(first.body.notification.readAt); // keeps the original time

    expect((await api().get('/api/notifications?unread=true').set(auth(cse2.token))).body.items).toHaveLength(0);
  });

  it('marks everything as read for you and nobody else', async () => {
    await Notification.deleteMany({});
    await make(cse1.id, 'A');
    await make(cse1.id, 'B');
    await make(ece.id, 'C');

    expect((await api().post('/api/notifications/read-all').set(auth(cse1.token))).body.updated).toBe(2);
    expect((await api().get('/api/notifications/unread-count').set(auth(cse1.token))).body.count).toBe(0);
    expect((await api().get('/api/notifications/unread-count').set(auth(ece.token))).body.count).toBe(1);
  });

  it('needs a login, and rejects a malformed id', async () => {
    expect((await api().get('/api/notifications')).status).toBe(401);
    expect((await api().post('/api/notifications/not-an-id/read').set(auth(cse1.token))).status).toBe(404);
  });
});
