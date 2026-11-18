/**
 * SignNow document history row → canonical AuditTrailEntry.
 *
 * Source: GET /document/{document_id}/historyfull
 * https://docs.signnow.com/docs/document/operations/get-document-historyfull
 *
 * Documented row fields: client_app_name, client_timestamp, created,
 * document_id, element_id, email, event, field_id, ip_address,
 * json_attributes, origin, unique_id, user_id. `created` is documented as an
 * integer epoch, and the `signer_authentication_success` example sends it as
 * a string ("created" : "1672128416"). `client_timestamp` may be null.
 */
import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { epochToIso, pickStr, strMap } from './shared'

export interface RawSignNowHistoryEntry {
  client_app_name?: string | null
  client_timestamp?: string | number | null
  created?: string | number | null
  document_id?: string | null
  element_id?: string | null
  email?: string | null
  event?: string | null
  field_id?: string | null
  ip_address?: string | null
  json_attributes?: unknown
  origin?: string | null
  unique_id?: string | null
  user_id?: string | null
}

/**
 * Only the event names that appear in SignNow's historyfull documentation
 * are mapped. Documented events that have no canonical counterpart are
 * 'other'; an event the docs never name is 'unknown'.
 */
const EVENT_MAP: Record<string, AuditTrailEventType> = {
  create_document: 'created',
  created_document: 'created',
  document_invite_sent: 'sent',
  added_signature: 'signed',
  signer_authentication_success: 'authenticated',
  signer_authentication_failure: 'other',
  document_signing_session_completed: 'other',
}

function required<T>(value: T | null | undefined, field: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`SignNow historyfull row is missing its documented \`${field}\` field`)
  }
  return value
}

export function transformAuditTrailEntry(
  raw: RawSignNowHistoryEntry,
  envelopeId: string,
): AuditTrailEntry {
  const uniqueId = required(pickStr(raw.unique_id), 'unique_id')
  const occurredAt = required(epochToIso(required(raw.created, 'created')), 'created')
  const event = required(pickStr(raw.event), 'event')
  return {
    id: `${envelopeId}:${uniqueId}`,
    externalId: uniqueId,
    envelopeId,
    occurredAt,
    eventType: EVENT_MAP[event] ?? 'unknown',
    description: event,
    actorId: pickStr(raw.user_id),
    actorEmail: pickStr(raw.email),
    actorIp: pickStr(raw.ip_address),
    platform: 'signnow',
    metadata: strMap({
      origin: raw.origin,
      clientAppName: raw.client_app_name,
    }),
    raw,
  }
}
