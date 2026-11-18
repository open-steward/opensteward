import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { StockAdjustmentReasonSchema } from './shared'

export const StockAdjustmentLineSchema = z.object({
  productId: z.string().meta({ example: 'item_wk2026' }),
  deltaQuantity: z.number().meta({ example: -10 }),
  countedQuantity: z.number().optional().meta({ example: 240 }),
  notes: z.string().optional().meta({ example: 'sale' }),
})
export type StockAdjustmentLine = z.infer<typeof StockAdjustmentLineSchema>

export const StockAdjustmentSchema = z.object({
  id: z.string().meta({ example: 'adj_1042' }),
  externalId: z.string().meta({ example: 'adj_1042' }),
  locationId: z.string().meta({ example: 'loc_sfo1' }),
  reason: StockAdjustmentReasonSchema.meta({ example: 'correction' }),
  lines: z.array(StockAdjustmentLineSchema),
  adjustedAt: IsoDatetime.meta({ example: '2026-02-01T14:20:00Z' }),
  adjustedBy: z.string().optional().meta({ example: 'Jane Doe' }),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type StockAdjustment = z.infer<typeof StockAdjustmentSchema>
