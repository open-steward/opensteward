import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'
import { AddressSchema, MoneySchema } from './shared'

export const OrderFinancialStatusSchema = withUnknown([
  'PENDING',
  'AUTHORIZED',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'VOIDED',
])
export type OrderFinancialStatus = z.infer<typeof OrderFinancialStatusSchema>

export const OrderFulfillmentStatusSchema = withUnknown([
  'UNFULFILLED',
  'PARTIAL',
  'FULFILLED',
  'RESTOCKED',
])
export type OrderFulfillmentStatus = z.infer<typeof OrderFulfillmentStatusSchema>

export const TaxLineSchema = z.object({
  title: z.string().meta({ example: 'CA State Tax' }),
  rate: z.number().min(0).describe('Decimal tax rate (e.g. 0.07 for 7%) — adapter convention may differ.').meta({ example: 0.0875 }),
  amount: MoneySchema,
})
export type TaxLine = z.infer<typeof TaxLineSchema>

export const LineItemSchema = z.object({
  id: z.string().meta({ example: 'li_1' }),
  productId: z.string().optional().meta({ example: 'prod_wk2026' }),
  variantId: z.string().optional().meta({ example: 'var_wk2026_blk' }),
  title: z.string().meta({ example: 'Wireless Keyboard' }),
  quantity: z.number().int().min(0).meta({ example: 1 }),
  /** Unit price. Multiply by quantity for line total. */
  price: MoneySchema,
  totalDiscount: MoneySchema.optional(),
  taxLines: z.array(TaxLineSchema).optional(),
  sku: z.string().optional().meta({ example: 'WK-2026' }),
  fulfillableQuantity: z.number().int().min(0).optional().meta({ example: 0 }),
  fulfillmentStatus: OrderFulfillmentStatusSchema.optional().meta({ example: 'FULFILLED' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { lineItemPlatformId: 'gid://shopify/LineItem/li_1' } }),
})
export type LineItem = z.infer<typeof LineItemSchema>

export const OrderSchema = z.object({
  id: z.string().meta({ example: 'ord_1042' }),
  orderNumber: z.string().optional().meta({ example: '#1042' }),
  /** Display name, e.g. Shopify "#1001". */
  name: z.string().optional().meta({ example: '#1042' }),
  customerId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  email: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
  phone: z.string().optional().meta({ example: '+14155550123' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  subtotalPrice: MoneySchema.optional(),
  totalTax: MoneySchema.optional(),
  totalDiscounts: MoneySchema.optional(),
  totalShipping: MoneySchema.optional(),
  totalPrice: MoneySchema.optional(),
  financialStatus: OrderFinancialStatusSchema.optional().meta({ example: 'PAID' }),
  fulfillmentStatus: OrderFulfillmentStatusSchema.optional().meta({ example: 'FULFILLED' }),
  lineItems: z.array(LineItemSchema).optional(),
  billingAddress: AddressSchema.optional(),
  shippingAddress: AddressSchema.optional(),
  fulfillmentIds: z.array(z.string()).optional().meta({ example: ['ful_1042'] }),
  refundIds: z.array(z.string()).optional().meta({ example: [] }),
  transactionIds: z.array(z.string()).optional().meta({ example: ['txn_1042'] }),
  discountCodes: z.array(z.string()).optional().meta({ example: ['ACME10'] }),
  tags: z.array(z.string()).optional().meta({ example: ['accessories'] }),
  note: z.string().optional().meta({ example: 'Leave at front desk.' }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  processedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  cancelledAt: IsoDatetime.optional().meta({ example: null }),
  cancelReason: z.string().optional().meta({ example: null }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { orderPlatformId: 'gid://shopify/Order/ord_1042' } }),
})
export type Order = z.infer<typeof OrderSchema>
