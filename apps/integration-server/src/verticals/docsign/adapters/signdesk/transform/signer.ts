import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawSigndeskSignatory } from './envelope'

function mapRole(type: string | undefined): SignerRole {
  const t = (type ?? '').toLowerCase()
  if (t.includes('witness')) return 'witness'
  if (t.includes('cc') || t.includes('copy') || t.includes('receiver')) return 'cc'
  if (t.includes('approv')) return 'approver'
  if (t.includes('editor')) return 'editor'
  return 'signer'
}

function mapStatus(raw: RawSigndeskSignatory): SignerStatus {
  const s = (raw.signing_status ?? raw.status ?? '').toLowerCase()
  if (raw.signed_on || s.includes('signed') || s.includes('complete') || s.includes('executed'))
    return 'signed'
  if (raw.rejected_on || raw.declined_on || s.includes('reject') || s.includes('decline'))
    return 'declined'
  if (s.includes('deliver') || s.includes('view') || s.includes('open')) return 'delivered'
  if (s.includes('sent') || s.includes('pending') || s.includes('notified')) return 'sent'
  return 'created'
}

export function transformSigner(raw: RawSigndeskSignatory, envId: string, index: number): Signer {
  const id = pickStr(raw.signatory_id) ?? pickStr(raw.reference_id) ?? `${envId}:${index}`
  const sequence = raw.signing_sequence ?? raw.sequence
  return {
    id,
    externalId: id,
    envelopeId: envId,
    // SignDesk carries email and mobile separately. Surface an email-shaped
    // value when present; leave undefined for mobile-only signatories so
    // canonical validation is satisfied (email is optional).
    email: /@/.test(raw.email ?? '') ? String(raw.email) : undefined,
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.signatory_type),
    status: mapStatus(raw),
    routingOrder: typeof sequence === 'number' && sequence > 0 ? sequence : undefined,
    signedAt: toIso(raw.signed_on),
    declinedAt: toIso(raw.rejected_on ?? raw.declined_on),
    declineReason: pickStr(raw.rejection_reason ?? raw.decline_reason),
    platform: 'signdesk',
    metadata: strMap({
      mobile: raw.mobile,
      signatoryType: raw.signatory_type,
      signingStatus: raw.signing_status ?? raw.status,
    }),
    raw,
  }
}
