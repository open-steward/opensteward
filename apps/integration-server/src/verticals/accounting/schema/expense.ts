import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, DateOrCalendarDate } from '@opensteward/shared'
import { LineitemSchema } from './shared'

export const ExpenseSchema = z.object({
  id: ExternalId.optional().meta({ example: 'exp_5005' }),
  name: z.string().optional().meta({ example: 'Client travel — Acme Industries onsite' }),
  accountId: z.string().optional().meta({ example: 'acct_4000' }),
  contactId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  userId: z.string().optional().meta({ example: 'usr_jane' }),
  approverUserId: z.string().optional().meta({ example: 'usr_finance_lead' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  paymentMethod: z.string().optional().meta({ example: 'CARD' }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
  reimbursedAmount: nullish(Amount).meta({ example: 125000 }),
  lineAmountsIncludeTax: nullish(z.boolean())
    .describe('Whether line amounts already include tax. `null` = no tax applies, so the distinction does not arise.')
    .meta({ example: false }),
  lineItems: nullish(z.array(LineitemSchema)),
  postedAt: DateOrCalendarDate.optional().meta({ example: '2026-02-01' }),
  approvedAt: z.date().optional().meta({ example: '2026-02-05T00:00:00Z' }),
  reimbursedAt: z.date().optional().meta({ example: '2026-02-20T00:00:00Z' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Expense = z.infer<typeof ExpenseSchema>
