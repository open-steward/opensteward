import type { AuditTrailEntry } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * One row of `GET /documents/{documentId}/log` ("Get a detailed log of
 * events for a specific document."). The 200 body is a bare array of
 * `LogEntry` ("Detailed log entry"), whose declared properties are exactly
 * these, all `type: string`
 * (https://raw.githubusercontent.com/getaccept/openapi/HEAD/openapi.json).
 */
export interface RawGetAcceptLogEntry {
  created_at?: string
  document_id?: string
  email?: string
  event_meta_data?: string
  event_name?: string
  first_name?: string
  geo_city?: string
  geo_country_name?: string
  geo_ip?: string
  last_name?: string
}

/**
 * `LogEntry` declares no id, so a row is addressed by its position in the
 * array the endpoint returns: `<documentId>:<index>`.
 *
 * The spec gives `event_name` no vocabulary (no enum, no example), so the
 * canonical `eventType` is `'unknown'` and the verbatim name is kept in
 * `description` and `metadata.eventName` rather than guessed at.
 *
 * `created_at` and `event_name` are the only sources for the required
 * canonical `occurredAt` and `description`, so a row missing either throws
 * rather than getting an invented default.
 *
 * `actorIp` is read from `geo_ip`. The spec declares that field only as
 * `{"type":"string"}` with no description, so treating it as the actor's IP
 * is a reading of the field name, not a documented mapping. `created_at` has
 * no documented format either; it is parsed as given.
 */
export function transformAuditTrailEntry(
  raw: RawGetAcceptLogEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(raw.created_at)
  if (!occurredAt) {
    throw new Error(
      `GetAccept log entry ${index} of document ${envelopeId} has no parseable created_at`,
    )
  }
  const description = pickStr(raw.event_name)
  if (!description) {
    throw new Error(`GetAccept log entry ${index} of document ${envelopeId} has no event_name`)
  }
  const actorName = [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean).join(' ')
  const id = `${envelopeId}:${index}`
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType: 'unknown',
    description,
    actorEmail: pickStr(raw.email),
    actorName: actorName || undefined,
    actorIp: pickStr(raw.geo_ip),
    platform: 'getaccept',
    metadata: strMap({
      eventName: raw.event_name,
      eventMetaData: raw.event_meta_data,
      geoCity: raw.geo_city,
      geoCountryName: raw.geo_country_name,
    }),
    raw,
  }
}
