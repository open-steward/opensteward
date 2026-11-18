import { z } from 'zod'
import { Amount, Iso4217Currency, nullish, withUnknown, DateOrCalendarDate } from '@opensteward/shared'
import { LineitemSchema, AttachmentSchema } from './shared'

export const InvoiceStatusSchema = withUnknown([
  'DRAFT',
  'AUTHORIZED',
  'SUBMITTED',
  'PAID',
  'PARTIALLY_PAID',
  'OVERDUE',
  'VOIDED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'DELETED',
]).describe('Canonical invoice lifecycle state. Platforms map their own vocabularies to these values; values that cannot be mapped become `"unknown"` rather than being silently dropped.')
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>

export const InvoiceTypeSchema = z
  .enum(['INVOICE', 'BILL', 'CREDITMEMO'])
  .describe('Document kind. `INVOICE` = accounts receivable, `BILL` = accounts payable, `CREDITMEMO` = credit note.')
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>

export const PaymentCollectionMethodSchema = z
  .enum(['send_invoice', 'charge_automatically'])
  .describe('How the customer will be charged.')
export type PaymentCollectionMethod = z.infer<typeof PaymentCollectionMethodSchema>

export const InvoiceSchema = z
  .object({
    id: z.string().optional().describe('Platform-specific invoice identifier.').meta({ example: 'inv_1042' }),
    type: InvoiceTypeSchema.optional().meta({ example: 'INVOICE' }),
    status: InvoiceStatusSchema.optional().meta({ example: 'PAID' }),
    invoiceNumber: z.string().optional().describe('Human-readable invoice number as shown to the customer.').meta({ example: 'INV-1042' }),
    contactId: z.string().optional().describe('Contact.id of the customer being invoiced.').meta({ example: 'cus_4Qm2Xa9Lr' }),
    currency: Iso4217Currency.optional().meta({ example: 'USD' }),
    totalAmount: nullish(Amount).describe('Grand total including tax, in the invoice currency (minor units).').meta({ example: 125000 }),
    taxAmount: nullish(Amount).describe('Total tax component of `totalAmount` (minor units).').meta({ example: 10000 }),
    discountAmount: nullish(Amount).describe('Total discount applied (minor units).').meta({ example: 0 }),
    paidAmount: nullish(Amount).describe('Amount collected so far (minor units).').meta({ example: 125000 }),
    balanceAmount: nullish(Amount).describe('Outstanding balance (`totalAmount` − `paidAmount`), minor units.').meta({ example: 0 }),
    refundAmount: nullish(Amount).describe('Amount refunded to the customer, if any (minor units).').meta({ example: 0 }),
    refundReason: z.string().optional().describe('Free-form refund explanation.').meta({ example: 'No refund issued' }),
    paymentCollectionMethod: PaymentCollectionMethodSchema.optional().meta({ example: 'send_invoice' }),
    reference: z.string().optional().describe('Customer-facing reference (PO number, project code).').meta({ example: 'PO-ACME-2026' }),
    notes: z.string().optional().describe('Free-form notes shown on the invoice.').meta({ example: 'Thank you for your business, Acme Industries.' }),
    url: z.url().optional().describe('Hosted invoice URL, when the platform provides one.').meta({ example: 'https://app.acme.example/invoices/INV-1042' }),
    send: z
      .boolean()
      .optional()
      .describe('When `true` on create, the platform emails the invoice immediately.')
      .meta({ example: true }),
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
    lineItems: nullish(z.array(LineitemSchema)).describe('Invoice line items.'),
    attachments: z.array(AttachmentSchema).optional().describe('File attachments linked to the invoice.'),
    postedAt: DateOrCalendarDate.optional().describe('Invoice date — when it was issued.').meta({ example: '2026-02-01' }),
    dueAt: DateOrCalendarDate.optional().describe('Payment due date.').meta({ example: '2026-03-03' }),
    paidAt: z.date().optional().describe('When the invoice was fully paid.').meta({ example: '2026-02-20T00:00:00Z' }),
    cancelledAt: z.date().optional().describe('When the invoice was voided.').meta({ example: null }),
    refundedAt: z.date().optional().describe('When the invoice was refunded.').meta({ example: null }),
    createdAt: z.date().optional().describe('Platform timestamp when the record was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updatedAt: z.date().optional().describe('Platform timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('Customer invoice — a request for payment issued to a customer.')
export type Invoice = z.infer<typeof InvoiceSchema>
