/**
 * `EnvelopeGetActivity` (an entry of `Activities` on
 * `GET /v6/envelope/{envelopeId}`) → canonical Signer.
 *
 * eSignAnyWhere has no recipient resource: the recipients of an envelope
 * are its activities, each with one action (`Sign`, `SignAsP7M`, `View`,
 * `SendCopy`, `SignAutomatic`) carrying the recipient's
 * `ContactInformation`. `SignAutomatic` ("An automatic signing action") has
 * no contact information, so it is not a recipient and is not a Signer.
 *
 * Swagger: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 */
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import type { RawNamirialContactInformation, RawNamirialEnvelopeActivity } from '../types'
import { pickStr, strMap, toIso } from './shared'

export type NamirialRecipientKind = 'Sign' | 'SignAsP7M' | 'View' | 'SendCopy'

export interface NamirialRecipientAction {
  kind: NamirialRecipientKind
  contact: RawNamirialContactInformation
  /** The action's "parallel group" (`SigningGroup`, `SignAsP7MGroup`, …). */
  group: number | undefined
}

/** The recipient an activity addresses, or `undefined` for a `SignAutomatic` step. */
export function recipientAction(
  activity: RawNamirialEnvelopeActivity,
): NamirialRecipientAction | undefined {
  const a = activity.Action
  if (!a) return undefined
  if (a.Sign)
    return { kind: 'Sign', contact: a.Sign.ContactInformation ?? {}, group: a.Sign.SigningGroup }
  if (a.SignAsP7M)
    return {
      kind: 'SignAsP7M',
      contact: a.SignAsP7M.ContactInformation ?? {},
      group: a.SignAsP7M.SignAsP7MGroup,
    }
  if (a.View)
    return { kind: 'View', contact: a.View.ContactInformation ?? {}, group: a.View.ViewingGroup }
  if (a.SendCopy)
    return {
      kind: 'SendCopy',
      contact: a.SendCopy.ContactInformation ?? {},
      group: a.SendCopy.CopyingGroup,
    }
  return undefined
}

/** The activities of an envelope that address a recipient, in the order returned. */
export function recipientActivities(
  activities: RawNamirialEnvelopeActivity[] | undefined,
): RawNamirialEnvelopeActivity[] {
  return (activities ?? []).filter((a) => recipientAction(a) !== undefined)
}

/** Composite Signer id: activities are only readable through their envelope. */
export function signerId(envelopeId: string, activity: RawNamirialEnvelopeActivity): string {
  const activityId = pickStr(activity.Id)
  if (!activityId) throw new Error(`Namirial envelope ${envelopeId} has an activity without an Id`)
  return `${envelopeId}:${activityId}`
}

function mapRole(kind: NamirialRecipientKind): SignerRole {
  switch (kind) {
    case 'Sign':
    case 'SignAsP7M':
      return 'signer'
    case 'SendCopy':
      return 'cc'
    case 'View':
      // "An action to view and acknowledge the documents" — no canonical role.
      return 'unknown'
  }
}

function isSigning(kind: NamirialRecipientKind): boolean {
  return kind === 'Sign' || kind === 'SignAsP7M'
}

/** Activity `Status` enum: Pending, Completed, Rejected, Delegated. */
function mapStatus(activity: RawNamirialEnvelopeActivity, kind: NamirialRecipientKind): SignerStatus {
  switch (activity.Status) {
    case 'Completed':
      return isSigning(kind) ? 'signed' : 'unknown'
    case 'Rejected':
      return 'declined'
    case 'Pending':
      // OpenedDate: "The date when the action was accessed."
      return toIso(activity.OpenedDate) ? 'delivered' : 'unknown'
    default:
      return 'unknown'
  }
}

export function transformSigner(activity: RawNamirialEnvelopeActivity, envelopeId: string): Signer {
  const action = recipientAction(activity)
  if (!action) {
    throw new Error(`Namirial activity ${String(activity.Id)} addresses no recipient`)
  }
  const id = signerId(envelopeId, activity)
  const name = [pickStr(action.contact.GivenName), pickStr(action.contact.Surname)]
    .filter(Boolean)
    .join(' ')
  if (!name) {
    throw new Error(`Namirial activity ${String(activity.Id)} has no GivenName or Surname`)
  }
  const status = mapStatus(activity, action.kind)
  return {
    id,
    externalId: pickStr(activity.Id)!,
    envelopeId,
    email: pickStr(action.contact.Email),
    name,
    role: mapRole(action.kind),
    status,
    deliveredAt: toIso(activity.OpenedDate),
    signedAt: status === 'signed' ? toIso(activity.FinishedDate) : undefined,
    declinedAt: activity.Status === 'Rejected' ? toIso(activity.FinishedDate) : undefined,
    declineReason: activity.Status === 'Rejected' ? pickStr(activity.StatusReason) : undefined,
    platform: 'namirial',
    metadata: strMap({
      action: action.kind,
      activityStatus: activity.Status,
      group: action.group,
      languageCode: action.contact.LanguageCode,
    }),
    raw: activity,
  }
}
