import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * An Ironclad *workflow* is the canonical Envelope: a contract moving through
 * Review → Sign → completion. The `signatures` block carries the eSignature
 * state once the workflow reaches the Sign step.
 */
export interface RawIroncladWorkflow {
  id: string
  ironcladId?: string
  title?: string
  template?: string
  templateName?: string
  step?: string
  status?: string
  isComplete?: boolean
  isCancelled?: boolean
  created?: string
  lastUpdated?: string
  recordIds?: string[]
  creator?: {
    id?: string
    displayName?: string
    email?: string
  }
  attributes?: Record<string, unknown>
  signatures?: {
    status?: string
    routing?: string
    provider?: string
    sentAt?: string
    completedAt?: string
    signers?: Array<{
      email?: string
      userId?: string
      name?: string
      status?: string
      routingOrder?: number
    }>
  }
  [key: string]: unknown
}

/**
 * Workflow status alone is coarse (`active`/`paused`/`completed`/`cancelled`).
 * When the Sign step has started, the `signatures.status` is more specific,
 * so we prefer it for the in-flight signing states.
 */
function mapStatus(raw: RawIroncladWorkflow): EnvelopeStatus {
  if (raw.isCancelled || raw.status === 'cancelled') return 'voided'
  if (raw.isComplete || raw.status === 'completed') return 'completed'

  const sig = (raw.signatures?.status ?? '').toLowerCase()
  switch (sig) {
    case 'fully_signed':
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    case 'sent':
    case 'partially_signed':
    case 'collecting':
      return 'sent'
    default:
      break
  }

  switch (raw.status) {
    case 'active':
    case 'paused':
      return raw.signatures?.sentAt ? 'sent' : 'draft'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawIroncladWorkflow): Envelope {
  const signers = raw.signatures?.signers ?? []
  const orders = signers
    .map((s) => s.routingOrder)
    .filter((o): o is number => typeof o === 'number' && o >= 0)
  const sequential =
    (raw.signatures?.routing ?? '').toLowerCase() === 'sequential' ||
    new Set(orders).size > 1

  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject: pickStr(raw.title) ?? '',
    senderId: pickStr(raw.creator?.id),
    senderEmail: pickStr(raw.creator?.email),
    senderName: pickStr(raw.creator?.displayName),
    signingOrder: sequential ? 'sequential' : 'parallel',
    signerIds: signers
      .map((s) => s.userId ?? s.email ?? '')
      .filter((s): s is string => Boolean(s)),
    documentIds: [],
    templateId: pickStr(raw.template),
    createdAt: toIso(raw.created),
    sentAt: toIso(raw.signatures?.sentAt),
    completedAt: toIso(raw.signatures?.completedAt),
    updatedAt: toIso(raw.lastUpdated),
    platform: 'ironclad',
    metadata: strMap({
      ironcladId: raw.ironcladId,
      step: raw.step,
      templateName: raw.templateName,
      signatureProvider: raw.signatures?.provider,
      recordIds: (raw.recordIds ?? []).join(','),
    }),
    raw,
  }
}
