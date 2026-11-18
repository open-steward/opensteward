import { z } from 'zod'
import { ExternalId, Iso4217Currency, nullish, withUnknown } from '@opensteward/shared'
import { AddressSchema, LineitemSchema } from './shared'

export const OrderStatusSchema = withUnknown([
  'PENDING',
  'PROCESSING',
  'ON_HOLD',
  'AWAITING_SHIPMENT',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
])

export type OrderStatus = z.infer<typeof OrderStatusSchema>

export const OrderSchema = z.object({
  id: ExternalId.optional().meta({ example: 'ord_1042' }),
  status: OrderStatusSchema.optional().meta({ example: 'SHIPPED' }),
  orderNumber: z.string().optional().meta({ example: 'ORD-1042' }),
  customerId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  warehouseId: z.string().optional().meta({ example: 'wh_sfo1' }),
  shipmentIds: z.array(z.string()).optional().meta({ example: ['shp_8f3a2b9c4d'] }),
  originAddress: AddressSchema.optional(),
  destinationAddress: AddressSchema.optional(),
  lineItems: nullish(z.array(LineitemSchema)),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  subtotalAmount: z.number().min(0).optional().meta({ example: 7999 }),
  taxAmount: z.number().min(0).optional().meta({ example: 700 }),
  shippingAmount: z.number().min(0).optional().meta({ example: 1200 }),
  discountAmount: z.number().min(0).optional().meta({ example: 0 }),
  totalAmount: z.number().min(0).optional().meta({ example: 9899 }),
  notes: z.string().optional().meta({ example: 'Leave at front desk.' }),
  requestedServiceCode: z.string().optional().meta({ example: 'ups_ground' }),
  orderAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  shippedAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  deliveredAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  cancelledAt: z.date().optional().meta({ example: null }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Order = z.infer<typeof OrderSchema>
