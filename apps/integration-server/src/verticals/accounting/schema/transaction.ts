import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, DateOrCalendarDate } from '@opensteward/shared'
import { TransactionLineitemSchema } from './shared'

export const TransactionContactSchema = z.object({
  id: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  name: z.string().optional().meta({ example: 'Jane Doe' }),
})
export type TransactionContact = z.infer<typeof TransactionContactSchema>

export const TransactionSchema = z.object({
  id: ExternalId.optional().meta({ example: 'txn_8001' }),
  accountId: z.string().optional().meta({ example: 'acct_4000' }),
  splitAccountId: z.string().optional().meta({ example: 'acct_1100' }),
  type: z.string().optional().meta({ example: 'PAYMENT' }),
  reference: z.string().optional().meta({ example: 'INV-1042' }),
  memo: z.string().optional().meta({ example: 'Payment received for INV-1042' }),
  customerMessage: z.string().optional().meta({ example: 'Thank you for your payment, Acme Industries.' }),
  paymentMethod: z.string().optional().meta({ example: 'ACH' }),
  paymentTerms: z.string().optional().meta({ example: 'Net 30' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  subTotalAmount: nullish(Amount).meta({ example: 115000 }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
  contacts: z.array(TransactionContactSchema).optional(),
  lineAmountsIncludeTax: nullish(z.boolean())
    .describe(
      'Whether line `unitAmount`/`totalAmount` already include tax. `true` = tax-inclusive, ' +
      '`false` = tax-exclusive (tax is added on top), `null` = the platform applies no tax to ' +
      'this document, so the distinction does not arise and both readings give the same total. ' +
      'Without it, line items reconcile to the header by different arithmetic with nothing in ' +
      'the response saying which — inference from the totals breaks on zero-tax lines, mixed ' +
      'rates, rounding, and single-line documents where the two readings coincide.',
    )
    .meta({ example: false }),
  lineItems: nullish(z.array(TransactionLineitemSchema)),
  postedAt: DateOrCalendarDate.optional()
    .describe('Transaction date — when it was posted. A calendar date where the platform states one.')
    .meta({ example: '2026-02-01' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Transaction = z.infer<typeof TransactionSchema>
