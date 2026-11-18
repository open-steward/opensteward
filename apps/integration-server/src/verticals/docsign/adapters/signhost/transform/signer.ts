/**
 * Signhost Signer -> canonical Signer.
 *
 * Fields per the Signer model
 * (https://developer.signhost.com/openapi/models/Signer.md): `Id` ("Unique
 * signer identifier"), `Email` ("Signer's email address"), `SendSignRequest`,
 * `Activities` ("Activities/events for this signer"), `RejectReason`,
 * `SignedDateTime`, `RejectDateTime`. The model has no name and no status
 * field; CreateSignerRequest states "Email address is mandatory", so the
 * email is the signer's name, and the status is read from the timestamps
 * and activity codes.
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawSignhostActivity {
  Id?: string
  Code?: number
  Activity?: string
  Info?: string | null
  CreatedDateTime?: string | null
  [key: string]: unknown
}

export interface RawSignhostSigner {
  Id?: string
  Email?: string
  SendSignRequest?: boolean
  Activities?: RawSignhostActivity[] | null
  RejectReason?: string | null
  SignedDateTime?: string | null
  RejectDateTime?: string | null
  [key: string]: unknown
}

/** Activity codes ("Statuses & Activities", https://developer.signhost.com/guide/features/status.md). */
const INVITATION_SENT = 101
const OPENED = 103
const REMINDER_SENT = 104
const DOCUMENT_OPENED = 105
const REJECTED = 202
const SIGNED = 203

function firstAt(acts: RawSignhostActivity[], code: number): string | undefined {
  return toIso(acts.find((a) => a.Code === code)?.CreatedDateTime)
}

function mapStatus(raw: RawSignhostSigner, acts: RawSignhostActivity[]): SignerStatus {
  const codes = new Set(acts.map((a) => a.Code))
  if (toIso(raw.SignedDateTime) || codes.has(SIGNED)) return 'signed'
  if (toIso(raw.RejectDateTime) || codes.has(REJECTED)) return 'declined'
  if (codes.has(OPENED) || codes.has(DOCUMENT_OPENED)) return 'delivered'
  if (codes.has(INVITATION_SENT) || codes.has(REMINDER_SENT)) return 'sent'
  return 'created'
}

/**
 * The Signer's live links, never carried in `raw`: `SignUrl` ("A unique URL
 * for this signer to access the signing interface"), `DelegateSignUrl` ("URL
 * for delegate to sign"), `ShowUrl` ("the signed document(s) download flow")
 * and `ReceiptUrl` ("the receipt download flow"). Each is a bearer link, and
 * the canonical docsign schemas carry no signing or download URLs.
 */
const SIGNER_URL_FIELDS = ['SignUrl', 'DelegateSignUrl', 'ShowUrl', 'ReceiptUrl'] as const

/** A Signer with its signing and download URLs removed. */
export function signerWithoutUrls(raw: RawSignhostSigner): RawSignhostSigner {
  const out: RawSignhostSigner = { ...raw }
  for (const k of SIGNER_URL_FIELDS) delete out[k]
  return out
}

export function transformSigner(raw: RawSignhostSigner, envelopeId: string): Signer {
  const id = pickStr(raw.Id)
  if (!id) throw new Error(`signhost signer of transaction ${envelopeId} has no Id`)
  const email = pickStr(raw.Email)
  if (!email) throw new Error(`signhost signer ${id} has no Email`)
  const acts = raw.Activities ?? []
  return {
    id,
    externalId: id,
    envelopeId,
    email,
    name: email,
    // Signers sign; receivers ("copies of signed documents") are a separate array.
    role: 'signer',
    status: mapStatus(raw, acts),
    sentAt: firstAt(acts, INVITATION_SENT),
    deliveredAt: firstAt(acts, OPENED),
    signedAt: toIso(raw.SignedDateTime),
    declinedAt: toIso(raw.RejectDateTime),
    declineReason: pickStr(raw.RejectReason),
    platform: 'signhost',
    metadata: strMap({ sendSignRequest: raw.SendSignRequest }),
    raw: signerWithoutUrls(raw),
  }
}
