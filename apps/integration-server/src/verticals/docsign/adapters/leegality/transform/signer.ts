import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import { inviteeId, type RawLeegalityInvitee } from './envelope'

function mapStatus(raw: RawLeegalityInvitee): SignerStatus {
  if (raw.signed) return 'signed'
  if (raw.rejected) return 'declined'
  // Leegality has no explicit "expired" signer status in the canonical
  // enum; an expired-but-not-signed invitee is still surfaced as `sent`.
  if (raw.active) return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawLeegalityInvitee,
  envelopeId: string,
  index: number,
): Signer {
  const id = inviteeId(raw, envelopeId, index)
  return {
    id,
    externalId: id,
    envelopeId,
    // Leegality invitees carry email and/or phone; the canonical schema
    // validates email when present. Surface a valid email when supplied,
    // else undefined (phone-only invitees have no email).
    email: /@/.test(raw.email ?? '') ? String(raw.email) : undefined,
    name: pickStr(raw.name) ?? '',
    // Leegality invitees on the document payload are all signers; CC
    // recipients are a separate `cc` array that this surface does not read.
    role: 'signer',
    status: mapStatus(raw),
    signedAt: toIso(raw.signDate),
    platform: 'leegality',
    metadata: strMap({
      phone: raw.phone,
      signUrl: raw.signUrl,
      signType: raw.signType,
      active: raw.active,
      expired: raw.expired,
      expiryDate: raw.expiryDate,
    }),
    raw,
  }
}
