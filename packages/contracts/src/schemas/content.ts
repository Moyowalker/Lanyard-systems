import { z } from 'zod';

export const CreateLeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  message: z.string().trim().min(20).max(4000).optional(),
  source: z.string().trim().min(2).max(80).optional(),
  topic: z.string().trim().min(2).max(120).optional(),
  branch: z.string().trim().min(2).max(120).optional(),
});
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

export const LeadListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;

export const LeadSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().optional(),
  source: z.string().optional(),
  topic: z.string().optional(),
  branch: z.string().optional(),
  status: z.string(),
  createdAt: z.string(),
});
export type LeadSummaryDto = z.infer<typeof LeadSummarySchema>;