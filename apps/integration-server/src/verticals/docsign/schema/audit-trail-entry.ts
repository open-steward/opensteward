import { z } from 'zod'
import { IsoDatetime, withUnknown } from '@opensteward/shared'

export const AuditTrailEventTypeSchema = withUnknown([
  'created',
  'sent',
  'viewed',
  'signed',
  'declined',
  'voided',
  'completed',
  'auto_reminded',
  'delivery_failed',
  'authenticated',
  'expired',
  'corrected',
  'reassigned',
  'other',
])
export type AuditTrailEventType = z.infer<typeof AuditTrailEventTypeSchema>

/**
 * AuditTrailEntry — first-class canonical resource. The audit trail IS the
 * compliance evidence — making it queryable as a top-level surface beats
 * stuffing it under metadata.
 */
export const AuditTrailEntrySchema = z.object({
  id: z.string().meta({ example: 'audit_env_1042_completed' }),
  externalId: z.string().meta({ example: 'audit_env_1042_completed' }),
  envelopeId: z.string().meta({ example: 'env_1042' }),
  occurredAt: IsoDatetime.meta({ example: '2026-02-01T14:20:00Z' }),
  eventType: AuditTrailEventTypeSchema.meta({ example: 'completed' }),
  description: z.string().describe('Short, platform-supplied human-readable description.').meta({ example: 'Envelope completed' }),
  actorId: z.string().optional().describe('Signer or sender id; undefined for system events.').meta({ example: 'signer_jane' }),
  actorEmail: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
  actorName: z.string().optional().meta({ example: 'Jane Doe' }),
  actorIp: z.string().optional().meta({ example: '203.0.113.10' }),
  platform: z.string().meta({ example: 'docusign' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type AuditTrailEntry = z.infer<typeof AuditTrailEntrySchema>
