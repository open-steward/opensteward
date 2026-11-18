import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Webdox CLM "decision workflow" — the multi-step process that drives a
 * contract toward signature. Maps to the canonical Envelope. Signers live on
 * the signature steps; documents are attached to the workflow.
 */
export interface RawWebdoxWorkflow {
  id: number | string
  name?: string
  decision_name?: string
  status?: string
  current_step_type?: string
  template_id?: number | string
  template?: { id?: number | string }
  requester_id?: number | string
  requester_email?: string
  requester_name?: string
  created_at?: string
  updated_at?: string
  signed_at?: string
  completed_at?: string
  canceled_at?: string
  cancelled_at?: string
  cancel_reason?: string
  limit_date?: string
  steps?: RawWebdoxStep[]
  documents?: Array<{ id: number | string }>
  [key: string]: unknown
}

interface RawWebdoxStep {
  id_number?: number | string
  id_parallel?: number | string
  step_type?: string | null
  is_signature_step?: boolean
  signers?: Array<{ id?: number | string }>
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft' || s === 'created' || s === 'pending') return 'draft'
  if (s === 'started' || s === 'in_progress' || s === 'running' || s === 'sent') return 'sent'
  if (s === 'completed' || s === 'finished' || s === 'signed' || s === 'closed') return 'completed'
  if (s === 'rejected' || s === 'declined') return 'declined'
  if (s === 'canceled' || s === 'cancelled' || s === 'voided') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

/** Ordered signer ids gathered from the workflow's signature steps. */
function workflowSignerIds(raw: RawWebdoxWorkflow): string[] {
  const out: Array<{ id: string; order: number }> = []
  for (const step of raw.steps ?? []) {
    const order = Number(step.id_number ?? 0)
    for (const signer of step.signers ?? []) {
      if (signer.id != null) out.push({ id: String(signer.id), order })
    }
  }
  return out.sort((a, b) => a.order - b.order).map((s) => s.id)
}

/**
 * Webdox steps run sequentially by `id_number`; steps sharing an `id_parallel`
 * group run together. If any signature step has signers spread across more
 * than one step number, signing is sequential; otherwise parallel.
 */
function signingOrder(raw: RawWebdoxWorkflow): 'parallel' | 'sequential' {
  const stepNumbers = new Set<number>()
  for (const step of raw.steps ?? []) {
    if ((step.signers ?? []).length > 0) stepNumbers.add(Number(step.id_number ?? 0))
  }
  return stepNumbers.size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawWebdoxWorkflow): Envelope {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? pickStr(raw.decision_name) ?? '',
    message: pickStr(raw.decision_name),
    senderId: pickStr(raw.requester_id),
    senderEmail: pickStr(raw.requester_email),
    senderName: pickStr(raw.requester_name),
    signingOrder: signingOrder(raw),
    signerIds: workflowSignerIds(raw),
    documentIds: (raw.documents ?? []).map((d) => String(d.id)),
    templateId: pickStr(raw.template_id) ?? pickStr(raw.template?.id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.created_at),
    completedAt: toIso(raw.completed_at ?? raw.signed_at),
    voidedAt: toIso(raw.canceled_at ?? raw.cancelled_at),
    expiresAt: toIso(raw.limit_date),
    updatedAt: toIso(raw.updated_at),
    platform: 'webdox',
    metadata: strMap({
      status: raw.status,
      currentStepType: raw.current_step_type,
      cancelReason: raw.cancel_reason,
    }),
    raw,
  }
}
