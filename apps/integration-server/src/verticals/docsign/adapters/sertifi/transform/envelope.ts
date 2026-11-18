import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'
import {
  participantSignerLevel,
  type RawSertifiParticipant,
} from './signer'
import type { RawSertifiDocument } from './document'

/**
 * Sertifi folder → canonical Envelope.
 *
 * A Sertifi *folder* is the unit that bundles signature documents and
 * participants, so it maps to the canonical Envelope. Folders carry their
 * `documents` and `participants` inline, so signerIds/documentIds are
 * derived from those arrays. Sertifi has no email subject/body on the
 * folder itself; the folder `name` is the closest analogue to `subject`.
 */
export interface RawSertifiFolder {
  folderId?: string
  name?: string
  folderStatus?: string
  /** Owner of the folder — the "sender" in canonical terms. */
  sender?: {
    email?: string
    firstName?: string
    lastName?: string
  }
  createdAt?: string
  expiresOn?: string
  lastActionAt?: string
  documents?: RawSertifiDocument[]
  participants?: RawSertifiParticipant[]
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  // folderStatus enum: Archived, Active, ActiveCC, ArchivedCC,
  // AwaitingVerification, Creating, Declined, DeclinedAndArchived,
  // Expired, Deleted.
  if (s === 'creating') return 'draft'
  if (s === 'active' || s === 'activecc') return 'sent'
  if (s === 'awaitingverification') return 'delivered'
  if (s === 'archived' || s === 'archivedcc') return 'completed'
  if (s === 'declined' || s === 'declinedandarchived') return 'declined'
  if (s === 'deleted') return 'voided'
  if (s === 'expired') return 'expired'
  return 'unknown'
}

function joinName(first?: string, last?: string): string | undefined {
  const name = [first, last].filter((p) => typeof p === 'string' && p.length > 0).join(' ')
  return name.length > 0 ? name : undefined
}

/** Distinct signer levels ⇒ Sertifi enforces order ⇒ sequential. */
function signingOrder(participants: RawSertifiParticipant[]): 'parallel' | 'sequential' {
  const levels = new Set<number>()
  for (const p of participants) {
    const level = participantSignerLevel(p.participantType)
    if (level !== undefined) levels.add(level)
  }
  return levels.size > 1 ? 'sequential' : 'parallel'
}

function signerIds(participants: RawSertifiParticipant[]): string[] {
  return participants
    .map((p) => ({
      id: pickStr(p.userId) ?? pickStr(p.email),
      level: participantSignerLevel(p.participantType) ?? 0,
    }))
    .filter((p): p is { id: string; level: number } => typeof p.id === 'string')
    .sort((a, b) => a.level - b.level)
    .map((p) => p.id)
}

export function transformEnvelope(raw: RawSertifiFolder): Envelope {
  const folderId = pickStr(raw.folderId) ?? ''
  const participants = raw.participants ?? []
  const documents = raw.documents ?? []
  return {
    id: folderId,
    externalId: folderId,
    status: mapStatus(raw.folderStatus),
    subject: pickStr(raw.name) ?? '',
    senderEmail: pickStr(raw.sender?.email),
    senderName: joinName(raw.sender?.firstName, raw.sender?.lastName),
    signingOrder: signingOrder(participants),
    signerIds: signerIds(participants),
    documentIds: documents
      .map((d) => pickStr(d.documentId))
      .filter((id): id is string => typeof id === 'string'),
    createdAt: toIsoDatetime(raw.createdAt),
    expiresAt: toIsoDatetime(raw.expiresOn),
    updatedAt: toIsoDatetime(raw.lastActionAt),
    platform: 'sertifi',
    metadata: strMap({ folderStatus: raw.folderStatus }),
    raw,
  }
}
