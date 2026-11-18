import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish, withUnknown, DateOrCalendarDate } from '@opensteward/shared'
import { LineitemSchema, AddressSchema } from './shared'

export const OrderStatusSchema = withUnknown([
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
])
export type OrderStatus = z.infer<typeof OrderStatusSchema>

export const OrderTypeSchema = withUnknown(['SALES', 'PURCHASE'])
export type OrderType = z.infer<typeof OrderTypeSchema>

export const OrderSchema = z.object({
  id: ExternalId.optional().meta({ example: 'ord_7001' }),
  status: OrderStatusSchema.optional().meta({ example: 'COMPLETED' }),
  type: OrderTypeSchema.optional().meta({ example: 'SALES' }),
  accountId: z.string().optional().meta({ example: 'acct_4000' }),
  contactId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  totalAmount: nullish(Amount).meta({ example: 125000 }),
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
  billingAddress: AddressSchema.optional(),
  shippingAddress: AddressSchema.optional(),
  postedAt: DateOrCalendarDate.optional().meta({ example: '2026-02-01' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Order = z.infer<typeof OrderSchema>
