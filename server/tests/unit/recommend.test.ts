import { RecProfile, Scorable, scoreOpportunity } from '../../src/utils/recommend';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2030-06-01T00:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * DAY);

const opp = (overrides: Partial<Scorable> = {}): Scorable => ({
  category: 'INTERNSHIP',
  skills: [],
  deadline: inDays(30),
  eligibility: { branches: [], years: [] },
  bookmarkCount: 0,
  applicationCount: 0,
  ...overrides,
});

const cseStudent: RecProfile = { branch: 'CSE', year: 3, skills: ['react', 'node', 'mongodb'] };
const none = new Set<string>();

describe('scoreOpportunity: the points', () => {
  it('scores a perfect match: skills 40 + branch 15 + year 10 + closing soon 10 = 75', () => {
    const result = scoreOpportunity(
      cseStudent,
      opp({ skills: ['react', 'node'], eligibility: { branches: ['CSE'], years: [3, 4] }, deadline: inDays(5) }),
      none,
      now
    );
    expect(result.score).toBe(75);
    expect(result.relevant).toBe(true);
  });

  it('explains every point with a reason', () => {
    const { reasons } = scoreOpportunity(
      cseStudent,
      opp({ skills: ['react', 'node'], eligibility: { branches: ['CSE'], years: [3] }, deadline: inDays(5) }),
      none,
      now
    );
    expect(reasons).toEqual([
      'Matches your skills: react, node',
      'Aimed at CSE students',
      'Aimed at year 3',
      'Closes in 5 days',
    ]);
  });

  it('scores a single skill match plus urgency: 20 + 10 = 30', () => {
    expect(scoreOpportunity(cseStudent, opp({ skills: ['node'], deadline: inDays(3) }), none, now).score).toBe(30);
  });

  it('scores an ECE student on an embedded hackathon: skills 40 + branch 15 = 55', () => {
    const ece: RecProfile = { branch: 'ECE', year: 2, skills: ['embedded', 'c'] };
    const result = scoreOpportunity(
      ece,
      opp({ category: 'HACKATHON', skills: ['embedded', 'c'], eligibility: { branches: ['ECE', 'EEE'], years: [] }, deadline: inDays(20) }),
      none,
      now
    );
    expect(result.score).toBe(55);
  });

  it('caps the skills bonus at 60', () => {
    const many: RecProfile = { skills: ['a', 'b', 'c', 'd', 'e'] };
    expect(scoreOpportunity(many, opp({ skills: ['a', 'b', 'c', 'd', 'e'] }), none, now).score).toBe(60);
  });

  it('compares skills without caring about upper/lower case', () => {
    expect(scoreOpportunity({ skills: ['React'] }, opp({ skills: ['react'] }), none, now).score).toBe(20);
  });

  it('adds 10 for a category the student has shown interest in', () => {
    const result = scoreOpportunity(cseStudent, opp({ category: 'INTERNSHIP' }), new Set(['INTERNSHIP']), now);
    expect(result.score).toBe(10);
    expect(result.reasons).toEqual(['You have shown interest in internships']);
  });

  it('gives +10 within 7 days, +5 within 14 days, nothing after that', () => {
    const profile: RecProfile = { skills: ['x'] };
    const score = (days: number) => scoreOpportunity(profile, opp({ skills: ['x'], deadline: inDays(days) }), none, now).score - 20;
    expect(score(1)).toBe(10);
    expect(score(7)).toBe(10);
    expect(score(10)).toBe(5);
    expect(score(14)).toBe(5);
    expect(score(15)).toBe(0);
  });
});

describe('scoreOpportunity: what qualifies something to be recommended', () => {
  it('does not recommend an opportunity with no connection to the student', () => {
    const result = scoreOpportunity(cseStudent, opp(), none, now);
    expect(result.score).toBe(0);
    expect(result.relevant).toBe(false);
  });

  it('urgency alone ranks but never qualifies', () => {
    const result = scoreOpportunity(cseStudent, opp({ deadline: inDays(1) }), none, now);
    expect(result.score).toBe(10);
    expect(result.relevant).toBe(false);
    expect(result.reasons).toEqual(['Closes within a day']);
  });

  it('popularity alone ranks but never qualifies, and needs 3+ saves or applications', () => {
    expect(scoreOpportunity(cseStudent, opp({ bookmarkCount: 2 }), none, now).score).toBe(0);
    const popular = scoreOpportunity(cseStudent, opp({ bookmarkCount: 3, applicationCount: 2 }), none, now);
    expect(popular.score).toBe(5);
    expect(popular.relevant).toBe(false);
  });
});
