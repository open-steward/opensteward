import { z } from 'zod'

export const WebhookResourceTypeSchema = z.enum([
  'shipment',
  'order',
  'carrier',
  'warehouse',
  'tracking_event',
  'rate',
  'label',
  'manifest',
  'pickup',
])

export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum(['created', 'updated', 'deleted', 'cancelled'])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  platform: z.string().meta({ example: 'ups' }),
  type: z.string().meta({ example: 'shipment.updated' }),
  resourceType: WebhookResourceTypeSchema.meta({ example: 'shipment' }),
  action: WebhookActionSchema.meta({ example: 'updated' }),
  resourceId: z.string().optional().meta({ example: 'shp_1042' }),
  tenantId: z.string().optional().meta({ example: 'acme-industries' }),
  payload: z.record(z.string(), z.unknown()),
})

export type WebhookEvent = z.infer<typeof WebhookEventSchema>
