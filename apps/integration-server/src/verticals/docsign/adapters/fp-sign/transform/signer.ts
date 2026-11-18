import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * FP Sign `Job` — a single recipient's signing task within a workflow. The
 * recipient identity sits on `owner` (an AccountInfo). FP Sign jobs are always
 * signer-role tasks; there is no CC/witness distinction on the wire.
 */
export interface RawFpSignJob {
  id?: number | string
  status?: string
  workflowId?: number | string
  reason?: string
  signerIp?: string
  name?: string
  privateMessage?: string
  dateCreated?: string
  dateSigned?: string
  dateRejected?: string
  owner?: {
    id?: number | string
    email?: string
    user?: { id?: number | string; profile?: { firstname?: string; lastname?: string } }
  }
  signatureSetting?: { name?: string; signatureType?: string; authentication?: string }
  // Visual signature presets / signature images are biometric — never reflect.
  [key: string]: unknown
}

/** FP Sign job processing states → canonical signer status. */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'created':
      return 'created'
    case 'waiting_for_input':
    case 'waiting_for_external_tan':
    case 'suspended':
      return 'sent'
    case 'processing':
      return 'delivered'
    case 'finished':
      return 'signed'
    case 'rejected':
      return 'declined'
    case 'cancelled':
    case 'dismissed':
    case 'failed':
      return 'auto_responded'
    default:
      return 'created'
  }
}

function signerName(raw: RawFpSignJob): string {
  const profile = raw.owner?.user?.profile
  const name = [profile?.firstname, profile?.lastname].filter(Boolean).join(' ')
  return name || pickStr(raw.name) || ''
}

export function transformSigner(raw: RawFpSignJob, envelopeId: string): Signer {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.owner?.email) ?? '',
    name: signerName(raw),
    // FP Sign jobs are signature tasks; no carbon-copy / witness roles exist.
    role: 'signer',
    status: mapStatus(raw.status),
    sentAt: toIso(raw.dateCreated),
    signedAt: toIso(raw.dateSigned),
    declinedAt: toIso(raw.dateRejected),
    declineReason: pickStr(raw.reason),
    platform: 'fp-sign',
    metadata: strMap({
      signerIp: raw.signerIp,
      signatureSetting: raw.signatureSetting?.name,
      signatureType: raw.signatureSetting?.signatureType,
      authentication: raw.signatureSetting?.authentication,
    }),
    raw,
  }
}
