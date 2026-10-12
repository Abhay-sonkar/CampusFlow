import { Profile } from './eligibility';

export interface RecProfile extends Profile {
  skills: string[];
}

export interface Scorable {
  category: string;
  skills: string[];
  deadline: Date;
  eligibility: { branches: string[]; years: number[] };
  bookmarkCount: number;
  applicationCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LABELS: Record<string, string> = {
  INTERNSHIP: 'internships',
  HACKATHON: 'hackathons',
  SCHOLARSHIP: 'scholarships',
  CONTEST: 'contests',
  WORKSHOP: 'workshops',
  EVENT: 'events',
};

/*
 * A transparent, rule-based score (no machine learning). Every point comes with a reason
 * that can be shown to the student.
 *
 *   +20 per skill you share with the opportunity (max +60)
 *   +15 it is aimed at your branch
 *   +10 it is aimed at your year
 *   +10 you have shown interest in this category (bookmarked or applied before)
 *   +10 closes within 7 days, +5 within 14 days   (urgency: ranks, never qualifies)
 *   +up to 5 popular with other students (3+ saves/applications)   (ranks, never qualifies)
 *
 * "relevant" is true only if one of the first four signals fired. Urgency and popularity
 * alone are not enough to recommend something that has nothing to do with the student.
 */
export function scoreOpportunity(profile: RecProfile, opp: Scorable, engagedCategories: Set<string>, now = new Date()) {
  let score = 0;
  let relevant = false;
  const reasons: string[] = [];

  const mine = new Set(profile.skills.map((s) => s.toLowerCase()));
  const shared = opp.skills.filter((s) => mine.has(s.toLowerCase()));
  if (shared.length > 0) {
    score += Math.min(shared.length * 20, 60);
    relevant = true;
    reasons.push(`Matches your skills: ${shared.join(', ')}`);
  }

  if (profile.branch && opp.eligibility.branches.includes(profile.branch.toUpperCase())) {
    score += 15;
    relevant = true;
    reasons.push(`Aimed at ${profile.branch.toUpperCase()} students`);
  }

  if (profile.year !== undefined && opp.eligibility.years.includes(profile.year)) {
    score += 10;
    relevant = true;
    reasons.push(`Aimed at year ${profile.year}`);
  }

  if (engagedCategories.has(opp.category)) {
    score += 10;
    relevant = true;
    reasons.push(`You have shown interest in ${LABELS[opp.category] ?? opp.category.toLowerCase()}`);
  }

  const daysLeft = Math.ceil((opp.deadline.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 7) {
    score += 10;
    reasons.push(daysLeft <= 1 ? 'Closes within a day' : `Closes in ${daysLeft} days`);
  } else if (daysLeft <= 14) {
    score += 5;
    reasons.push(`Closes in ${daysLeft} days`);
  }

  const popularity = opp.bookmarkCount + opp.applicationCount;
  if (popularity >= 3) {
    score += Math.min(popularity, 5);
    reasons.push('Popular with other students');
  }

  return { score, relevant, reasons };
}
