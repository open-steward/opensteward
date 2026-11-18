import { z } from 'zod'
import { ExternalId, withUnknown } from '@opensteward/shared'
import { MoneySchema } from './shared'

export const LabelFormatSchema = withUnknown(['PDF', 'PNG', 'ZPL', 'EPL2'])
export type LabelFormat = z.infer<typeof LabelFormatSchema>

export const LabelStatusSchema = withUnknown(['CREATED', 'USED', 'REFUNDED', 'VOIDED'])
export type LabelStatus = z.infer<typeof LabelStatusSchema>

export const LabelSchema = z.object({
  id: ExternalId.optional().meta({ example: 'lbl_1042' }),
  shipmentId: z.string().optional().meta({ example: 'shp_1042' }),
  trackingNumber: z.string().optional().meta({ example: '1Z999AA10123456784' }),
  carrierId: z.string().optional().meta({ example: 'ups' }),
  serviceCode: z.string().optional().meta({ example: 'ups_ground' }),
  format: LabelFormatSchema.optional().meta({ example: 'PDF' }),
  status: LabelStatusSchema.optional().meta({ example: 'CREATED' }),
  url: z.url().optional().describe('Hosted label URL (PDF or PNG).').meta({ example: 'https://labels.acme.example/shp_1042.pdf' }),
  base64: z.string().optional().describe('Base64-encoded label content (when not hosted).').meta({ example: 'JVBERi0xLjQKJ...' }),
  cost: MoneySchema.optional(),
  refundAt: z.date().optional().meta({ example: null }),
  voidedAt: z.date().optional().meta({ example: null }),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Label = z.infer<typeof LabelSchema>
