import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawAssentlyParty } from './signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * Assently Case → canonical Envelope.
 *
 * The raw shape is a tolerant superset: the detail endpoint (`GET
 * /api/cases/{id}`) returns rich `parties` / `documents`, while `findcases`
 * returns reference rows. Every field beyond `caseId` is optional.
 */
export interface RawAssentlyCase {
  caseId?: string
  /** v2 detail alias for the case id. */
  id?: string
  status?: string
  name?: string
  nameAlias?: string
  templateId?: string
  culture?: string
  rejected?: boolean
  useSigningOrder?: boolean
  createdBy?: string
  createdOn?: string
  sentOn?: string
  finishedOn?: string
  expiresOn?: string
  reminderSentOn?: string
  metadata?: Record<string, unknown>
  /** Embedded Assently PartyModel rows — the same shape `transformSigner` consumes. */
  parties?: RawAssentlyParty[]
  documents?: Array<{ id?: string }>
  [key: string]: unknown
}

function caseId(raw: RawAssentlyCase): string {
  return pickStr(raw.caseId) ?? pickStr(raw.id) ?? ''
}

function mapStatus(raw: string | undefined, rejected?: boolean): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (rejected) return 'declined'
  if (s === 'draft' || s === 'pending') return 'draft'
  if (s === 'sent' || s === 'pendingapproval') return 'sent'
  if (s === 'finished' || s === 'signed') return 'completed'
  if (s === 'rejected') return 'declined'
  if (s === 'expired') return 'expired'
  if (s === 'recalled' || s === 'cancelled' || s === 'canceled') return 'voided'
  if (s === 'failed') return 'declined'
  return 'draft'
}

/**
 * Assently orders signers by `signsAs` (signing-order group). Multiple
 * distinct groups ⇒ sequential; a single group (or none) ⇒ parallel.
 */
function signingOrder(raw: RawAssentlyCase): 'parallel' | 'sequential' {
  if (raw.useSigningOrder === true) return 'sequential'
  const groups = new Set(
    (raw.parties ?? [])
      .map((p) => (typeof p.signsAs === 'number' ? p.signsAs : undefined))
      .filter((g): g is number => g !== undefined),
  )
  return groups.size > 1 ? 'sequential' : 'parallel'
}

function signerIds(raw: RawAssentlyCase): string[] {
  return (raw.parties ?? [])
    .map((p) => ({ id: pickStr(p.id), order: typeof p.signsAs === 'number' ? p.signsAs : 0 }))
    .filter((p): p is { id: string; order: number } => Boolean(p.id))
    .sort((a, b) => a.order - b.order)
    .map((p) => p.id)
}

export function transformEnvelope(raw: RawAssentlyCase): Envelope {
  const id = caseId(raw)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status, raw.rejected),
    subject: pickStr(raw.name) ?? pickStr(raw.nameAlias) ?? '',
    senderId: pickStr(raw.createdBy),
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.id))
      .filter((d): d is string => Boolean(d)),
    templateId: pickStr(raw.templateId),
    createdAt: toIso(raw.createdOn),
    sentAt: toIso(raw.sentOn),
    completedAt: toIso(raw.finishedOn),
    expiresAt: toIso(raw.expiresOn),
    updatedAt: toIso(raw.reminderSentOn ?? raw.finishedOn ?? raw.sentOn ?? raw.createdOn),
    platform: 'assently',
    metadata: {
      ...strMap(raw.metadata),
      ...(raw.culture ? { culture: raw.culture } : {}),
    },
    raw,
  }
}
