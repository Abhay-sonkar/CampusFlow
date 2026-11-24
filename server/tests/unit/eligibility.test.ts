import { branchMatch, isEligible, yearMatch } from '../../src/utils/eligibility';

const open = { branches: [], years: [] };

describe('isEligible', () => {
  it('lets everyone in when nothing is restricted', () => {
    expect(isEligible({}, open)).toBe(true);
    expect(isEligible({ branch: 'CSE', year: 3 }, open)).toBe(true);
  });

  it('checks the branch, ignoring upper/lower case', () => {
    const rule = { branches: ['CSE', 'IT'], years: [] };
    expect(isEligible({ branch: 'cse' }, rule)).toBe(true);
    expect(isEligible({ branch: 'It' }, rule)).toBe(true);
    expect(isEligible({ branch: 'ECE' }, rule)).toBe(false);
  });

  it('checks the year', () => {
    const rule = { branches: [], years: [3, 4] };
    expect(isEligible({ year: 3 }, rule)).toBe(true);
    expect(isEligible({ year: 2 }, rule)).toBe(false);
  });

  it('needs BOTH to match when both are restricted', () => {
    const rule = { branches: ['CSE'], years: [3] };
    expect(isEligible({ branch: 'CSE', year: 3 }, rule)).toBe(true);
    expect(isEligible({ branch: 'CSE', year: 2 }, rule)).toBe(false);
    expect(isEligible({ branch: 'ECE', year: 3 }, rule)).toBe(false);
  });

  it('refuses when a restriction exists but the profile is incomplete', () => {
    expect(isEligible({}, { branches: ['CSE'], years: [] })).toBe(false);
    expect(isEligible({ branch: 'CSE' }, { branches: [], years: [3] })).toBe(false);
  });
});

describe('the matching database clauses', () => {
  it('branchMatch accepts "open to all" or this branch (upper-cased)', () => {
    expect(branchMatch('cse').$or).toEqual([{ 'eligibility.branches': { $size: 0 } }, { 'eligibility.branches': 'CSE' }]);
  });

  it('without a branch only "open to all" matches', () => {
    expect(branchMatch(undefined).$or).toEqual([{ 'eligibility.branches': { $size: 0 } }]);
    expect(yearMatch(undefined).$or).toEqual([{ 'eligibility.years': { $size: 0 } }]);
  });

  it('yearMatch accepts "open to all" or this year', () => {
    expect(yearMatch(3).$or).toEqual([{ 'eligibility.years': { $size: 0 } }, { 'eligibility.years': 3 }]);
  });
});
