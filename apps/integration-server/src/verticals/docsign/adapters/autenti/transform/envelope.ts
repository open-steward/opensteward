import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import {
  SENDER_ROLE,
  participationPriority,
  partyEmail,
  type RawAutentiProcessParty,
} from './party'
import { pickStr, strMap, toIso } from './shared'

/**
 * `DocumentProcess` from the Document Process API v2 OpenAPI
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/111e9353643f4):
 * id, title, description, processLanguage, status, parties, files, tags,
 * constraints, flags, createdAt, modifiedAt.
 */
export interface RawAutentiDocumentProcess {
  id?: string
  title?: string
  description?: string | null
  processLanguage?: string
  status?: string
  parties?: RawAutentiProcessParty[]
  files?: Array<{ id: string; [key: string]: unknown }>
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

/**
 * `DocumentProcessStatus`: UNKNOWN_DOCUMENT_STATUS, DRAFT, PROCESSING,
 * COMPLETED, REJECTED, WITHDRAWN, ERROR (an open enum). The status filter
 * describes them: "PROCESSING — document processes that are currently awaiting
 * action from participants", "REJECTED — … rejected by one or more
 * participants", "WITHDRAWN — … cancelled by the sender" (node 1a69f5d61ac43).
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'DRAFT':
      return 'draft'
    case 'PROCESSING':
      return 'sent'
    case 'COMPLETED':
      return 'completed'
    case 'REJECTED':
      return 'declined'
    case 'WITHDRAWN':
      return 'voided'
    default:
      return 'unknown'
  }
}

export function transformEnvelope(raw: RawAutentiDocumentProcess): Envelope {
  const id = pickStr(raw.id)
  if (!id) throw new Error('Autenti document process has no id')
  const subject = pickStr(raw.title)
  if (subject === undefined) throw new Error(`Autenti document process ${id} has no title`)

  const parties = raw.parties ?? []
  const sender = parties.find((p) => p.role === SENDER_ROLE)?.party
  const participants = parties.filter((p) => p.role !== SENDER_ROLE)
  const priorities = new Set(
    participants.map(participationPriority).filter((n): n is number => n !== undefined),
  )

  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject,
    message: pickStr(raw.description),
    senderId: pickStr(sender?.id),
    senderEmail: partyEmail(sender),
    senderName: pickStr(sender?.name),
    signingOrder: priorities.size > 1 ? 'sequential' : 'parallel',
    signerIds: participants
      .map((p) => pickStr(p.party.id))
      .filter((s): s is string => s !== undefined),
    documentIds: (raw.files ?? []).map((f) => f.id),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.modifiedAt),
    platform: 'autenti',
    metadata: strMap({ status: raw.status, processLanguage: raw.processLanguage }),
    raw,
  }
}
