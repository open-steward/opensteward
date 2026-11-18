import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, withUnknown, DateOrCalendarDate } from '@opensteward/shared'
import { LineitemSchema, AttachmentSchema } from './shared'
import { PaymentCollectionMethodSchema } from './invoice'

export const BillStatusSchema = withUnknown([
  'DRAFT',
  'SUBMITTED',
  'AUTHORIZED',
  'PAID',
  'PARTIALLY_PAID',
  'OVERDUE',
  'VOIDED',
  'DELETED',
])
export type BillStatus = z.infer<typeof BillStatusSchema>

export const BillSchema = z.object({
  id: ExternalId.optional().meta({ example: 'bill_2042' }),
  status: BillStatusSchema.optional().meta({ example: 'PAID' }),
  billNumber: z.string().optional().meta({ example: 'BILL-2042' }),
  contactId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  discountAmount: nullish(Amount).meta({ example: 0 }),
  paidAmount: nullish(Amount).meta({ example: 125000 }),
  balanceAmount: nullish(Amount).meta({ example: 0 }),
  refundAmount: nullish(Amount).meta({ example: 0 }),
  refundReason: z.string().optional().meta({ example: 'No refund issued' }),
  paymentCollectionMethod: PaymentCollectionMethodSchema.optional().meta({ example: 'send_invoice' }),
  notes: z.string().optional().meta({ example: 'Net 30 supplier bill for Acme Industries.' }),
  url: z.url().optional().describe('Hosted bill URL.').meta({ example: 'https://app.acme.example/bills/BILL-2042' }),
  send: z.boolean().optional().meta({ example: false }),
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
  lineItems: nullish(z.array(LineitemSchema)),
  attachments: z.array(AttachmentSchema).optional(),
  postedAt: DateOrCalendarDate.optional().meta({ example: '2026-02-01' }),
  dueAt: DateOrCalendarDate.optional().meta({ example: '2026-03-03' }),
  paidAt: z.date().optional().meta({ example: '2026-02-20T00:00:00Z' }),
  cancelledAt: z.date().optional().meta({ example: null }),
  refundedAt: z.date().optional().meta({ example: null }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Bill = z.infer<typeof BillSchema>
