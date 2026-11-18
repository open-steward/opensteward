import { z } from 'zod'
import { AddressSchema } from './shared'

export const LocationSchema = z.object({
  id: z.string().meta({ example: 'loc_sf_market' }),
  name: z.string().meta({ example: 'San Francisco Warehouse' }),
  active: z.boolean().optional().meta({ example: true }),
  address: AddressSchema.optional(),
  phone: z.string().optional().meta({ example: '+14155550123' }),
  /** Whether this location participates in fulfillment (vs. retail-only, etc). */
  isFulfillmentCenter: z.boolean().optional().meta({ example: true }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { locationPlatformId: 'gid://shopify/Location/loc_sf_market' } }),
})
export type Location = z.infer<typeof LocationSchema>
