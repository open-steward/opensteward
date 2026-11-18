import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { epochToIso, pickStr, strMap } from './shared'
import { signerExternalId, type RawBoldsignSignerDetail } from './envelope'

function mapRole(signerType: string | undefined): SignerRole {
  const t = (signerType ?? '').toLowerCase()
  if (t === 'cc') return 'cc'
  if (t === 'inpersonsigner' || t === 'inperson') return 'in_person_signer'
  if (t === 'reviewer' || t === 'approver') return 'approver'
  if (t === 'editor' || t === 'preparer') return 'editor'
  return 'signer'
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'completed' || lower === 'signed') return 'signed'
  if (lower === 'declined') return 'declined'
  if (lower === 'viewed' || lower === 'delivered') return 'delivered'
  if (lower === 'notcompleted' || lower === 'waitingforsign' || lower === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawBoldsignSignerDetail,
  documentId: string,
): Signer {
  const externalId = signerExternalId(documentId, raw)
  return {
    id: externalId,
    externalId,
    envelopeId: documentId,
    email: pickStr(raw.signerEmail) ?? '',
    name: pickStr(raw.signerName) ?? '',
    role: mapRole(raw.signerType),
    status: mapStatus(raw.status),
    routingOrder: typeof raw.order === 'number' && raw.order >= 1 ? raw.order : undefined,
    signedAt: epochToIso(raw.signedDate),
    declineReason: pickStr(raw.declineMessage),
    platform: 'boldsign',
    metadata: strMap({
      signerRole: raw.signerRole,
      signerType: raw.signerType,
      authenticationType: raw.authenticationType,
      isViewed: raw.isViewed,
      isReassigned: raw.isReassigned,
    }),
    raw,
  }
}
