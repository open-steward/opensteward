import { z } from 'zod'
import { ExternalId, HHMMTime } from '@opensteward/shared'
import { AddressSchema } from './shared'

export const WarehouseSchema = z.object({
  id: ExternalId.optional().meta({ example: 'wh_sfo1' }),
  name: z.string().optional().meta({ example: 'SF Warehouse' }),
  code: z.string().optional().meta({ example: 'SFO1' }),
  address: AddressSchema.optional(),
  isActive: z.boolean().optional().meta({ example: true }),
  timezone: z.string().optional().describe('IANA tz database identifier (e.g. `America/New_York`).').meta({ example: 'America/Los_Angeles' }),
  cutoffTime: HHMMTime.optional().describe('Daily cut-off time for same-day pickup, local to `timezone`.').meta({ example: '17:00' }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Warehouse = z.infer<typeof WarehouseSchema>
