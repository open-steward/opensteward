import { z } from 'zod'

export const WebhookResourceTypeSchema = z.enum([
  'products',
  'stock-levels',
  'locations',
  'suppliers',
  'purchase-orders',
  'stock-transfers',
  'stock-adjustments',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'received',
  'transferred',
  'adjusted',
  'restocked',
  'low_stock',
  'unknown',
])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  id: z.string().optional().meta({ example: 'evt_stock_wk2026_updated' }),
  platform: z.string().meta({ example: 'cin7' }),
  type: z.string().meta({ example: 'stock-levels.updated' }),
  resourceType: WebhookResourceTypeSchema.meta({ example: 'stock-levels' }),
  action: WebhookActionSchema.meta({ example: 'updated' }),
  resourceId: z.string().meta({ example: 'item_wk2026:loc_sfo1' }),
  productId: z.string().optional().meta({ example: 'item_wk2026' }),
  locationId: z.string().optional().meta({ example: 'loc_sfo1' }),
  payload: z.record(z.string(), z.unknown()),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
