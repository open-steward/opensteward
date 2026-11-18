import { z } from 'zod'
import { ExternalId } from '@opensteward/shared'
import { CarrierServiceSchema } from './shared'

export const CarrierSchema = z.object({
  id: ExternalId.optional().meta({ example: 'ups' }),
  name: z.string().optional().meta({ example: 'UPS' }),
  code: z.string().optional().meta({ example: 'ups' }),
  trackingUrlTemplate: z.string().optional().meta({ example: 'https://www.ups.com/track?tracknum={trackingNumber}' }),
  services: z.array(CarrierServiceSchema).optional(),
  isActive: z.boolean().optional().meta({ example: true }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Carrier = z.infer<typeof CarrierSchema>
