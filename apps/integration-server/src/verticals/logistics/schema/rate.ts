import { z } from 'zod'
import { Amount, ExternalId, Iso4217Currency, nullish } from '@opensteward/shared'

export const RateSchema = z.object({
  id: ExternalId.optional().meta({ example: 'rate_1042' }),
  carrierId: z.string().optional().meta({ example: 'ups' }),
  serviceCode: z.string().optional().meta({ example: 'ups_ground' }),
  serviceName: z.string().optional().meta({ example: 'UPS Ground' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  totalAmount: nullish(Amount).meta({ example: 1200 }),
  retailAmount: nullish(Amount).meta({ example: 1500 }),
  transitDays: z.number().int().min(0).optional().meta({ example: 3 }),
  estimatedDeliveryAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  isGuaranteedDelivery: z.boolean().optional().meta({ example: false }),
  deliveryDays: z.number().int().min(0).optional().meta({ example: 3 }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Rate = z.infer<typeof RateSchema>
