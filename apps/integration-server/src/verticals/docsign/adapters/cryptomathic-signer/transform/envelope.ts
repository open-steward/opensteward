import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso, rdn } from './shared'

/**
 * CSC `credentialInfo` Object (credentials/list) and the equivalent
 * credentials/info response. A Cryptomathic Signer signing *credential* is the
 * addressable unit of the CSC API, so it maps to the canonical `Envelope`:
 * the credential is the container whose certificate carries the owner identity
 * (→ Signer) and whose status/validity govern whether it can be used to sign.
 */
export interface RawCscCredentialInfo {
  credentialID?: string
  description?: string
  signatureQualifier?: string
  key?: {
    status?: string // enabled | disabled
    algo?: string[]
    len?: number
    curve?: string
  }
  cert?: {
    status?: string // valid | expired | revoked | suspended
    certificates?: string[]
    issuerDN?: string
    serialNumber?: string
    subjectDN?: string
    validFrom?: string // GeneralizedTime YYYYMMDDHHMMSSZ
    validTo?: string // GeneralizedTime YYYYMMDDHHMMSSZ
  }
  auth?: {
    mode?: string // explicit | oauth2code
    expression?: string
    objects?: unknown
  }
  SCAL?: string // "1" | "2"
  multisign?: number
  lang?: string
  [key: string]: unknown
}

/**
 * Map the credential key/cert lifecycle onto the canonical envelope status.
 * A usable credential (key enabled + cert valid) is `sent` (active/in-force);
 * an unusable one is mapped to the closest terminal canonical state.
 */
function mapStatus(raw: RawCscCredentialInfo): EnvelopeStatus {
  const key = (raw.key?.status ?? '').toLowerCase()
  const cert = (raw.cert?.status ?? '').toLowerCase()
  if (cert === 'revoked' || key === 'disabled') return 'voided'
  if (cert === 'expired') return 'expired'
  if (cert === 'suspended') return 'declined'
  if (key === 'enabled' && (cert === 'valid' || cert === '')) return 'sent'
  return 'draft'
}

export function transformEnvelope(raw: RawCscCredentialInfo): Envelope {
  const credentialID = pickStr(raw.credentialID) ?? ''
  const subjectCn = rdn(raw.cert?.subjectDN, 'CN')
  const subject =
    pickStr(raw.description) ??
    subjectCn ??
    pickStr(raw.cert?.subjectDN) ??
    (credentialID ? `Credential ${credentialID}` : 'Signing credential')
  return {
    id: credentialID,
    externalId: credentialID,
    status: mapStatus(raw),
    subject,
    // The credential owner is the single signer associated with the credential.
    signingOrder: 'parallel',
    signerIds: credentialID ? [credentialID] : [],
    documentIds: [],
    createdAt: toIso(raw.cert?.validFrom),
    expiresAt: toIso(raw.cert?.validTo),
    platform: 'cryptomathic-signer',
    metadata: strMap({
      signatureQualifier: raw.signatureQualifier,
      keyStatus: raw.key?.status,
      keyLength: raw.key?.len,
      keyAlgo: raw.key?.algo?.join(','),
      certStatus: raw.cert?.status,
      certSerialNumber: raw.cert?.serialNumber,
      issuerDN: raw.cert?.issuerDN,
      authMode: raw.auth?.mode,
      scal: raw.SCAL,
      multisign: raw.multisign,
      lang: raw.lang,
    }),
    raw,
  }
}
