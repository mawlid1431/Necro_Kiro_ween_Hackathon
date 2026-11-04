import { z } from "zod";

// Structured-output schemas from .kiro/steering/ai-prompts.md. Every AI
// response is validated against one of these before it is stored or shown.

export const SeanceSchema = z.object({
  summary: z.array(z.string().max(220)).length(3),
  score: z.number().int().min(0).max(100),
  reason: z.string().max(160),
});

export const ResurrectSchema = z.object({
  linkedin: z.string().max(1300),
  x: z.string().max(280),
  instagram: z.string().max(2200),
  hashtags: z.array(z.string().regex(/^#\w+$/)).min(3).max(6),
});

export type Seance = z.infer<typeof SeanceSchema>;
export type ResurrectDrafts = z.infer<typeof ResurrectSchema>;
