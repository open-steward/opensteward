/**
 * Transform a raw Flowmono signing request into the canonical Envelope shape.
 *
 * Flowmono calls its signing containers "signing requests" (not "envelopes").
 * The adapter maps the `referenceNumber` as the external identifier and
 * derives signerIds from the unique recipient emails in `signingRequestData`.
 *
 * Response entity shape inferred from the Flowmono swagger definitions at
 * https://api.flowmono.com/swagger/v1/swagger.json — the `Result.entity` is
 * typed as `object` in the spec; real responses include the fields modelled
 * here based on the platform's request/response contracts.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/** A recipient control entry embedded in a signing request. */
export interface RawFlowmonoRecipientControl {
  recipientEmail?: string
  recipientName?: string
  rank?: number
  [key: string]: unknown
}

/**
 * Raw Flowmono signing request as returned inside `Result.entity` from
 * GET /api/ExternalApplication/getsigningrequestbyreferencenumber/{referenceNumber}
 * and POST /api/ExternalApplication/getapisigningrequestsbyappid.
 */
export interface RawFlowmonoSigningRequest {
  /** Platform-generated unique reference (maps to canonical externalId/id). */
  referenceNumber?: string
  /** Caller-supplied external correlation key. */
  clientReference?: string
  /** Friendly subject / title of the signing request. */
  subject?: string
  /** Email of the user who initiated the request. */
  initiatorEmail?: string
  /** Numeric status code: 1 = pending/sent, 2 = completed, 3 = declined/voided. */
  status?: number | string
  /** ISO 8601 string */
  createdDate?: string
  /** ISO 8601 string */
  lastModifiedDate?: string
  /** ISO 8601 string */
  completedDate?: string
  /** ISO 8601 string */
  declinedDate?: string
  /** ISO 8601 string */
  expiryDate?: string
  /** Whether recipients are notified in sequential order. */
  notifyRecipientsInSequentialFormat?: boolean
  /** Recipient / control entries for the signing request. */
  signingRequestData?: RawFlowmonoRecipientControl[]
  /** App name that created the request. */
  appName?: string
  [key: string]: unknown
}

function mapStatus(raw: number | string | undefined): EnvelopeStatus {
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0)
  const s = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (n === 2 || s === 'completed') return 'completed'
  if (n === 3 || s === 'declined') return 'declined'
  if (n === 4 || s === 'voided') return 'voided'
  if (n === 5 || s === 'expired') return 'expired'
  // 1 = active/sent, anything else defaults to sent
  return 'sent'
}

function uniqueSignerIds(controls: RawFlowmonoRecipientControl[]): string[] {
  const seen = new Set<string>()
  const sorted = [...controls].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  const ids: string[] = []
  for (const c of sorted) {
    const email = pickStr(c.recipientEmail)
    if (email && !seen.has(email)) {
      seen.add(email)
      ids.push(email)
    }
  }
  return ids
}

export function transformEnvelope(raw: RawFlowmonoSigningRequest): Envelope {
  const controls = raw.signingRequestData ?? []
  const sequential = raw.notifyRecipientsInSequentialFormat === true
  const id = pickStr(raw.referenceNumber) ?? pickStr(raw.clientReference) ?? ''
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.subject) ?? '',
    message: undefined,
    senderId: undefined,
    senderEmail: pickStr(raw.initiatorEmail),
    senderName: undefined,
    signingOrder: sequential ? 'sequential' : 'parallel',
    signerIds: uniqueSignerIds(controls),
    documentIds: [],
    templateId: undefined,
    createdAt: toIso(raw.createdDate),
    sentAt: toIso(raw.createdDate),
    deliveredAt: undefined,
    completedAt: toIso(raw.completedDate),
    declinedAt: toIso(raw.declinedDate),
    voidedAt: undefined,
    expiresAt: toIso(raw.expiryDate),
    updatedAt: toIso(raw.lastModifiedDate ?? raw.createdDate),
    platform: 'flowmono',
    metadata: strMap({
      clientReference: raw.clientReference,
      appName: raw.appName,
    }),
    raw,
  }
}
