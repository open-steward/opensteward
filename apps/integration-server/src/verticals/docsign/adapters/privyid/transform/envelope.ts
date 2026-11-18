import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawPrivyRecipient } from './signer'

/**
 * A Privy document. In the docsign canon, a Privy *document* IS the
 * envelope: it carries its title, owner, recipients (Signers / Reviewers),
 * the uploaded file and the workflow status inline. Privy identifies a
 * document by its `docToken`.
 */
export interface RawPrivyDocument {
  docToken: string
  documentTitle?: string
  title?: string
  status?: string
  docType?: string
  /** The merchant/initiator who owns the document (a Privy id or email). */
  owner?: string
  ownerName?: string
  ownerEmail?: string
  channelId?: string
  recipients?: RawPrivyRecipient[]
  urlDocument?: string
  download?: string
  createDate?: string
  date?: string
  modifiedDate?: string
  updatedDate?: string
  completedDate?: string
  rejectedDate?: string
  cancelledDate?: string
  expireDate?: string
  expiredDate?: string
  reason?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('draft')) return 'draft'
  if (s.includes('complete') || s.includes('done') || s.includes('signed')) return 'completed'
  if (s.includes('reject') || s.includes('declin')) return 'declined'
  if (s.includes('cancel') || s.includes('void') || s.includes('revoke')) return 'voided'
  if (s.includes('expire')) return 'expired'
  if (s.includes('progress') || s.includes('pending') || s.includes('waiting')) return 'sent'
  return 'sent'
}

function recipientExternalId(r: RawPrivyRecipient): string {
  return r.privyId ?? r.enterpriseToken ?? r.recipientToken ?? r.email ?? ''
}

function signingOrder(raw: RawPrivyDocument): 'parallel' | 'sequential' {
  const seqs = (raw.recipients ?? [])
    .map((r) => Number(r.sequence ?? 0))
    .filter((n) => !Number.isNaN(n))
  if (seqs.length === 0) return 'parallel'
  return new Set(seqs).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawPrivyDocument): Envelope {
  const recipients = raw.recipients ?? []
  return {
    id: raw.docToken,
    externalId: raw.docToken,
    status: mapStatus(raw.status),
    subject: raw.documentTitle ?? raw.title ?? '',
    senderId: pickStr(raw.owner),
    senderEmail: pickStr(raw.ownerEmail),
    senderName: pickStr(raw.ownerName),
    signingOrder: signingOrder(raw),
    signerIds: recipients.map(recipientExternalId).filter((id) => id.length > 0),
    // A Privy document holds exactly one uploaded file, keyed by docToken.
    documentIds: [raw.docToken],
    createdAt: toIso(raw.createDate ?? raw.date),
    completedAt: toIso(raw.completedDate),
    declinedAt: toIso(raw.rejectedDate),
    voidedAt: toIso(raw.cancelledDate),
    expiresAt: toIso(raw.expireDate ?? raw.expiredDate),
    updatedAt: toIso(raw.modifiedDate ?? raw.updatedDate),
    platform: 'privyid',
    metadata: strMap({
      status: raw.status,
      docType: raw.docType,
      channelId: raw.channelId,
      reason: raw.reason,
    }),
    raw,
  }
}
