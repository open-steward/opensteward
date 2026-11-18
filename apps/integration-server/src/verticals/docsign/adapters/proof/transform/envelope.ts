import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A signer nested in a Proof transaction. Proof returns signers inline on
 * the transaction; there is no standalone signer-by-id endpoint.
 *
 * Docs: https://dev.proof.com/docs/api-data
 */
export interface RawProofSigner {
  signer_id?: string
  external_id?: string
  email?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  phone_number?: string
  address?: Record<string, unknown>
  signing_status?: string
  transaction_access_link?: string
  link_expired?: boolean
  vesting_type?: string
  order?: number | string
  notary_id?: string
  [key: string]: unknown
}

/** A document nested in a Proof transaction. Metadata only — no content. */
export interface RawProofDocument {
  id?: string
  document_name?: string
  requirement?: string
  esign_required?: boolean
  notarization_required?: boolean
  identity_confirmation_required?: boolean
  date_created?: string
  date_updated?: string
  completion_state?: string
  processing_state?: string
  bundle_position?: number
  is_enote?: boolean
  vaulted?: boolean
  [key: string]: unknown
}

/** A notarization record nested in a Proof transaction. */
export interface RawProofNotarizationRecord {
  id?: string
  meeting_start?: string
  meeting_end?: string
  notary_name?: string
  notary_county_city?: string
  notary_registration?: string
  [key: string]: unknown
}

export interface RawProofTransaction {
  id: string
  status?: string
  detailed_status?: string
  transaction_name?: string
  transaction_type?: string
  message_to_signer?: string
  external_id?: string
  organization_id?: string
  sender_name?: string
  date_created?: string
  date_updated?: string
  activation_time?: string
  expiration_time?: string
  notary_meeting_time?: string
  signers?: RawProofSigner[]
  documents?: RawProofDocument[]
  notarization_records?: RawProofNotarizationRecord[]
  [key: string]: unknown
}

/**
 * Map Proof's `status` (coarse) + `detailed_status` (fine) onto the canonical
 * EnvelopeStatus. We prefer `status` and fall back to `detailed_status`.
 */
function mapStatus(status: string | undefined, detailed: string | undefined): EnvelopeStatus {
  const s = (status ?? '').toLowerCase()
  if (s === 'completed' || s === 'completed_with_rejections') return 'completed'
  if (s === 'partially_completed') return 'delivered'
  if (s === 'sent' || s === 'received') return 'sent'
  if (s === 'expired') return 'expired'
  if (s === 'deleted') return 'voided'
  if (s === 'started') return 'draft'

  const d = (detailed ?? '').toLowerCase()
  if (d.startsWith('complete') || d === 'esign_complete' || d === 'wet_sign_complete') return 'completed'
  if (d === 'partially_complete') return 'delivered'
  if (d === 'viewed') return 'delivered'
  if (d === 'sent_to_signer' || d === 'sent_to_title_agent' || d === 'order_placed') return 'sent'
  if (d === 'expired') return 'expired'
  if (d === 'recalled') return 'voided'
  if (d === 'draft' || d === 'active') return 'draft'
  return 'draft'
}

/** Proof signing is parallel unless signers carry distinct order values. */
function signingOrder(raw: RawProofTransaction): 'parallel' | 'sequential' {
  const orders = (raw.signers ?? [])
    .map((s) => (s.order == null ? undefined : Number(s.order)))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

function signerIds(raw: RawProofTransaction): string[] {
  return (raw.signers ?? [])
    .map((s) => pickStr(s.signer_id) ?? pickStr(s.external_id) ?? pickStr(s.email))
    .filter((id): id is string => typeof id === 'string')
}

function documentIds(raw: RawProofTransaction): string[] {
  return (raw.documents ?? [])
    .map((d) => pickStr(d.id))
    .filter((id): id is string => typeof id === 'string')
}

export function transformEnvelope(raw: RawProofTransaction): Envelope {
  const completed =
    (raw.status ?? '').toLowerCase().startsWith('completed') ||
    (raw.detailed_status ?? '').toLowerCase().startsWith('complete')
  const expired =
    (raw.status ?? '').toLowerCase() === 'expired' ||
    (raw.detailed_status ?? '').toLowerCase() === 'expired'

  return {
    id: raw.id,
    externalId: raw.external_id ?? raw.id,
    status: mapStatus(raw.status, raw.detailed_status),
    subject: pickStr(raw.transaction_name) ?? '',
    message: pickStr(raw.message_to_signer),
    senderName: pickStr(raw.sender_name),
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: documentIds(raw),
    createdAt: toIso(raw.date_created),
    sentAt: toIso(raw.activation_time),
    completedAt: completed ? toIso(raw.date_updated) : undefined,
    expiresAt: toIso(raw.expiration_time),
    voidedAt: undefined,
    updatedAt: toIso(raw.date_updated),
    platform: 'proof',
    metadata: strMap({
      detailedStatus: raw.detailed_status,
      transactionType: raw.transaction_type,
      organizationId: raw.organization_id,
      notaryMeetingTime: raw.notary_meeting_time,
      expired: expired ? 'true' : undefined,
    }),
    raw,
  }
}
