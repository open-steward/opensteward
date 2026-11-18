/**
 * Foxit eSign recipient party → canonical Signer.
 *
 * Source: `folder.folderRecipientParties` of "Get Envelope Details",
 * GET /folders/myfolder (Foxit eSign OpenAPI example, served by
 * https://developers.foxitesign.foxit.com/). A documented party:
 *
 *   { "partyId": 28,
 *     "partyDetails": { "partyId": 28, "firstName": "Jane", "lastName": "Doe",
 *       "emailId": "janedoe@esigngenie.com", "address": "", "dateCreated": 1404837216000 },
 *     "contractPermissions": "FILL_FIELDS_AND_SIGN", "partySequence": 2,
 *     "workflowSignSequence": 2, "envelopeId": 86377, "sharingMode": "email",
 *     "folderAccessURL": null, "securityMode": "none", "extraComments": null }
 *
 * The party object has no status. It is read from the same response's
 * `Folder History`: a `Signed` row whose `changeDoneByParty` is this party
 * makes it signed, an `InviteAccepted` row makes it delivered. With neither,
 * the status is `unknown` rather than a guessed default.
 */
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { historyTime, type RawFoxitESignFolderHistoryEntry } from './audit-trail-entry'
import { strMap } from './shared'

export interface RawFoxitESignParty {
  partyId: number
  partyDetails?: {
    partyId?: number | null
    firstName?: string | null
    lastName?: string | null
    emailId?: string | null
    address?: string | null
    dateCreated?: number | null
  } | null
  contractPermissions?: string | null
  partySequence?: number | null
  workflowSignSequence?: number | null
  envelopeId?: number | null
  sharingMode?: string | null
  folderAccessURL?: string | null
  securityMode?: string | null
  extraComments?: string | null
}

/**
 * The OpenAPI's `permissions` schema documents five values,
 * `"enum":["FILL_FIELDS_AND_SIGN","FILL_FIELDS_ONLY","SIGN_ONLY","VIEW_ONLY","PARTY_ASSIGNER"]`,
 * each with an empty description. Only the two whose name says the party
 * signs map to `signer`; the docs give no meaning for the rest, so they
 * stay `unknown` rather than being guessed as cc/editor.
 */
const SIGNING_PERMISSIONS: ReadonlySet<string> = new Set(['FILL_FIELDS_AND_SIGN', 'SIGN_ONLY'])

function mapRole(permission: string | null | undefined): SignerRole {
  return typeof permission === 'string' && SIGNING_PERMISSIONS.has(permission)
    ? 'signer'
    : 'unknown'
}

function nonEmpty(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformSigner(
  raw: RawFoxitESignParty,
  envelopeId: string,
  history: readonly RawFoxitESignFolderHistoryEntry[],
): Signer {
  if (typeof raw.partyId !== 'number') {
    throw new Error('Foxit eSign recipient party has no partyId')
  }
  const externalId = String(raw.partyId)
  const own = history.filter((h) => h.changeDoneByParty === raw.partyId)
  const signed = own.filter((h) => h.action === 'Signed').at(-1)
  const accepted = own.find((h) => h.action === 'InviteAccepted')
  const status: SignerStatus = signed ? 'signed' : accepted ? 'delivered' : 'unknown'

  const details = raw.partyDetails ?? {}
  const name = [nonEmpty(details.firstName), nonEmpty(details.lastName)]
    .filter((p): p is string => p !== undefined)
    .join(' ')
  const order = raw.workflowSignSequence
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: nonEmpty(details.emailId),
    name,
    role: mapRole(raw.contractPermissions),
    status,
    routingOrder:
      typeof order === 'number' && Number.isInteger(order) && order >= 1 ? order : undefined,
    deliveredAt: accepted ? historyTime(accepted) : undefined,
    signedAt: signed ? historyTime(signed) : undefined,
    platform: 'foxit-esign',
    metadata: strMap({
      contractPermissions: raw.contractPermissions,
      partySequence: raw.partySequence,
      sharingMode: raw.sharingMode,
      securityMode: raw.securityMode,
    }),
    raw,
  }
}
