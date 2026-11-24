jest.mock('../../src/jobs/enqueue', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));

import { enqueueJob } from '../../src/jobs/enqueue';
import { Booking } from '../../src/models/Booking';
import { TestUser, api, auth, makeUser } from '../helpers/api';
import { startTestDb, stopTestDb } from '../helpers/db';
import { isoIn } from '../helpers/time';

const enqueueMock = enqueueJob as jest.Mock;

let admin: TestUser;
let alice: TestUser;
let bob: TestUser;
let staff: TestUser;

beforeAll(async () => {
  await startTestDb();
  admin = await makeUser('admin@test.com', 'COLLEGE_ADMIN');
  alice = await makeUser('alice@test.com');
  bob = await makeUser('bob@test.com');
  staff = await makeUser('staff@test.com', 'FACULTY');
});
afterAll(stopTestDb);

let counter = 0;
// Every test gets its own resource, so tests cannot affect each other
async function newResource(extra: object = {}) {
  const res = await api().post('/api/resources').set(auth(admin.token)).send({ name: `Lab ${++counter}`, type: 'LAB', ...extra });
  return res.body.resource._id as string;
}
const book = (token: string, resource: string, start: string, end: string, purpose = 'Project work') =>
  api().post('/api/bookings').set(auth(token)).send({ resource, start, end, purpose });

describe('resources', () => {
  it('can only be created by an admin, with a unique name and a valid type', async () => {
    expect((await api().post('/api/resources').set(auth(alice.token)).send({ name: 'Student lab', type: 'LAB' })).status).toBe(403);
    expect((await api().post('/api/resources').set(auth(admin.token)).send({ name: 'Odd room', type: 'SPACESHIP' })).status).toBe(400);

    await api().post('/api/resources').set(auth(admin.token)).send({ name: 'Seminar Hall A', type: 'SEMINAR_HALL' });
    const duplicate = await api().post('/api/resources').set(auth(admin.token)).send({ name: 'seminar hall a', type: 'SEMINAR_HALL' });
    expect(duplicate.status).toBe(409);
  });

  it('can be searched by type and name', async () => {
    await api().post('/api/resources').set(auth(admin.token)).send({ name: 'Findable Court', type: 'SPORTS' });
    const res = await api().get('/api/resources?type=SPORTS&q=findable').set(auth(alice.token));
    expect(res.body.items.map((r: { name: string }) => r.name)).toEqual(['Findable Court']);
  });

  it('stops being bookable, and disappears from the list, when deactivated', async () => {
    const rid = await newResource({ name: 'Closing Lab' });
    await api().patch(`/api/resources/${rid}`).set(auth(admin.token)).send({ isActive: false });

    expect((await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11))).status).toBe(409);
    const list = await api().get('/api/resources?q=closing').set(auth(alice.token));
    expect(list.body.pagination.total).toBe(0);
  });
});

describe('booking rules', () => {
  it('rejects a start time in the past', async () => {
    const rid = await newResource();
    expect((await book(alice.token, rid, isoIn(-1, 10), isoIn(-1, 11))).status).toBe(400);
  });

  it('rejects times that are not on a 30-minute mark', async () => {
    const rid = await newResource();
    expect((await book(alice.token, rid, isoIn(3, 10, 15), isoIn(3, 11))).status).toBe(400);
  });

  it('rejects an end before the start, and a booking over 8 hours', async () => {
    const rid = await newResource();
    expect((await book(alice.token, rid, isoIn(3, 11), isoIn(3, 10))).status).toBe(400);
    expect((await book(alice.token, rid, isoIn(3, 8), isoIn(3, 17))).status).toBe(400);
  });

  it('rejects a time without a timezone, and a date too far ahead', async () => {
    const rid = await newResource();
    expect((await book(alice.token, rid, isoIn(3, 10).replace('Z', ''), isoIn(3, 11))).status).toBe(400);
    expect((await book(alice.token, rid, isoIn(120, 10), isoIn(120, 11))).status).toBe(400);
  });

  it('answers 404 for an unknown resource and 401 without a login', async () => {
    expect((await book(alice.token, '000000000000000000000000', isoIn(3, 10), isoIn(3, 11))).status).toBe(404);
    const noLogin = await api().post('/api/bookings').send({ resource: '000000000000000000000000', start: isoIn(3, 10), end: isoIn(3, 11), purpose: 'x' });
    expect(noLogin.status).toBe(401);
  });
});

describe('preventing double bookings', () => {
  it('blocks every kind of overlap but allows back-to-back bookings', async () => {
    const rid = await newResource();

    const first = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    expect(first.status).toBe(201);
    expect(first.body.booking.status).toBe('PENDING');

    expect((await book(bob.token, rid, isoIn(3, 10, 30), isoIn(3, 11, 30))).status).toBe(409); // starts inside
    expect((await book(bob.token, rid, isoIn(3, 9, 30), isoIn(3, 10, 30))).status).toBe(409); // ends inside
    expect((await book(bob.token, rid, isoIn(3, 10), isoIn(3, 11))).status).toBe(409); // identical
    expect((await book(bob.token, rid, isoIn(3, 9), isoIn(3, 12))).status).toBe(409); // swallows it
    expect((await book(bob.token, rid, isoIn(3, 10, 30), isoIn(3, 11))).status).toBe(409); // inside it

    expect((await book(bob.token, rid, isoIn(3, 11), isoIn(3, 12))).status).toBe(201); // right after
    expect((await book(bob.token, rid, isoIn(3, 9), isoIn(3, 10))).status).toBe(201); // right before
  });

  it('keeps resources independent', async () => {
    const lab = await newResource();
    const hall = await newResource();
    expect((await book(alice.token, lab, isoIn(3, 10), isoIn(3, 11))).status).toBe(201);
    expect((await book(bob.token, hall, isoIn(3, 10), isoIn(3, 11))).status).toBe(201);
  });

  it('frees the time when a booking is rejected', async () => {
    const rid = await newResource();
    const first = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    await api().post(`/api/bookings/${first.body.booking._id}/reject`).set(auth(admin.token)).send({ note: 'Needed for an exam' });
    expect((await book(bob.token, rid, isoIn(3, 10), isoIn(3, 11))).status).toBe(201);
  });

  it('frees the time when a booking is cancelled', async () => {
    const rid = await newResource();
    const first = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    await api().post(`/api/bookings/${first.body.booking._id}/cancel`).set(auth(alice.token));
    expect((await book(bob.token, rid, isoIn(3, 10), isoIn(3, 11))).status).toBe(201);
  });
});

