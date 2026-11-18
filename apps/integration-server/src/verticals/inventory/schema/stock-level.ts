import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

/**
 * StockLevel — quantity of a Product at a Location. Read-only.
 *
 * Id is synthetic `<productId>:<locationId>` for platforms that don't expose
 * a stable stock-level id (most don't).
 */
export const StockLevelSchema = z.object({
  id: z.string().meta({ example: 'item_wk2026:loc_sfo1' }),
  externalId: z.string().optional().meta({ example: 'item_wk2026:loc_sfo1' }),
  productId: z.string().meta({ example: 'item_wk2026' }),
  locationId: z.string().meta({ example: 'loc_sfo1' }),
  quantityOnHand: z.number().meta({ example: 250 }),
  quantityAvailable: z.number().optional().describe('on-hand minus committed').meta({ example: 240 }),
  quantityCommitted: z.number().optional().describe('allocated to open orders').meta({ example: 10 }),
  quantityIncoming: z.number().optional().describe('expected from open POs').meta({ example: 100 }),
  quantityOutgoing: z.number().optional().describe('committed to fulfilment').meta({ example: 10 }),
  reorderPoint: z.number().optional().meta({ example: 50 }),
  reorderQuantity: z.number().optional().meta({ example: 200 }),
  lastCountedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  lots: z.array(z.object({
    lot: z.string().meta({ example: 'LOT-2026-01' }),
    quantity: z.number().meta({ example: 250 }),
    expiresAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  })).optional(),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type StockLevel = z.infer<typeof StockLevelSchema>
