import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

export interface RawAdobeSignEvent {
  type?: string
  date?: string
  description?: string
  comment?: string
  participantEmail?: string
  participantName?: string
  participantId?: string
  participantRole?: string
  initiatingUserEmail?: string
  initiatingUserName?: string
  actingUserEmail?: string
  actingUserName?: string
  actingUserIpAddress?: string
  versionId?: string
  [key: string]: unknown
}

function mapType(raw: string | undefined): AuditTrailEventType {
  const t = (raw ?? '').toUpperCase()
  if (t.includes('CREATED') || t.includes('UPLOADED')) return 'created'
  if (t.includes('EMAILED') || t.includes('SENT')) return 'sent'
  if (t.includes('VIEWED') || t.includes('ESIGNED_PROCESSING_VIEWED')) return 'viewed'
  if (t.includes('SIGNED') || t.includes('APPROVED')) return 'signed'
  if (t.includes('REJECTED') || t.includes('DECLINED')) return 'declined'
  if (t.includes('CANCELLED') || t.includes('VOIDED')) return 'voided'
  if (t.includes('EXPIRED')) return 'expired'
  if (t.includes('REMIND')) return 'auto_reminded'
  if (t.includes('AUTH')) return 'authenticated'
  if (t.includes('COMPLETED')) return 'completed'
  if (t.includes('REASSIGN') || t.includes('DELEGATE')) return 'reassigned'
  if (t.includes('MODIFIED')) return 'corrected'
  if (t.includes('FAILED') || t.includes('FAILURE')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawAdobeSignEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(raw.date) ?? new Date(0).toISOString()
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapType(raw.type),
    description: pickStr(raw.description) ?? pickStr(raw.comment) ?? raw.type ?? '',
    actorId: pickStr(raw.participantId),
    actorEmail: pickStr(raw.actingUserEmail ?? raw.participantEmail ?? raw.initiatingUserEmail),
    actorName: pickStr(raw.actingUserName ?? raw.participantName ?? raw.initiatingUserName),
    actorIp: pickStr(raw.actingUserIpAddress),
    platform: 'adobe-acrobat-sign',
    metadata: strMap({
      type: raw.type,
      participantRole: raw.participantRole,
      versionId: raw.versionId,
    }),
    raw,
  }
}
