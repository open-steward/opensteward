/**
 * Signhost signer Activity -> canonical AuditTrailEntry.
 *
 * Fields per the Activity model
 * (https://developer.signhost.com/openapi/models/Activity.md): `Id` ("Unique
 * activity identifier"), `Code`, `Activity` ("Activity description"), `Info`
 * ("Additional activity information"), `CreatedDateTime` ("When the activity
 * occurred"). Codes: "101 - Invitation sent, 103 - Opened, 104 - Reminder
 * sent, 105 - Document opened, Info property contains the file id of the
 * opened document., 202 - Rejected, 203 - Signed, 204 - Signer delegated,
 * 301 - Signed document sent, 302 - Signed document opened, 303 - Signed
 * document downloaded, 401 - Receipt sent, 402 - Receipt opened, 403 -
 * Receipt downloaded".
 */
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'
import type { RawSignhostActivity, RawSignhostSigner } from './signer'

function mapCode(code: number | undefined): AuditTrailEventType {
  switch (code) {
    case 101:
      return 'sent'
    case 103:
    case 105:
      return 'viewed'
    case 104:
      return 'auto_reminded'
    case 202:
      return 'declined'
    case 203:
      return 'signed'
    case 204:
      return 'reassigned'
    case 301:
    case 302:
    case 303:
    case 401:
    case 402:
    case 403:
      return 'other'
    default:
      return 'unknown'
  }
}

export function transformAuditTrailEntry(
  raw: RawSignhostActivity,
  signer: RawSignhostSigner,
  envelopeId: string,
): AuditTrailEntry {
  const activityId = pickStr(raw.Id)
  if (!activityId) throw new Error(`signhost activity of transaction ${envelopeId} has no Id`)
  const occurredAt = toIso(raw.CreatedDateTime)
  if (!occurredAt) throw new Error(`signhost activity ${activityId} has no CreatedDateTime`)
  const description = pickStr(raw.Activity)
  if (!description) throw new Error(`signhost activity ${activityId} has no Activity`)
  return {
    // The id carries its transaction so getAuditTrailEntry can read it back.
    id: `${envelopeId}:${activityId}`,
    externalId: activityId,
    envelopeId,
    occurredAt,
    eventType: mapCode(raw.Code),
    description,
    actorId: pickStr(signer.Id),
    actorEmail: pickStr(signer.Email),
    platform: 'signhost',
    metadata: strMap({ code: raw.Code, info: raw.Info }),
    raw,
  }
}
