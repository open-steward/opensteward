import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * A SignRequest "document" is the unit a signing process is built around:
 * it carries the file plus a nested `signrequest` object describing who is
 * signing, the subject/message, and the signer list. We map one Document →
 * one canonical Envelope (the signing process) keyed by the document uuid.
 */
export interface RawSignRequestSigner {
  uuid?: string
  email?: string
  display_name?: string
  first_name?: string
  last_name?: string
  order?: number
  needs_to_sign?: boolean
  approve_only?: boolean
  notify_only?: boolean
  signed?: boolean
  viewed?: boolean
  declined?: boolean
  emailed?: boolean
  signed_on?: string | null
  viewed_on?: string | null
  declined_on?: string | null
  declined_reason?: string | null
  [key: string]: unknown
}

export interface RawSignRequestSignRequest {
  uuid?: string
  url?: string
  who?: string
  from_email?: string
  from_email_name?: string
  subject?: string | null
  message?: string | null
  send_reminders?: boolean
  signers?: RawSignRequestSigner[]
  document?: string
  [key: string]: unknown
}

export interface RawSignRequestDocument {
  uuid: string
  url?: string
  name?: string | null
  external_id?: string | null
  frontend_id?: string | null
  status?: string
  signrequest?: RawSignRequestSignRequest | null
  created?: string
  user?: { email?: string; first_name?: string; last_name?: string } | null
  team?: { name?: string; subdomain?: string } | null
  api_used?: boolean
  sandbox?: boolean
  auto_expire_after?: string | null
  security_hash?: string | null
  [key: string]: unknown
}

/**
 * SignRequest document status codes (see API docs):
 *   co=converting, ne=new, pe=preparing, se=sent, vi=viewed, si=signed,
 *   do/dl=downloaded, sd=signed+downloaded, ip=in progress, fw=forwarded,
 *   fe=forwarded(signed), ca=cancelled, de=declined, exp/ex=expired.
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'co':
    case 'ne':
    case 'pe':
      return 'draft'
    case 'se':
    case 'ip':
    case 'fw':
      return 'sent'
    case 'vi':
      return 'delivered'
    case 'si':
    case 'do':
    case 'dl':
    case 'sd':
    case 'fe':
      return 'completed'
    case 'de':
      return 'declined'
    case 'ca':
      return 'voided'
    case 'exp':
    case 'ex':
      return 'expired'
    default:
      return 'draft'
  }
}

function signerKey(envelopeId: string, s: RawSignRequestSigner): string {
  return s.uuid ?? `${envelopeId}:${s.email ?? ''}`
}

function signingOrder(sr: RawSignRequestSignRequest | null | undefined): 'parallel' | 'sequential' {
  const orders = (sr?.signers ?? []).map((s) => s.order ?? 0)
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

/** Completion timestamp: latest signed_on once every required signer signed. */
function completedAt(sr: RawSignRequestSignRequest | null | undefined): string | undefined {
  const required = (sr?.signers ?? []).filter((s) => s.needs_to_sign !== false)
  if (required.length === 0 || !required.every((s) => s.signed)) return undefined
  const stamps = required
    .map((s) => toIsoDatetime(s.signed_on))
    .filter((x): x is string => x !== undefined)
  if (stamps.length === 0) return undefined
  return stamps.sort().at(-1)
}

function declinedAt(sr: RawSignRequestSignRequest | null | undefined): string | undefined {
  for (const s of sr?.signers ?? []) {
    if (s.declined) {
      const at = toIsoDatetime(s.declined_on)
      if (at) return at
    }
  }
  return undefined
}

export function transformEnvelope(raw: RawSignRequestDocument): Envelope {
  const sr = raw.signrequest ?? null
  const orderedSigners = [...(sr?.signers ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const userName = [raw.user?.first_name, raw.user?.last_name].filter(Boolean).join(' ')
  const senderName = sr?.from_email_name ?? (userName || undefined)

  return {
    id: raw.uuid,
    externalId: raw.uuid,
    status: mapStatus(raw.status),
    subject: sr?.subject ?? raw.name ?? '',
    message: pickStr(sr?.message),
    senderEmail: pickStr(sr?.from_email ?? raw.user?.email),
    senderName: pickStr(senderName),
    signingOrder: signingOrder(sr),
    signerIds: orderedSigners.map((s) => signerKey(raw.uuid, s)),
    documentIds: [raw.uuid],
    createdAt: toIsoDatetime(raw.created),
    completedAt: completedAt(sr),
    declinedAt: declinedAt(sr),
    expiresAt: toIsoDatetime(raw.auto_expire_after),
    platform: 'signrequest',
    metadata: strMap({
      who: sr?.who,
      externalId: raw.external_id,
      frontendId: raw.frontend_id,
      docStatus: raw.status,
      team: raw.team?.subdomain,
      sandbox: raw.sandbox,
      apiUsed: raw.api_used,
      sendReminders: sr?.send_reminders,
    }),
    raw,
  }
}
