/**
 * Foxit eSign envelope history → canonical AuditTrailEntry.
 *
 * Source: the `Folder History` array of "Get Envelope Details",
 * GET /folders/myfolder (Foxit eSign OpenAPI example, served by
 * https://developers.foxitesign.foxit.com/). A documented row:
 *
 *   { "firstName": "Jane", "lastName": "Doe", "email": "janedoe@esigngenie.com",
 *     "envelopeId": 86377, "dateChanged": 1564738091000,
 *     "changeDoneByParty": 28, "action": "Signed" }
 *
 * `dateChanged` is epoch milliseconds. The rows carry no id, so an entry is
 * identified by its position in the array. The name/email on a row is not
 * always the actor: the documented `InviteSentTo` row names the invitee
 * while `changeDoneByParty` is the author, so only `changeDoneByParty` is
 * mapped to the actor and the name/email stay in metadata.
 */
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { strMap } from './shared'

export interface RawFoxitESignFolderHistoryEntry {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  envelopeId?: number | null
  dateChanged: number
  changeDoneByParty?: number | null
  action: string
}

/**
 * The actions the documented example shows. `InviteAccepted` is "viewed":
 * the activity-history example describes the same step as "Invitation
 * accepted by ABC XYZ" with action "Opened".
 */
const ACTION_EVENT_TYPES: Record<string, AuditTrailEventType> = {
  Created: 'created',
  InviteSentTo: 'sent',
  InviteAccepted: 'viewed',
  Signed: 'signed',
}

export function historyTime(raw: RawFoxitESignFolderHistoryEntry): string {
  if (typeof raw.dateChanged !== 'number' || !Number.isFinite(raw.dateChanged)) {
    throw new Error('Foxit eSign Folder History row has no numeric dateChanged')
  }
  return new Date(raw.dateChanged).toISOString()
}

export function transformAuditTrailEntry(
  raw: RawFoxitESignFolderHistoryEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  if (typeof raw.action !== 'string' || raw.action === '') {
    throw new Error('Foxit eSign Folder History row has no action')
  }
  const id = `${envelopeId}:${index}`
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt: historyTime(raw),
    eventType: ACTION_EVENT_TYPES[raw.action] ?? 'other',
    description: raw.action,
    actorId:
      typeof raw.changeDoneByParty === 'number' ? String(raw.changeDoneByParty) : undefined,
    platform: 'foxit-esign',
    metadata: strMap({
      action: raw.action,
      firstName: raw.firstName,
      lastName: raw.lastName,
      email: raw.email,
    }),
    raw,
  }
}
