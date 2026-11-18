import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, withUnknown, DateOrCalendarDate } from '@opensteward/shared'
import { LineitemSchema } from './shared'

/**
 * A quote (estimate / proposal) — a priced offer sent before any obligation
 * exists. It is deliberately NOT an invoice: nothing is owed until the
 * customer accepts and the quote is converted, so there is no paid/balance
 * arithmetic here and no due date.
 *
 * Not a Xero-only concept. Twenty accounting adapters carry a quote or
 * estimate endpoint — QuickBooks (Estimate), Zoho Books, FreshBooks,
 * Invoice Ninja, Bigcapital, Crater among them — which is why this is a
 * vertical resource rather than a Xero extension.
 *
 * `DELETED` is in the status enum because Xero returns it and an earlier
 * orders-mapped type omitted it, so the value arrived as UNKNOWN.
 */
export const QuoteStatusSchema = withUnknown([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'INVOICED',
  'EXPIRED',
  'DELETED',
])
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>

export const QuoteSchema = z.object({
  id: ExternalId.optional().meta({ example: 'quo_5501' }),
  status: QuoteStatusSchema.optional().meta({ example: 'SENT' }),
  quoteNumber: z.string().optional().meta({ example: 'QU-0042' }),
  reference: z.string().optional().meta({ example: 'Website redesign, phase 2' }),
  contactId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
  subtotalAmount: nullish(Amount).meta({ example: 115000 }),
  taxAmount: nullish(Amount).meta({ example: 10000 }),
  discountAmount: nullish(Amount).meta({ example: 0 }),
  title: z.string().optional().meta({ example: 'Phase 2 proposal' }),
  summary: z.string().optional().meta({ example: 'Design and build, six weeks.' }),
  terms: z.string().optional().meta({ example: 'Valid for 30 days from issue.' }),
  url: z.url().optional().meta({ example: 'https://app.acme.example/quotes/QU-0042' }),
  lineAmountsIncludeTax: nullish(z.boolean())
    .describe(
      'Whether line `unitAmount`/`totalAmount` already include tax. `true` = tax-inclusive, ' +
      '`false` = tax-exclusive (tax is added on top), `null` = the platform applies no tax to ' +
      'this document. Same three-state meaning as on invoices and credit memos.',
    )
    .meta({ example: false }),
  lineItems: nullish(z.array(LineitemSchema)),
  /** When the quote was issued. */
  issuedAt: DateOrCalendarDate.optional().meta({ example: '2026-02-01' }),
  /** After this date the offer no longer stands. Not a due date: nothing is
   *  owed on a quote. */
  expiresAt: DateOrCalendarDate.optional().meta({ example: '2026-03-03' }),
  acceptedAt: z.date().optional().meta({ example: null }),
  declinedAt: z.date().optional().meta({ example: null }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Quote = z.infer<typeof QuoteSchema>
