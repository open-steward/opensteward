import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * FP Sign `Workflow` — the signing request. Recipients (`jobs`) and documents
 * are fetched separately, so this raw shape covers only workflow-level fields.
 */
export interface RawFpSignWorkflow {
  id?: number | string
  name?: string
  comment?: string
  state?: string
  workflowType?: string
  workflowDirection?: string
  owner?: {
    id?: number | string
    email?: string
    user?: { id?: number | string; profile?: { firstname?: string; lastname?: string } }
  }
  dateCreated?: string
  dateModified?: string
  [key: string]: unknown
}

/** FP Sign workflow processing states → canonical envelope status. */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'created':
      return 'draft'
    case 'waiting_for_input':
    case 'waiting_for_external_tan':
    case 'processing':
    case 'suspended':
    case 'paused':
      return 'sent'
    case 'finished':
      return 'completed'
    case 'rejected':
      return 'declined'
    case 'cancelled':
    case 'dismissed':
      return 'voided'
    case 'failed':
      return 'expired'
    default:
      return 'draft'
  }
}

function ownerName(raw: RawFpSignWorkflow): string | undefined {
  const profile = raw.owner?.user?.profile
  const name = [profile?.firstname, profile?.lastname].filter(Boolean).join(' ')
  return name || undefined
}

export function transformEnvelope(raw: RawFpSignWorkflow): Envelope {
  const envelopeId = pickStr(raw.id) ?? ''
  return {
    id: envelopeId,
    externalId: envelopeId,
    status: mapStatus(raw.state),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.comment),
    senderId: pickStr(raw.owner?.id),
    senderEmail: pickStr(raw.owner?.email),
    senderName: ownerName(raw),
    // FP Sign workflows execute their jobs sequentially.
    signingOrder: 'sequential',
    signerIds: [],
    documentIds: [],
    createdAt: toIso(raw.dateCreated),
    updatedAt: toIso(raw.dateModified),
    platform: 'fp-sign',
    metadata: strMap({
      workflowType: raw.workflowType,
      workflowDirection: raw.workflowDirection,
      state: raw.state,
    }),
    raw,
  }
}
