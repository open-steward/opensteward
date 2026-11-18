import { z } from 'zod'
import { Iso4217Currency, IsoDatetime } from '@opensteward/shared'
import { PurchaseOrderStatusSchema } from './shared'

export const PurchaseOrderLineSchema = z.object({
  productId: z.string().meta({ example: 'item_wk2026' }),
  quantityOrdered: z.number().meta({ example: 200 }),
  quantityReceived: z.number().optional().meta({ example: 100 }),
  unitCost: z.number().optional().meta({ example: 2500 }),
  lineTotal: z.number().optional().meta({ example: 500000 }),
})
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>

export const PurchaseOrderSchema = z.object({
  id: z.string().meta({ example: 'po_1042' }),
  externalId: z.string().meta({ example: 'po_1042' }),
  number: z.string().optional().meta({ example: 'PO-1042' }),
  supplierId: z.string().meta({ example: 'sup_1042' }),
  destinationLocationId: z.string().optional().meta({ example: 'loc_sfo1' }),
  status: PurchaseOrderStatusSchema.meta({ example: 'sent' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  subtotalAmount: z.number().optional().meta({ example: 500000 }),
  totalAmount: z.number().optional().meta({ example: 500000 }),
  lines: z.array(PurchaseOrderLineSchema),
  expectedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  orderedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  receivedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>
