import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'
import type { RawSigniFlowWorkStep } from './envelope'
import { workStepId } from './envelope'

/**
 * A SigniFlow workstep is a single participant in a document's workflow. Its
 * `Action` (SignDocument / ViewDocument / ApproveDocument) maps to the
 * canonical role; the per-step status + timestamps map to the Signer.
 */
function mapRole(action: string | undefined): SignerRole {
  const a = (action ?? '').toLowerCase()
  if (a.includes('approve')) return 'approver'
  if (a.includes('view') || a.includes('cc') || a.includes('copy')) return 'cc'
  if (a.includes('edit')) return 'editor'
  if (a.includes('witness')) return 'witness'
  return 'signer'
}

function mapStatus(raw: string | undefined): SignerStatus {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('signed') || s.includes('complet') || s.includes('approv') || s.includes('done'))
    return 'signed'
  if (s.includes('declin') || s.includes('reject')) return 'declined'
  if (s.includes('view') || s.includes('open') || s.includes('deliver')) return 'delivered'
  if (s.includes('sent') || s.includes('action') || s.includes('pending') || s.includes('progress'))
    return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawSigniFlowWorkStep,
  envelopeId: string,
  index: number,
): Signer {
  const id = workStepId(raw, envelopeId, index)
  const orderRaw = pickNum(raw.WorkStepNumber ?? raw.StepOrder)
  const routingOrder =
    orderRaw != null && orderRaw >= 1 ? orderRaw : index + 1
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.EmailAddress ?? raw.Email) ?? '',
    name:
      pickStr(raw.FullName) ??
      [raw.FirstName, raw.LastName].filter(Boolean).join(' ').trim() ??
      '',
    role: mapRole(raw.Action),
    status: mapStatus(raw.WorkStepStatus ?? raw.Status),
    routingOrder,
    sentAt: toIso(raw.DateSent),
    deliveredAt: toIso(raw.DateViewed),
    signedAt: toIso(raw.DateSigned ?? raw.SignedDate),
    declineReason: pickStr(raw.DeclineReason),
    platform: 'signiflow',
    metadata: strMap({
      action: raw.Action,
      signatureType: raw.SignatureType,
      signReason: raw.SignReason,
      mobileNumber: raw.MobileNumber,
    }),
    raw,
  }
}
