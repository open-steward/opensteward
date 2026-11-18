/**
 * `EnvelopeGetHistoryEvent` (an entry of `Events` on
 * `GET /v6/envelope/{envelopeId}/history`) → canonical AuditTrailEntry.
 *
 * The swagger types `Type` ("Type of the event") as a free string with no
 * enumeration, so every entry is `eventType: 'other'` with the platform's
 * `Type` as its description; mapping by keyword would guess. Events carry
 * no identifier (`TraceId` is unset until an event fires), so an entry is
 * identified by its position in the envelope's `Events` array.
 *
 * Swagger: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 */
import type { AuditTrailEntry } from '../../../schema/audit-trail-entry'
import type { RawNamirialHistoryEvent } from '../types'
import { pickStr, strMap, toIso } from './shared'

export function transformAuditTrailEntry(
  raw: RawNamirialHistoryEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const id = `${envelopeId}:${index}`
  const occurredAt = toIso(raw.CreationDate)
  if (!occurredAt) throw new Error(`Namirial history event ${id} has no CreationDate`)
  const type = pickStr(raw.Type)
  if (!type) throw new Error(`Namirial history event ${id} has no Type`)
  const recipient = raw.AffectedRecipient
  const actorName = [pickStr(recipient?.GivenName), pickStr(recipient?.Surname)]
    .filter(Boolean)
    .join(' ')
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType: 'other',
    description: type,
    actorId: pickStr(recipient?.Id),
    actorEmail: pickStr(recipient?.Email),
    actorName: actorName || undefined,
    platform: 'namirial',
    metadata: strMap({
      type,
      completed: raw.Completed,
      completedOn: toIso(raw.CompletedOn),
      isInErrorState: raw.IsInErrorState,
      traceId: raw.TraceId,
    }),
    raw,
  }
}
