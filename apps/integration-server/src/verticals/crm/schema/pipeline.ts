import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

export const PipelineStageSchema = z
  .object({
    id: z.string().describe('Platform-specific stage identifier.').meta({ example: 'stage_negotiation' }),
    name: z.string().describe('Human-readable stage label (e.g. `Qualified`, `Proposal sent`).').meta({ example: 'Negotiation' }),
    order: z.number().int().min(0).optional().describe('Position in the pipeline, 0-indexed.').meta({ example: 3 }),
    win_probability: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Default probability (0–100) assigned to deals in this stage.')
      .meta({ example: 60 }),
  })
  .describe('A single stage within a deal pipeline.')
export type PipelineStage = z.infer<typeof PipelineStageSchema>

export const PipelineSchema = z
  .object({
    id: z.string().describe('Platform-specific pipeline identifier.').meta({ example: 'pipe_sales' }),
    name: z.string().describe('Human-readable pipeline label.').meta({ example: 'Sales' }),
    stages: z.array(PipelineStageSchema).optional().describe('Ordered list of stages.'),
    is_active: z.boolean().optional().describe('Whether the pipeline is in active use.').meta({ example: true }),
    created_at: IsoDatetime.optional().describe('ISO 8601 timestamp when the pipeline was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updated_at: IsoDatetime.optional().describe('ISO 8601 timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('A deal pipeline — a named sequence of sales stages.')
export type Pipeline = z.infer<typeof PipelineSchema>
