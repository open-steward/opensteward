import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { StockTransferStatusSchema } from './shared'

export const StockTransferLineSchema = z.object({
  productId: z.string().meta({ example: 'item_wk2026' }),
  quantity: z.number().meta({ example: 50 }),
  quantityReceived: z.number().optional().meta({ example: 50 }),
})
export type StockTransferLine = z.infer<typeof StockTransferLineSchema>

export const StockTransferSchema = z.object({
  id: z.string().meta({ example: 'tr_1042' }),
  externalId: z.string().meta({ example: 'tr_1042' }),
  number: z.string().optional().meta({ example: 'TR-1042' }),
  fromLocationId: z.string().meta({ example: 'loc_sfo1' }),
  toLocationId: z.string().meta({ example: 'loc_nyc1' }),
  status: StockTransferStatusSchema.meta({ example: 'in_transit' }),
  lines: z.array(StockTransferLineSchema),
  shippedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  receivedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type StockTransfer = z.infer<typeof StockTransferSchema>
