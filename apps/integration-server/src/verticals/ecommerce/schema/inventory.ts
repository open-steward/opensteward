import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

/**
 * Inventory level at a specific location for a specific variant. If the
 * platform does not expose a stable id, the adapter should synthesize one as
 * `${variantId}:${locationId}`.
 */
export const InventoryLevelSchema = z.object({
  id: z.string().meta({ example: 'var_wk2026_blk:loc_sf_market' }),
  variantId: z.string().meta({ example: 'var_wk2026_blk' }),
  locationId: z.string().meta({ example: 'loc_sf_market' }),
  /** Sellable stock at this location. */
  available: z.number().int().min(0).meta({ example: 42 }),
  /** Reserved for open orders not yet fulfilled. */
  committed: z.number().int().min(0).optional().meta({ example: 1 }),
  /** Incoming from POs / transfers. */
  incoming: z.number().int().min(0).optional().meta({ example: 10 }),
  /** Physical stock on hand (available + committed). */
  onHand: z.number().int().min(0).optional().meta({ example: 43 }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { inventoryLevelPlatformId: 'gid://shopify/InventoryLevel/var_wk2026_blk:loc_sf_market' } }),
})
export type InventoryLevel = z.infer<typeof InventoryLevelSchema>
