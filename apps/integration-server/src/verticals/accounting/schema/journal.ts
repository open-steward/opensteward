import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, DateOrCalendarDate } from '@opensteward/shared'
import { JournalLineitemSchema } from './shared'

export const JournalSchema = z.object({
  id: ExternalId.optional().meta({ example: 'jrnl_9001' }),
  description: z.string().optional().meta({ example: 'Sales revenue recognition — INV-1042' }),
  reference: z.string().optional().meta({ example: 'INV-1042' }),
  source: z.string().optional().meta({ example: 'invoice' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  taxrateId: z.string().optional().meta({ example: 'tax_ca' }),
  lineItems: nullish(z.array(JournalLineitemSchema)),
  postedAt: DateOrCalendarDate.optional().meta({ example: '2026-02-01' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Journal = z.infer<typeof JournalSchema>