describe('concurrency: many people pressing "book" at the same instant', () => {
  const people = () => [alice, bob, staff, admin];

  it('lets exactly one of 10 identical simultaneous requests win', async () => {
    const rid = await newResource();
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => book(people()[i % 4].token, rid, isoIn(4, 10), isoIn(4, 11)))
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(await Booking.countDocuments({ resource: rid, holdsSlot: true })).toBe(1);
  });

  it('lets exactly one of 8 partly overlapping simultaneous requests win', async () => {
    const rid = await newResource();
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        i % 2 === 0
          ? book(people()[i % 4].token, rid, isoIn(5, 10), isoIn(5, 11)) // 10:00-11:00
          : book(people()[i % 4].token, rid, isoIn(5, 10, 30), isoIn(5, 11, 30)) // 10:30-11:30
      )
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await Booking.countDocuments({ resource: rid, holdsSlot: true })).toBe(1);
  });
});

describe('approving, rejecting and cancelling', () => {
  it('lets only an admin decide, and only on pending bookings', async () => {
    const rid = await newResource();
    const created = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    const id = created.body.booking._id;

    expect((await api().post(`/api/bookings/${id}/approve`).set(auth(alice.token))).status).toBe(403);

    const approved = await api().post(`/api/bookings/${id}/approve`).set(auth(admin.token));
    expect(approved.status).toBe(200);
    expect(approved.body.booking.status).toBe('APPROVED');

    expect((await api().post(`/api/bookings/${id}/approve`).set(auth(admin.token))).status).toBe(409); // twice
    expect((await api().post(`/api/bookings/${id}/reject`).set(auth(admin.token)).send({ note: 'Too late now' })).status).toBe(409);
  });

  it('needs a reason to reject', async () => {
    const rid = await newResource();
    const created = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    const id = created.body.booking._id;

    expect((await api().post(`/api/bookings/${id}/reject`).set(auth(admin.token)).send({})).status).toBe(400);
    const rejected = await api().post(`/api/bookings/${id}/reject`).set(auth(admin.token)).send({ note: 'Lab is closed' });
    expect(rejected.body.booking).toMatchObject({ status: 'REJECTED', decisionNote: 'Lab is closed' });
  });

  it('lets only the owner (or an admin) cancel, once', async () => {
    const rid = await newResource();
    const created = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    const id = created.body.booking._id;

    expect((await api().post(`/api/bookings/${id}/cancel`).set(auth(bob.token))).status).toBe(404);
    expect((await api().post(`/api/bookings/${id}/cancel`).set(auth(alice.token))).body.booking.status).toBe('CANCELLED');
    expect((await api().post(`/api/bookings/${id}/cancel`).set(auth(alice.token))).status).toBe(409);
  });

  it('announces a decision for the background worker', async () => {
    const rid = await newResource();
    const created = await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    const id = created.body.booking._id;

    enqueueMock.mockClear();
    await api().post(`/api/bookings/${id}/approve`).set(auth(admin.token));
    expect(enqueueMock).toHaveBeenCalledWith('booking.decided', { bookingId: id });
  });
});

describe('history and availability', () => {
  it('shows people only their own bookings, and admins everything', async () => {
    const rid = await newResource();
    await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11));
    await book(bob.token, rid, isoIn(3, 12), isoIn(3, 13));

    const mine = await api().get(`/api/bookings/mine?resource=${rid}`).set(auth(alice.token));
    expect(mine.body.pagination.total).toBe(1);

    expect((await api().get('/api/bookings').set(auth(alice.token))).status).toBe(403);
    const all = await api().get(`/api/bookings?resource=${rid}`).set(auth(admin.token));
    expect(all.body.pagination.total).toBe(2);
  });

  it('shows when a resource is taken without revealing who booked it or why', async () => {
    const rid = await newResource();
    await book(alice.token, rid, isoIn(3, 10), isoIn(3, 11), 'A private purpose');

    const taken = await api().get(`/api/resources/${rid}/availability`).query({ from: isoIn(3, 0), to: isoIn(4, 0) }).set(auth(bob.token));
    expect(taken.body.isFree).toBe(false);
    expect(taken.body.bookings).toHaveLength(1);
    expect(taken.body.bookings[0]).not.toHaveProperty('purpose');
    expect(taken.body.bookings[0]).not.toHaveProperty('bookedBy');

    const free = await api().get(`/api/resources/${rid}/availability`).query({ from: isoIn(3, 13), to: isoIn(3, 14) }).set(auth(bob.token));
    expect(free.body.isFree).toBe(true);
  });
});
