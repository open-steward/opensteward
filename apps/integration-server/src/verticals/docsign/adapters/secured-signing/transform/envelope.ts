import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'
import type { RawSecuredSigningSigner } from './signer'

/**
 * Secured Signing `Document` — the signing request. This single object is
 * the canonical Envelope: it carries the document name, overall `Status`,
 * the nested `Signers`, due/last-signed dates, and an embedded `Logs` audit
 * trail. There is no separate "envelope" resource on Secured Signing.
 */
export interface RawSecuredSigningDocument {
  Reference?: string
  Name?: string
  Status?: string
  Signers?: RawSecuredSigningSigner[]
  DocumentUrl?: string
  DueDate?: string
  LastSignedDate?: string
  GMT?: string
  Logs?: Array<{ Name?: string; Email?: string; Action?: string; Date?: string; GMT?: string }>
  HasFileUploaded?: boolean
  PackageReference?: string
  FormDirectReference?: string
  ClientReference?: string
  IDVerificationRequested?: boolean
  [key: string]: unknown
}

/**
 * Maps the Secured Signing document `Status` (mirrors the SignedStatus enum:
 * Initialized, Invitation, Reminder, AutoExtend, Expired, Signed, Complete,
 * Archived, Pending, Deleted, Rejected, Declined) to a canonical status.
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'complete' || s === 'signed' || s === 'archived') return 'completed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'deleted') return 'voided'
  if (s === 'expired') return 'expired'
  if (s === 'invitation' || s.startsWith('reminder') || s === 'autoextend') return 'sent'
  if (s === 'initialized' || s === 'pending') return 'draft'
  return 'draft'
}

/**
 * Secured Signing signs sequentially by default through its workflow but
 * exposes no per-signer ordinal, so signing order can't be inferred from the
 * payload. Default to sequential — the safe assumption for a WeSign flow.
 */
function signingOrder(): 'parallel' | 'sequential' {
  return 'sequential'
}

export function transformEnvelope(raw: RawSecuredSigningDocument): Envelope {
  const reference = pickStr(raw.Reference) ?? ''
  const completed = mapStatus(raw.Status) === 'completed'
  return {
    id: reference,
    externalId: reference,
    status: mapStatus(raw.Status),
    subject: pickStr(raw.Name) ?? '',
    signingOrder: signingOrder(),
    signerIds: (raw.Signers ?? [])
      .map((s) => pickStr(s.SignerReference))
      .filter((r): r is string => typeof r === 'string'),
    // Secured Signing's Document IS the single file in the request; expose
    // its own reference as the sole document id.
    documentIds: reference ? [reference] : [],
    completedAt: completed ? toIsoDatetime(raw.LastSignedDate) : undefined,
    expiresAt: toIsoDatetime(raw.DueDate),
    updatedAt: toIsoDatetime(raw.LastSignedDate),
    platform: 'secured-signing',
    metadata: strMap({
      packageReference: raw.PackageReference,
      formDirectReference: raw.FormDirectReference,
      clientReference: raw.ClientReference,
      gmt: raw.GMT,
      hasFileUploaded: raw.HasFileUploaded,
      idVerificationRequested: raw.IDVerificationRequested,
      rawStatus: raw.Status,
    }),
    raw,
  }
}
