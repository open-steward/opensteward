import { z } from 'zod'
import { ExternalId } from '@opensteward/shared'
import { AddressSchema } from './shared'

export const TrackingEventStatusSchema = z.enum([
  'PRE_TRANSIT',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'AVAILABLE_FOR_PICKUP',
  'RETURN_TO_SENDER',
  'FAILURE',
  'UNKNOWN',
])

export type TrackingEventStatus = z.infer<typeof TrackingEventStatusSchema>

export const TrackingEventSchema = z.object({
  id: ExternalId.optional().meta({ example: 'trk_1042' }),
  shipmentId: z.string().optional().meta({ example: 'shp_1042' }),
  trackingNumber: z.string().optional().meta({ example: '1Z999AA10123456784' }),
  carrierId: z.string().optional().meta({ example: 'ups' }),
  status: TrackingEventStatusSchema.optional().meta({ example: 'IN_TRANSIT' }),
  description: z.string().optional().meta({ example: 'Departed facility' }),
  location: AddressSchema.optional(),
  occurredAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type TrackingEvent = z.infer<typeof TrackingEventSchema>
