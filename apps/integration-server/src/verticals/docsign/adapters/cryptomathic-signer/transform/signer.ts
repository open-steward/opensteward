import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, rdn } from './shared'
import type { RawCscCredentialInfo } from './envelope'

/**
 * A Cryptomathic Signer credential is owned by exactly one signer — the
 * subject of the credential's X.509v3 end-entity certificate. CSC certificates
 * carry an X.500 Distinguished Name, not an e-mail address (signer consent is
 * driven by Signer's own authentication ceremony, not by e-mail), so we derive
 * the name from the subject DN's CN and synthesise a syntactically-valid
 * placeholder e-mail on the RFC 2606 `.invalid` TLD. The real identifiers are
 * surfaced under `metadata`.
 *
 * We never reflect the signing key, certificate bytes, or any biometric /
 * Signature Activation Data — only certificate-subject metadata.
 */

function mapStatus(raw: RawCscCredentialInfo): SignerStatus {
  const key = (raw.key?.status ?? '').toLowerCase()
  const cert = (raw.cert?.status ?? '').toLowerCase()
  // A usable credential means the owner is provisioned and able to sign.
  if (key === 'enabled' && (cert === 'valid' || cert === '')) return 'created'
  // A disabled key / revoked-suspended cert reads as a declined enrolment.
  if (cert === 'revoked' || cert === 'suspended' || key === 'disabled') return 'declined'
  return 'created'
}

export function transformSigner(raw: RawCscCredentialInfo, envelopeId: string): Signer {
  const subjectDN = pickStr(raw.cert?.subjectDN)
  const cn = rdn(subjectDN, 'CN')
  const externalId = envelopeId
  const name = cn ?? subjectDN ?? (envelopeId ? `Owner of ${envelopeId}` : '')
  // Placeholder e-mail (RFC 2606 `.invalid` TLD) — CSC supplies no signer e-mail.
  const localPart = (pickStr(raw.cert?.serialNumber) ?? envelopeId).replace(/[^a-zA-Z0-9._-]/g, '_') || 'owner'
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: `${localPart}@cryptomathic-signer.invalid`,
    name: name || externalId,
    role: 'signer',
    status: mapStatus(raw),
    platform: 'cryptomathic-signer',
    metadata: strMap({
      subjectDN,
      commonName: cn,
      issuerDN: raw.cert?.issuerDN,
      certSerialNumber: raw.cert?.serialNumber,
      certStatus: raw.cert?.status,
      authMode: raw.auth?.mode,
      authExpression: raw.auth?.expression,
      scal: raw.SCAL,
    }),
    raw,
  }
}
