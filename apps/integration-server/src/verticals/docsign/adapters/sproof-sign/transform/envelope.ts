import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { fullName, ownerMemberId, pickStr, strMap, toIso, type RawSproofDocument } from './shared'

export type { RawSproofDocument } from './shared'

/** `_Document.state`: "draft, pending, declined, completed, attachment, manuallyPending, manuallyCompleted". */
function mapStatus(state: string | undefined): EnvelopeStatus {
  switch (state) {
    case 'draft':
      return 'draft'
    case 'pending':
    case 'manuallyPending':
      return 'sent'
    case 'declined':
      return 'declined'
    case 'completed':
    case 'manuallyCompleted':
      return 'completed'
    default:
      return 'unknown'
  }
}

/**
 * One sproof `_Document` → one canonical Envelope, keyed by the owner's
 * member id (see `ownerMemberId`). Signer ids are `<envelopeId>:<member.id>`,
 * the document id `<envelopeId>:<document id>`, as `getSigner` / `getDocument`
 * read them back.
 *
 * Signing order: "Recipients with the same order value will be invited to
 * sign simultaneously" (spec, Signature Placeholders → signing_order), so one
 * distinct `signingOrder` across members is parallel, more is sequential.
 */
export function transformEnvelope(raw: RawSproofDocument): Envelope {
  const id = ownerMemberId(raw)
  const members = raw.members ?? []
  const orders = new Set(
    members.map((m) => m.signingOrder).filter((o): o is number => typeof o === 'number'),
  )
  const documentId = pickStr(raw.id)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.state),
    subject: pickStr(raw.name) ?? '',
    senderId: pickStr(raw.member?.id),
    senderEmail: pickStr(raw.member?.email),
    senderName: fullName(raw.member),
    signingOrder: orders.size > 1 ? 'sequential' : 'parallel',
    signerIds: members
      .map((m) => pickStr(m.id))
      .filter((m): m is string => !!m)
      .map((m) => `${id}:${m}`),
    documentIds: documentId ? [`${id}:${documentId}`] : [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'sproof-sign',
    metadata: strMap({
      documentId,
      refId: raw.refId,
      state: raw.state,
      signingRound: raw.signingRound,
      allSignersSigned: raw.allSignersSigned,
      allMembersSigned: raw.allMembersSigned,
    }),
    raw,
  }
}
