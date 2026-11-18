import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawSignzySigner } from './envelope'

function mapStatus(raw: RawSignzySigner): SignerStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'success' || s === 'signed' || s === 'completed') return 'signed'
  if (s === 'fail' || s === 'failed') {
    // A failed signer with at least one failure attempt and no success is a
    // declined/failed signing; Signzy has no dedicated "declined" status.
    return 'declined'
  }
  if (s === 'pending') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawSignzySigner, envelopeId: string): Signer {
  const externalId = pickStr(raw.signerid) ?? `${envelopeId}:unknown`
  return {
    id: externalId,
    externalId,
    envelopeId,
    // Signzy's pull-contract response does not echo signer email/mobile (those
    // are only supplied on initiate). Email is unavailable here; emit undefined.
    email: undefined,
    name: pickStr(raw.signername) ?? '',
    // Signzy contracts have a single signer role (eSign recipient); CC /
    // witness / approver distinctions are not part of the model.
    role: 'signer',
    status: mapStatus(raw),
    signedAt: toIso(raw.contractlastsigntime),
    declineReason: pickStr(raw.errormessage),
    platform: 'signzy',
    metadata: strMap({
      signaturetype: raw.signaturetype,
      contractstatus: raw.status,
      signerip: raw.signerip,
      noofsuccessfulattempts: raw.noofsuccessfulattempts,
      nooffailureattempts: raw.nooffailureattempts,
      aadhaarstatus: raw.aadhaarstatus,
    }),
    raw,
  }
}
