import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'

export const InvoiceStatusSchema = withUnknown([
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
])
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>

export const InvoiceLineItemSchema = z.object({
  id: z.string().meta({ example: 'il_1042' }),
  externalId: z.string().meta({ example: 'il_1042' }),
  invoiceId: z.string().meta({ example: 'inv_1042' }),
  description: z.string().optional().meta({ example: 'Invoice INV-1042' }),
  quantity: z.number().int().min(0).optional().meta({ example: 1 }),
  unitAmount: z.number().int().optional().meta({ example: 125000 }),
  amount: z.number().int().meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  priceId: z.string().optional().meta({ example: 'price_1042' }),
  productId: z.string().optional().meta({ example: 'prod_1042' }),
  subscriptionId: z.string().optional().meta({ example: 'sub_1042' }),
  periodStart: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  periodEnd: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  proration: z.boolean().optional().meta({ example: false }),
  metadata: z.record(z.string(), z.string()),
})
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>

export const InvoiceSchema = z.object({
  id: z.string().meta({ example: 'inv_1042' }),
  externalId: z.string().meta({ example: 'inv_1042' }),
  number: z.string().optional().describe('Display number / human-readable invoice number.').meta({ example: 'INV-1042' }),
  customerId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  subscriptionId: z.string().optional().meta({ example: 'sub_1042' }),
  status: InvoiceStatusSchema.meta({ example: 'paid' }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  subtotal: z.number().int().optional().meta({ example: 125000 }),
  tax: z.number().int().optional().meta({ example: 0 }),
  total: z.number().int().meta({ example: 125000 }),
  amountDue: z.number().int().optional().meta({ example: 0 }),
  amountPaid: z.number().int().optional().meta({ example: 125000 }),
  amountRemaining: z.number().int().optional().meta({ example: 0 }),
  dueDate: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  paidAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  periodStart: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  periodEnd: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  hostedInvoiceUrl: z.url().optional().meta({ example: 'https://pay.stripe.com/invoice/inv_1042' }),
  invoicePdfUrl: z.url().optional().meta({ example: 'https://pay.stripe.com/invoice/inv_1042/pdf' }),
  lineItemIds: z.array(z.string()).optional().meta({ example: ['il_1042'] }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Invoice = z.infer<typeof InvoiceSchema>
