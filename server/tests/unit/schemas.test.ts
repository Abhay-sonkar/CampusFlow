import { createBookingSchema } from '../../src/validators/booking.schema';
import { createOpportunitySchema, listOpportunitiesQuery } from '../../src/validators/opportunity.schema';
import { updateProfileSchema } from '../../src/validators/user.schema';

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  (result.error?.issues ?? []).map((issue) => issue.message).join(' | ');

describe('createBookingSchema', () => {
  const valid = {
    resource: '507f1f77bcf86cd799439011',
    start: '2030-01-01T10:00:00Z',
    end: '2030-01-01T11:00:00Z',
    purpose: 'Project work',
  };

  it('accepts a valid booking and turns the times into Dates', () => {
    const result = createBookingSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.start).toBeInstanceOf(Date);
  });

  it('accepts a time with an offset instead of Z', () => {
    expect(createBookingSchema.safeParse({ ...valid, start: '2030-01-01T15:30:00+05:30', end: '2030-01-01T16:30:00+05:30' }).success).toBe(true);
  });

  it('rejects a time without a timezone', () => {
    const result = createBookingSchema.safeParse({ ...valid, start: '2030-01-01T10:00:00' });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('timezone');
  });

  it('rejects times that are not on a 30-minute mark', () => {
    const result = createBookingSchema.safeParse({ ...valid, start: '2030-01-01T10:15:00Z' });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('30-minute');
  });

  it('rejects an end that is not after the start', () => {
    const result = createBookingSchema.safeParse({ ...valid, end: '2030-01-01T10:00:00Z' });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('End must be after start');
  });

  it('rejects a booking longer than 8 hours', () => {
    const result = createBookingSchema.safeParse({ ...valid, start: '2030-01-01T09:00:00Z', end: '2030-01-01T18:00:00Z' });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('8 hours');
  });

  it('rejects a malformed resource id and a too-short purpose', () => {
    expect(createBookingSchema.safeParse({ ...valid, resource: '123' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...valid, purpose: 'x' }).success).toBe(false);
  });
});

describe('createOpportunitySchema', () => {
  const valid = {
    title: 'React Internship',
    description: 'Build web apps with React.',
    category: 'INTERNSHIP',
    organization: 'Acme',
    deadline: '2030-01-01T10:00:00Z',
  };

  it('cleans up branches (upper case) and skills (lower case, no duplicates)', () => {
    const result = createOpportunitySchema.safeParse({
      ...valid,
      eligibility: { branches: ['cse', 'Ece'], years: [3] },
      skills: ['React', 'react', ' Node '],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eligibility?.branches).toEqual(['CSE', 'ECE']);
      expect(result.data.skills).toEqual(['react', 'node']);
    }
  });

  it('only accepts http(s) apply links', () => {
    expect(createOpportunitySchema.safeParse({ ...valid, applyUrl: 'https://example.com/apply' }).success).toBe(true);
    expect(createOpportunitySchema.safeParse({ ...valid, applyUrl: 'ftp://example.com/apply' }).success).toBe(false);
    expect(createOpportunitySchema.safeParse({ ...valid, applyUrl: 'not a link' }).success).toBe(false);
  });

  it('rejects an unknown category and a deadline without a timezone', () => {
    expect(createOpportunitySchema.safeParse({ ...valid, category: 'PARTY' }).success).toBe(false);
    expect(createOpportunitySchema.safeParse({ ...valid, deadline: '2030-01-01T10:00:00' }).success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('cleans up branch and skills', () => {
    const result = updateProfileSchema.safeParse({ branch: ' cse ', skills: ['A', 'a', 'B'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branch).toBe('CSE');
      expect(result.data.skills).toEqual(['a', 'b']);
    }
  });

  it('rejects an empty update and an impossible year', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ year: 9 }).success).toBe(false);
  });
});

describe('listOpportunitiesQuery', () => {
  it('uses sensible defaults', () => {
    const result = listOpportunitiesQuery.parse({});
    expect(result).toMatchObject({ page: 1, limit: 10, sort: 'deadline' });
  });

  it('turns a comma separated skills string into a clean list and numbers into numbers', () => {
    const result = listOpportunitiesQuery.parse({ skills: 'React, node ,', page: '2' });
    expect(result.skills).toEqual(['react', 'node']);
    expect(result.page).toBe(2);
  });

  it('rejects bad values', () => {
    expect(listOpportunitiesQuery.safeParse({ category: 'PARTY' }).success).toBe(false);
    expect(listOpportunitiesQuery.safeParse({ limit: '500' }).success).toBe(false);
  });
});
