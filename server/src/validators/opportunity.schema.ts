import { z } from 'zod';
import { OPPORTUNITY_CATEGORIES } from '../models/Opportunity';
import { branchName, isoDateTime, pagination, skillList } from './common';

const eligibilitySchema = z.object({
  branches: z.array(branchName).max(20).optional(),
  years: z.array(z.number().int().min(1).max(5)).max(5).optional(),
});

export const createOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(3000),
  category: z.enum(OPPORTUNITY_CATEGORIES),
  organization: z.string().trim().min(2).max(100),
  location: z.string().trim().max(100).optional(),
  applyUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: 'Must start with http:// or https://' })
    .optional(),
  deadline: isoDateTime,
  eligibility: eligibilitySchema.optional(),
  skills: skillList.optional(),
});

export const updateOpportunitySchema = createOpportunitySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const listOpportunitiesQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.enum(OPPORTUNITY_CATEGORIES).optional(),
  branch: branchName.optional(), // open to this branch
  year: z.coerce.number().int().min(1).max(5).optional(), // open to this year
  skills: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))
    .optional(), // comma separated, matches any
  closingWithin: z.coerce.number().int().min(1).max(365).optional(), // days
  eligibleForMe: z.enum(['true']).optional(),
  includeExpired: z.enum(['true']).optional(),
  mine: z.enum(['true']).optional(), // opportunities I posted, including inactive and expired
  sort: z.enum(['deadline', 'newest', 'popular']).default('deadline'),
  ...pagination,
});

export const recommendedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuery>;
