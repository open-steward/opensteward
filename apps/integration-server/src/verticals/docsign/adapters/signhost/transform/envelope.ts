/**
 * Signhost transaction -> canonical Envelope.
 *
 * Fields per the Transaction model
 * (https://developer.signhost.com/openapi/models/Transaction.md), the 200
 * schema of `GET /api/transaction/{transactionId}`: `Id` ("Unique transaction
 * identifier"), `Status`, `Reference` ("Custom reference identifier"),
 * `SignRequestMode`, `Files` ("a key-value mapping. Key is the file ID"),
 * `Signers`, `CreatedDateTime`, `ModifiedDateTime`, `CanceledDateTime`,
 * `Seal`, `DaysToExpire`, `Language`, `CancelationReason`.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import { signerWithoutUrls, type RawSignhostSigner } from './signer'
import { fileEntryWithoutLinks, type RawSignhostFileEntry } from './document'

export interface RawSignhostTransaction {
  Id?: string
  Seal?: boolean
  Reference?: string | null
  DaysToExpire?: number
  SignRequestMode?: number
  Language?: string
  Status?: number
  CreatedDateTime?: string | null
  ModifiedDateTime?: string | null
  CanceledDateTime?: string | null
  Files?: Record<string, RawSignhostFileEntry> | null
  Signers?: RawSignhostSigner[] | null
  CancelationReason?: string | null
  [key: string]: unknown
}

/**
 * "Current transaction status": 5 Waiting For Document ("Transaction created,
 * documents being processed/prepared"), 10 Waiting For Signer ("Documents
 * ready, waiting for signers to sign"), 20 In Progress ("A signer is currently
 * in the process of signing"), 30 Signed, 40 Rejected, 50 Expired,
 * 60 Cancelled, 70 Failed ("Transaction failed due to system errors or
 * validation issues"). Failed has no canonical counterpart.
 */
function mapStatus(s: number | undefined): EnvelopeStatus {
  switch (s) {
    case 5:
      return 'draft'
    case 10:
      return 'sent'
    case 20:
      // INFERENCE: "In Progress - A signer is currently in the process of
      // signing"; status.md adds that 20 "will be returned whenever there is
      // processing involved by Signhost".
      return 'delivered'
    case 30:
      return 'completed'
    case 40:
      return 'declined'
    case 50:
      return 'expired'
    case 60:
      return 'voided'
    default:
      return 'unknown'
  }
}

/**
 * The transaction without the live links it nests: each signer's signing and
 * download URLs, and each file's download `Links`. The canonical schemas carry
 * no signing or download URLs, and docsign `raw` reaches the cache and the API
 * response unchanged.
 */
function transactionWithoutUrls(raw: RawSignhostTransaction): RawSignhostTransaction {
  const out: RawSignhostTransaction = { ...raw }
  if (Array.isArray(raw.Signers)) out.Signers = raw.Signers.map(signerWithoutUrls)
  if (raw.Files && typeof raw.Files === 'object') {
    out.Files = Object.fromEntries(
      Object.entries(raw.Files).map(([k, v]) => [k, fileEntryWithoutLinks(v)]),
    )
  }
  return out
}

export function transformEnvelope(raw: RawSignhostTransaction): Envelope {
  const id = pickStr(raw.Id)
  if (!id) throw new Error('signhost transaction has no Id')
  const signers = raw.Signers ?? []
  // SignRequestMode "1: Send immediately", "2: Send sequentially when ready
  // (default when signers have SendSignRequest enabled) Note: Ignored if
  // `SendSignRequest` is set to false." So mode 2 needs some signer with
  // SendSignRequest true, and it is the documented default when absent.
  const sends = signers.some((s) => s.SendSignRequest === true)
  const sequential = sends && (raw.SignRequestMode ?? 2) === 2
  return {
    id,
    externalId: id,
    status: mapStatus(raw.Status),
    // A transaction carries no subject or title; its only caller-supplied
    // label is the Reference ("Custom reference identifier").
    // INFERENCE: '' when Reference is empty or absent (it is "" in the
    // documented example). No documented field carries a subject.
    subject: pickStr(raw.Reference) ?? '',
    signingOrder: sequential ? 'sequential' : 'parallel',
    signerIds: signers.map((s) => pickStr(s.Id)).filter((s): s is string => s !== undefined),
    documentIds: Object.keys(raw.Files ?? {}),
    createdAt: toIso(raw.CreatedDateTime),
    updatedAt: toIso(raw.ModifiedDateTime),
    voidedAt: raw.Status === 60 ? toIso(raw.CanceledDateTime) : undefined,
    platform: 'signhost',
    metadata: strMap({
      seal: raw.Seal,
      daysToExpire: raw.DaysToExpire,
      language: raw.Language,
      signRequestMode: raw.SignRequestMode,
      cancelationReason: raw.CancelationReason,
    }),
    raw: transactionWithoutUrls(raw),
  }
}
