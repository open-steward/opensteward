import { z } from 'zod'
import { IsoDatetime, withUnknown } from '@opensteward/shared'
import { SigningOrderSchema } from './shared'

export const EnvelopeStatusSchema = withUnknown([
  'draft',
  'sent',
  'delivered',
  'completed',
  'declined',
  'voided',
  'expired',
])
export type EnvelopeStatus = z.infer<typeof EnvelopeStatusSchema>

export const EnvelopeSchema = z.object({
  id: z.string().meta({ example: 'env_1042' }),
  externalId: z.string().meta({ example: 'env_1042' }),
  status: EnvelopeStatusSchema.meta({ example: 'completed' }),
  subject: z.string().meta({ example: 'Master Services Agreement — Acme Industries' }),
  message: z.string().optional().describe('Sender-supplied email message body; included as plain text.').meta({ example: 'Please review and sign.' }),
  senderId: z.string().optional().meta({ example: 'usr_olivia' }),
  senderEmail: z.email().optional().meta({ example: 'olivia.admin@northwind.example' }),
  senderName: z.string().optional().meta({ example: 'Olivia Admin' }),
  signingOrder: SigningOrderSchema.meta({ example: 'sequential' }),
  signerIds: z.array(z.string()).describe('Ordered for sequential, unordered for parallel.').meta({ example: ['signer_jane'] }),
  documentIds: z.array(z.string()).meta({ example: ['doc_msa'] }),
  templateId: z.string().optional().meta({ example: 'tmpl_msa' }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  sentAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  deliveredAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  completedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  declinedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  voidedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  expiresAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'docusign' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Envelope = z.infer<typeof EnvelopeSchema>
