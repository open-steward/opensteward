import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { MoneySchema } from './shared'

export const DealSchema = z
  .object({
    id: z.string().describe('Platform-specific deal identifier.').meta({ example: 'deal_1042' }),
    title: z.string().describe('Human-readable deal name.').meta({ example: 'Acme Q1 Expansion' }),
    value: MoneySchema.optional().describe('Monetary value with currency.'),
    status: z.string().optional().describe('Open/won/lost state. Platform-defined vocabulary.').meta({ example: 'open' }),
    stage: z.string().optional().describe('Current stage label (e.g. `Qualified`, `Negotiation`).').meta({ example: 'Negotiation' }),
    stage_id: z.string().optional().describe('Platform-specific stage identifier within the pipeline.').meta({ example: 'stage_negotiation' }),
    pipeline_id: z.string().optional().describe('Pipeline.id the deal belongs to.').meta({ example: 'pipe_sales' }),
    contact_ids: z.array(z.string()).optional().describe('Contact.ids associated with the deal.').meta({ example: ['cont_jane'] }),
    company_id: z.string().optional().describe('Primary Company.id associated with the deal.').meta({ example: 'co_acme' }),
    owner_id: z.string().optional().describe('Platform user who owns the record.').meta({ example: 'usr_olivia' }),
    close_date: IsoDatetime.optional().describe('Expected or actual close date as ISO 8601.').meta({ example: '2026-03-31T00:00:00Z' }),
    probability: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Estimated probability of winning, 0–100.')
      .meta({ example: 60 }),
    created_at: IsoDatetime.optional().describe('ISO 8601 timestamp when the deal was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updated_at: IsoDatetime.optional().describe('ISO 8601 timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    accounting_invoice_id: z
      .string()
      .optional()
      .describe('Cross-vertical link — Accounting Invoice.id emitted when the deal closes won.').meta({ example: 'inv_1042' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('A sales opportunity / pipeline deal.')
export type Deal = z.infer<typeof DealSchema>
