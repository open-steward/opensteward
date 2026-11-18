import { z } from 'zod'
import { IsoDatetime, withUnknown } from '@opensteward/shared'

export const SignerRoleSchema = withUnknown([
  'signer',
  'cc',
  'in_person_signer',
  'witness',
  'editor',
  'approver',
])
export type SignerRole = z.infer<typeof SignerRoleSchema>

export const SignerStatusSchema = withUnknown([
  'created',
  'sent',
  'delivered',
  'signed',
  'declined',
  'auto_responded',
])
export type SignerStatus = z.infer<typeof SignerStatusSchema>

export const SignerSchema = z.object({
  id: z.string().meta({ example: 'signer_jane' }),
  externalId: z.string().meta({ example: 'signer_jane' }),
  envelopeId: z.string().meta({ example: 'env_1042' }),
  // Optional: eID / national-identity e-sign platforms (e.g. validated-id,
  // signicat, swisscom, evrotrust) identify signers without ever exposing an
  // email. Transforms must omit this field rather than emit an empty string.
  email: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
  name: z.string().meta({ example: 'Jane Doe' }),
  role: SignerRoleSchema.meta({ example: 'signer' }),
  status: SignerStatusSchema.meta({ example: 'signed' }),
  routingOrder: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('1-indexed; only meaningful when envelope.signingOrder = sequential.')
    .meta({ example: 1 }),
  sentAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  deliveredAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  signedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  declinedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  declineReason: z.string().optional().meta({ example: 'Terms require legal review' }),
  platform: z.string().meta({ example: 'docusign' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Signer = z.infer<typeof SignerSchema>
