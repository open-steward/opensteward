import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, withUnknown, DateOrCalendarDate } from '@opensteward/shared'
import { LineitemSchema, AttachmentSchema } from './shared'
import { PaymentCollectionMethodSchema } from './invoice'

export const CreditMemoStatusSchema = withUnknown([
  'DRAFT',
  'AUTHORIZED',
  'PAID',
  'PARTIALLY_PAID',
  'VOIDED',
  'DELETED',
])
export type CreditMemoStatus = z.infer<typeof CreditMemoStatusSchema>

/**
 * One link from a credit memo to an invoice it credits or is applied to.
 * Platforms that record the link by number only (no invoice id) give
 * `invoiceNumber` alone; at least one of the two is always present.
 */
export const CreditMemoApplicationSchema = z
  .object({
    invoiceId: ExternalId.optional()
      .describe('Platform id of the invoice, the same id the Invoice resource reports.')
      .meta({ example: 'inv_1042' }),
    // min(1): an empty number names no invoice, and would otherwise satisfy
    // the refine below on its own.
    invoiceNumber: z
      .string()
      .min(1)
      .optional()
      .describe('Human-readable number of the invoice, when the platform gives it.')
      .meta({ example: 'INV-1042' }),
    amount: nullish(Amount)
      .describe('Amount of this credit memo applied to this invoice, in minor units.')
      .meta({ example: 125000 }),
    appliedAt: DateOrCalendarDate.optional()
      .describe('When the credit was applied to this invoice.')
      .meta({ example: '2026-02-01' }),
  })
  .refine((a) => a.invoiceId !== undefined || a.invoiceNumber !== undefined, {
    message: 'A credit memo application needs an invoiceId or an invoiceNumber',
  })
  .describe(
    'One invoice this credit memo is linked to. At least one of `invoiceId` and ' +
      '`invoiceNumber` is always present; some platforms record the link by number only.',
  )
export type CreditMemoApplication = z.infer<typeof CreditMemoApplicationSchema>

export const CreditMemoSchema = z.object({
  id: ExternalId.optional().meta({ example: 'cm_3010' }),
  status: CreditMemoStatusSchema.optional().meta({ example: 'AUTHORIZED' }),
  creditmemoNumber: z.string().optional().meta({ example: 'CM-3010' }),
  contactId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  discountAmount: nullish(Amount).meta({ example: 0 }),
  paidAmount: nullish(Amount).meta({ example: 0 }),
  balanceAmount: nullish(Amount).meta({ example: 125000 }),
  refundAmount: nullish(Amount).meta({ example: 0 }),
  refundReason: z.string().optional().meta({ example: 'Credit issued for over-billed subscription.' }),
  paymentCollectionMethod: PaymentCollectionMethodSchema.optional().meta({ example: 'send_invoice' }),
  notes: z.string().optional().meta({ example: 'Credit note applied to INV-1042 for Acme Industries.' }),
  url: z.url().optional().meta({ example: 'https://app.acme.example/credit-memos/CM-3010' }),
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
  appliedTo: z
    .array(CreditMemoApplicationSchema)
    .optional()
    .describe(
      'The invoice(s) this credit memo credits or is applied to, when the platform records the ' +
        'link. One entry per application; amount in minor units when the platform gives a ' +
        'per-application amount.',
    )
    .meta({
      example: [
        {
          invoiceId: 'inv_1042',
          invoiceNumber: 'INV-1042',
          amount: 125000,
          appliedAt: '2026-02-01',
        },
      ],
    }),
  postedAt: DateOrCalendarDate.optional().meta({ example: '2026-02-01' }),
  dueAt: DateOrCalendarDate.optional().meta({ example: '2026-03-03' }),
  paidAt: z.date().optional().meta({ example: null }),
  cancelledAt: z.date().optional().meta({ example: null }),
  refundedAt: z.date().optional().meta({ example: null }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type CreditMemo = z.infer<typeof CreditMemoSchema>
