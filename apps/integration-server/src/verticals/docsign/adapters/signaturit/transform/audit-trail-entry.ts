/**
 * Signaturit `documents[].events` item → canonical AuditTrailEntry.
 *
 * The API has no JSON audit-trail endpoint (only the PDF download). Each
 * document item carries "events — A list of events related with the
 * document", each with `created_at` and `type`.
 */
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { itemKey, type RawSignaturitDocumentItem, type RawSignaturitEvent } from './envelope'
import { pickStr, requireStr, toIso } from './shared'

/** Every documented event type. */
const EVENT_TYPES: Record<string, AuditTrailEventType> = {
  email_processed: 'sent',
  email_delivered: 'other',
  email_bounced: 'delivery_failed',
  email_deferred: 'other',
  reminder_email_processed: 'auto_reminded',
  reminder_email_delivered: 'other',
  sms_processed: 'sent',
  sms_delivered: 'other',
  document_opened: 'viewed',
  document_signed: 'signed',
  document_completed: 'completed',
  audit_trail_completed: 'other',
  document_declined: 'declined',
  document_expired: 'expired',
  document_canceled: 'voided',
  photo_added: 'other',
  voice_added: 'other',
  file_added: 'other',
  photo_id_added: 'other',
  expiration_extended: 'other',
}

/**
 * Events the docs describe as the signer acting ("The document has been
 * opened / signed / declined", "The signer has attached …"). The rest are
 * the platform's own deliveries and state changes.
 */
const SIGNER_EVENTS = new Set([
  'document_opened',
  'document_signed',
  'document_declined',
  'photo_added',
  'voice_added',
  'file_added',
  'photo_id_added',
])

/** Canonical id of the `index`-th event of a document item. */
export function eventKey(envelopeId: string, itemId: string, index: number): string {
  return `${itemKey(envelopeId, itemId)}:${index}`
}

export function transformAuditTrailEntry(
  raw: RawSignaturitEvent,
  item: RawSignaturitDocumentItem,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const itemId = requireStr(item.id, 'document id')
  const id = eventKey(envelopeId, itemId, index)
  const occurredAt = toIso(raw.created_at)
  if (!occurredAt) throw new Error(`Signaturit event ${id} is missing created_at`)
  const type = requireStr(raw.type, `type of event ${id}`)
  const bySigner = SIGNER_EVENTS.has(type)
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType: EVENT_TYPES[type] ?? 'unknown',
    description: type,
    actorId: bySigner ? itemKey(envelopeId, itemId) : undefined,
    actorEmail: bySigner ? pickStr(item.email) : undefined,
    actorName: bySigner ? pickStr(item.name) : undefined,
    platform: 'signaturit',
    metadata: { documentId: itemId },
    raw,
  }
}
