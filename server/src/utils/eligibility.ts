// An empty list means "open to everyone" for that field.
export type Profile = { branch?: string; year?: number };
type Rule = { branches: string[]; years: number[] };

// Mongo clauses: "open to all branches, or to this branch" / "open to all years, or to this year"
export const branchMatch = (branch?: string) => ({
  $or: [{ 'eligibility.branches': { $size: 0 } }, ...(branch ? [{ 'eligibility.branches': branch.toUpperCase() }] : [])],
});
export const yearMatch = (year?: number) => ({
  $or: [{ 'eligibility.years': { $size: 0 } }, ...(year ? [{ 'eligibility.years': year }] : [])],
});

// Same rule in plain code. A restriction with no matching profile value means "not eligible".
export function isEligible(profile: Profile, rule: Rule): boolean {
  const branchOk = rule.branches.length === 0 || (!!profile.branch && rule.branches.includes(profile.branch.toUpperCase()));
  const yearOk = rule.years.length === 0 || (profile.year !== undefined && rule.years.includes(profile.year));
  return branchOk && yearOk;
}
