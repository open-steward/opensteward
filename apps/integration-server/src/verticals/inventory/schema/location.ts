import { z } from 'zod'
import { LocationTypeSchema, AddressSchema } from './shared'

export const LocationSchema = z.object({
  id: z.string().meta({ example: 'loc_sfo1' }),
  externalId: z.string().meta({ example: 'loc_sfo1' }),
  name: z.string().meta({ example: 'SF Warehouse' }),
  code: z.string().optional().meta({ example: 'SFO1' }),
  type: LocationTypeSchema.meta({ example: 'warehouse' }),
  parentLocationId: z.string().optional().describe(
    'For hierarchy (warehouse → zone → bin). Flat-with-parent-pointer pattern.',
  ).meta({ example: 'loc_sfo1' }),
  address: AddressSchema.optional(),
  isActive: z.boolean().meta({ example: true }),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Location = z.infer<typeof LocationSchema>
