/**
 * Concord agreement -> canonical Envelope.
 *
 * Two documented shapes (https://api.doc.concordnow.com/concord-openapi-bundled.yaml):
 *   - AgreementListItemDto, one row of ListAgreements
 *     (GET /user/me/organizations/{organizationId}/agreements);
 *   - GetAgreementresponse, from GetAgreement
 *     (GET /organizations/{organizationId}/agreements/{agreementUid}).
 *
 * Neither carries signers or signing order: those live in SignatureGet,
 * GET .../agreements/{agreementUid}/signature, whose SignatureMetadataGet has
 * `enforceOrder` ("If true, will force signers to respect the signing order.")
 * and the signature `slots`. Every transform here therefore also takes that
 * reply: signingOrder is 'sequential' when enforceOrder is true and 'parallel'
 * when it is false, and a reply without a boolean enforceOrder throws rather
 * than guess. signerIds are the ids of the slots listSigners returns, in slot
 * order.
 *
 * documentIds stays [] (it is not read from /attachments) so that an envelope
 * row costs one extra request rather than two; listDocuments is the
 * documented read of an envelope's attachments.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { SigningOrder } from '../../../schema/shared'
import { msToIso, requireStr, strMap } from './shared'
import { signatureSlots, slotNamesSigner, type RawConcordSignatureMetadata } from './signer'

/** AgreementListItemDto: only the fields this transform reads. */
export interface RawConcordAgreementListItem {
  uuid: string
  title: string
  status: string
  createdAt?: number
  createdBy?: number
  createdByName?: string
  description?: string
  documentType?: string
  modifiedAt?: number
  organizationId?: number
  folderId?: number
  signatureDate?: number
  endDate?: number
  signatureProvider?: string
  [key: string]: unknown
}

/** GetAgreementresponse: only the fields this transform reads. */
export interface RawConcordAgreement {
  uid: string
  folderId?: string
  metadata: {
    organization?: { id?: number; name?: string }
    title: string
    description?: string
    status: string
    trashed?: boolean
    [key: string]: unknown
  }
  creation?: {
    date?: number
    creator?: {
      user?: { id?: number; name?: string; email?: string }
      organization?: { id?: number; name?: string }
    }
  }
  [key: string]: unknown
}

/**
 * ContractLibraryStatusEnum, by the stage each value is documented as:
 *   DRAFT "Draft, Agreement private to one user."
 *   VALIDATION / NEGOTIATION "Review" - not yet out for signature
 *   SIGNING "Signing, Agreement currently waiting for signatures."
 *   *_CONTRACT "Signed, ..."
 *   BROKEN "Canceled, Agreement canceled during review."
 * TRASHED, NEGO_INVITE and the TEMPLATE stages are not envelope stages.
 */
export function mapAgreementStatus(status: string): EnvelopeStatus {
  switch (status) {
    case 'DRAFT':
    case 'VALIDATION':
    case 'NEGOTIATION':
      return 'draft'
    case 'SIGNING':
      return 'sent'
    case 'UNKNOWN_CONTRACT':
    case 'FUTURE_CONTRACT':
    case 'CURRENT_CONTRACT':
    case 'COMPLETED_CONTRACT':
    case 'COMPLETED_CANCEL_CONTRACT':
    case 'COMPLETED_CONTRACT_RENEWABLE':
      return 'completed'
    case 'BROKEN':
      return 'voided'
    default:
      return 'unknown'
  }
}

interface Signing {
  signingOrder: SigningOrder
  signerIds: string[]
}

/** signingOrder and signerIds, from the agreement's SignatureMetadataGet reply. */
export function signingFromSignature(
  signature: RawConcordSignatureMetadata,
  agreementId: string,
): Signing {
  const slots = signatureSlots(signature, agreementId)
  if (typeof signature.enforceOrder !== 'boolean') {
    throw new Error(`concord SignatureGet on ${agreementId} has no enforceOrder`)
  }
  return {
    signingOrder: signature.enforceOrder ? 'sequential' : 'parallel',
    signerIds: slots.filter(slotNamesSigner).map((s) => String(s.id)),
  }
}

export function transformEnvelope(
  raw: RawConcordAgreementListItem,
  signature: RawConcordSignatureMetadata,
): Envelope {
  const id = requireStr(raw.uuid, 'agreement uuid')
  const status = requireStr(raw.status, `agreement ${id} status`)
  const signing = signingFromSignature(signature, id)
  return {
    id,
    externalId: id,
    status: mapAgreementStatus(status),
    subject: requireStr(raw.title, `agreement ${id} title`),
    senderId: typeof raw.createdBy === 'number' ? String(raw.createdBy) : undefined,
    senderName: raw.createdByName || undefined,
    signingOrder: signing.signingOrder,
    signerIds: signing.signerIds,
    documentIds: [],
    createdAt: msToIso(raw.createdAt),
    updatedAt: msToIso(raw.modifiedAt),
    platform: 'concord',
    metadata: strMap({
      concordStatus: status,
      description: raw.description,
      documentType: raw.documentType,
      organizationId: raw.organizationId,
      folderId: raw.folderId,
      signatureDate: msToIso(raw.signatureDate),
      endDate: msToIso(raw.endDate),
      signatureProvider: raw.signatureProvider,
    }),
    raw,
  }
}

export function transformAgreement(
  raw: RawConcordAgreement,
  signature: RawConcordSignatureMetadata,
): Envelope {
  const id = requireStr(raw.uid, 'agreement uid')
  const meta = raw.metadata
  if (!meta || typeof meta !== 'object') throw new Error(`concord agreement ${id} has no metadata`)
  const status = requireStr(meta.status, `agreement ${id} status`)
  const signing = signingFromSignature(signature, id)
  const user = raw.creation?.creator?.user
  return {
    id,
    externalId: id,
    status: mapAgreementStatus(status),
    subject: requireStr(meta.title, `agreement ${id} title`),
    senderId: typeof user?.id === 'number' ? String(user.id) : undefined,
    senderEmail: user?.email || undefined,
    senderName: user?.name || undefined,
    signingOrder: signing.signingOrder,
    signerIds: signing.signerIds,
    documentIds: [],
    createdAt: msToIso(raw.creation?.date),
    platform: 'concord',
    metadata: strMap({
      concordStatus: status,
      description: meta.description,
      organizationId: meta.organization?.id,
      folderId: raw.folderId,
      trashed: meta.trashed,
    }),
    raw,
  }
}
