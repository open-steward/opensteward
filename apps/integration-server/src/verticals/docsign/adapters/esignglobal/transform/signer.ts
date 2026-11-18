import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'
import {
  signerExternalId,
  type RawEsignglobalEnvelope,
  type RawEsignglobalSigner,
} from './envelope'

/** A CC recipient on the envelope detail (`CCInfos[]`). */
export interface RawEsignglobalCc {
  userEmail?: string
  userName?: string
  [key: string]: unknown
}

/** eSignGlobal signerStatus: 0-Pending, 1-Signing, 2-Signed. */
function mapStatus(status: number | undefined): SignerStatus {
  switch (status) {
    case 0:
      return 'sent'
    case 1:
      return 'delivered'
    case 2:
      return 'signed'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawEsignglobalSigner,
  envelope: RawEsignglobalEnvelope,
): Signer {
  const envelopeId = envelope.envelopeId
  const order = pickNum(raw.signOrder)
  const declined = pickStr(raw.rejectedReason)
  const id = signerExternalId(envelopeId, raw)
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.userEmail) ?? '',
    name: pickStr(raw.userName) ?? '',
    role: 'signer' as SignerRole,
    status: declined ? 'declined' : mapStatus(raw.signerStatus),
    routingOrder: order != null && order >= 1 ? order : undefined,
    signedAt: toIso(raw.signDate),
    declineReason: declined,
    platform: 'esignglobal',
    metadata: strMap({
      businessId: raw.businessId,
      digitalSignature: raw.digitalSignature,
      signerStatus: raw.signerStatus,
      phoneCountryCode: raw.phoneNumber?.countryCode,
      phoneNumber: raw.phoneNumber?.number,
    }),
    raw,
  }
}

/** Carbon-copy recipients are read-only watchers; map them to the `cc` role. */
export function transformCcSigner(
  raw: RawEsignglobalCc,
  envelope: RawEsignglobalEnvelope,
  index: number,
): Signer {
  const envelopeId = envelope.envelopeId
  const who = raw.userEmail || raw.userName || `cc-${index}`
  const id = `${envelopeId}:cc:${who}`
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.userEmail) ?? '',
    name: pickStr(raw.userName) ?? '',
    role: 'cc' as SignerRole,
    status: 'created',
    platform: 'esignglobal',
    metadata: {},
    raw,
  }
}
