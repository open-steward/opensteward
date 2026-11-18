import { z } from 'zod'
import { IsoDatetime, withUnknown } from '@opensteward/shared'

export const FulfillmentStatusSchema = withUnknown([
  'PENDING',
  'OPEN',
  'SUCCESS',
  'CANCELLED',
  'ERROR',
  'FAILURE',
])
export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>

export const FulfillmentLineItemSchema = z.object({
  lineItemId: z.string().meta({ example: 'li_1' }),
  quantity: z.number().int().min(0).meta({ example: 1 }),
})
export type FulfillmentLineItem = z.infer<typeof FulfillmentLineItemSchema>

export const FulfillmentSchema = z.object({
  id: z.string().meta({ example: 'ful_1042' }),
  orderId: z.string().meta({ example: 'ord_1042' }),
  status: FulfillmentStatusSchema.optional().meta({ example: 'SUCCESS' }),
  trackingNumber: z.string().optional().meta({ example: '1Z999AA10123456784' }),
  trackingUrl: z.url().optional().meta({ example: 'https://www.ups.com/track?tracknum=1Z999AA10123456784' }),
  carrier: z.string().optional().meta({ example: 'UPS' }),
  service: z.string().optional().meta({ example: 'Ground' }),
  locationId: z.string().optional().meta({ example: 'loc_sf_market' }),
  /** Optional back-link into the logistics vertical (shipment id). */
  shipmentId: z.string().optional().meta({ example: null }),
  lineItems: z.array(FulfillmentLineItemSchema).optional(),
  notifyCustomer: z.boolean().optional().meta({ example: true }),
  shippedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  estimatedDeliveryAt: IsoDatetime.optional().meta({ example: '2026-01-18T09:30:00Z' }),
  deliveredAt: IsoDatetime.optional().meta({ example: '2026-01-17T16:45:00Z' }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { fulfillmentPlatformId: 'gid://shopify/Fulfillment/ful_1042' } }),
})
export type Fulfillment = z.infer<typeof FulfillmentSchema>
