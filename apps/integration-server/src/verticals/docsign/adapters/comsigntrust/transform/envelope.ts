import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, weSignDate } from './shared'
import { redactSigner, signerId, type RawWeSignSigner } from './signer'
import { documentId } from './document'

/**
 * `DocumentCollectionResposneDTO` from the WeSign v3 OpenAPI
 * (https://wse.comsigntrust.com/api/swagger/v3/swagger.json): the element of
 * `GET /v3/DocumentCollections` → `documentCollections[]`, and the body of
 * `GET /v3/DocumentCollections/info/{id}`. A document collection is WeSign's
 * envelope: documents plus the signers routed to sign them.
 */
export interface RawWeSignDocumentCollection {
  documentCollectionId?: string
  distributionId?: string
  name?: string | null
  documentStatus?: number
  mode?: number
  documentsIds?: string[] | null
  signers?: RawWeSignSigner[] | null
  creationTime?: string
  signedTime?: string
  user?: { id?: string; name?: string | null; email?: string | null; [key: string]: unknown }
  [key: string]: unknown
}

/** `AllDocumentCollectionsResposneDTO`, the body of `GET /v3/DocumentCollections`. */
export interface RawWeSignDocumentCollectionList {
  documentCollections?: RawWeSignDocumentCollection[] | null
}

/**
 * The list endpoint's description:
 *   "DocumentStatus: Draft = 0, Created = 1, Sent = 2, Viewed = 3, Signed = 4,
 *    Declined = 5, SendingFailed = 6, Deleted = 7, Canceled = 8, ExtraServerSigned = 9"
 * SendingFailed and Deleted have no canonical counterpart.
 */
function mapStatus(s: number | undefined): EnvelopeStatus {
  switch (s) {
    case 0:
    case 1:
      return 'draft'
    case 2:
      return 'sent'
    case 3:
      return 'delivered'
    case 4:
    case 9:
      return 'completed'
    case 5:
      return 'declined'
    case 8:
      return 'voided'
    default:
      return 'unknown'
  }
}

/** "Mode: OrderedGroupSign = 1, GroupSign = 2, Online = 3, PublicTemplateLink = 4, SelfSign = 100" */
const ORDERED_GROUP_SIGN = 1

export function transformEnvelope(raw: RawWeSignDocumentCollection): Envelope {
  const id = pickStr(raw.documentCollectionId)
  if (!id) throw new Error('WeSign document collection has no documentCollectionId')
  const status = mapStatus(raw.documentStatus)
  const { signers, user, ...rest } = raw
  return {
    id,
    externalId: id,
    status,
    // `name` is nullable in the spec; an unnamed collection has no subject.
    subject: pickStr(raw.name) ?? '',
    senderId: pickStr(user?.id),
    senderEmail: pickStr(user?.email),
    senderName: pickStr(user?.name),
    signingOrder: raw.mode === ORDERED_GROUP_SIGN ? 'sequential' : 'parallel',
    signerIds: (signers ?? []).flatMap((s) => {
      const sid = pickStr(s.id)
      return sid ? [signerId(id, sid)] : []
    }),
    documentIds: (raw.documentsIds ?? []).map((d) => documentId(id, d)),
    createdAt: weSignDate(raw.creationTime),
    completedAt: status === 'completed' ? weSignDate(raw.signedTime) : undefined,
    platform: 'comsigntrust',
    metadata: strMap({
      documentStatus: raw.documentStatus,
      mode: raw.mode,
      distributionId: raw.distributionId,
    }),
    raw: {
      ...rest,
      user: user ? { id: user.id, name: user.name, email: user.email } : undefined,
      signers: signers?.map(redactSigner),
    },
  }
}
