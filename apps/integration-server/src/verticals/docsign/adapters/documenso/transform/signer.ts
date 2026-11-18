import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { idStr, pickStr, strMap, toIso } from './shared'

/**
 * A Documenso v1 recipient. Recipients carry three independent status fields:
 * readStatus (NOT_OPENED|OPENED), signingStatus (NOT_SIGNED|SIGNED|REJECTED),
 * and sendStatus (NOT_SENT|SENT). We collapse them into one canonical status.
 */
export interface RawDocumensoRecipient {
  id: number
  documentId?: number | null
  email: string
  name?: string
  role?: string
  signingOrder?: number | null
  token?: string
  expiresAt?: string | null
  signedAt?: string | null
  readStatus?: string
  signingStatus?: string
  sendStatus?: string
  signingUrl?: string
  [key: string]: unknown
}

/** Map Documenso RecipientRole → canonical SignerRole. */
function mapRole(role: string | undefined): SignerRole {
  switch ((role ?? '').toUpperCase()) {
    case 'SIGNER':
      return 'signer'
    case 'CC':
      return 'cc'
    case 'VIEWER':
      return 'cc'
    case 'APPROVER':
      return 'approver'
    case 'ASSISTANT':
      return 'editor'
    default:
      return 'signer'
  }
}

/**
 * Collapse Documenso's three status fields into the canonical SignerStatus,
 * most-progressed-wins: signed/declined > delivered (opened) > sent > created.
 */
function mapStatus(raw: RawDocumensoRecipient): SignerStatus {
  const signing = (raw.signingStatus ?? '').toUpperCase()
  if (signing === 'SIGNED') return 'signed'
  if (signing === 'REJECTED') return 'declined'
  const read = (raw.readStatus ?? '').toUpperCase()
  if (read === 'OPENED') return 'delivered'
  const send = (raw.sendStatus ?? '').toUpperCase()
  if (send === 'SENT') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawDocumensoRecipient,
  envelopeId: string,
): Signer {
  const declined = (raw.signingStatus ?? '').toUpperCase() === 'REJECTED'
  return {
    id: idStr(raw.id),
    externalId: idStr(raw.id),
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    status: mapStatus(raw),
    // Documenso signingOrder is 1-indexed and only meaningful for sequential.
    routingOrder:
      typeof raw.signingOrder === 'number' && raw.signingOrder >= 1
        ? raw.signingOrder
        : undefined,
    sentAt: undefined,
    deliveredAt: undefined,
    signedAt: declined ? undefined : toIso(raw.signedAt),
    declinedAt: declined ? toIso(raw.signedAt) : undefined,
    declineReason: undefined,
    platform: 'documenso',
    metadata: strMap({
      role: raw.role,
      readStatus: raw.readStatus,
      signingStatus: raw.signingStatus,
      sendStatus: raw.sendStatus,
      expiresAt: raw.expiresAt,
    }),
    raw,
  }
}
