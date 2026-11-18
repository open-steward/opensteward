import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Zoho Sign signer = one entry in an action's recipients list, OR the
 * action itself when no nested recipients exist. `action_type` carries the
 * role.
 */
export interface RawZohoSignSigner {
  recipient_id?: string
  action_id?: string
  action_type?: string
  action_status?: string
  recipient_email?: string
  recipient_name?: string
  recipient_phonenumber?: string
  recipient_countrycode?: string
  signing_order?: number | string
  delivery_mode?: string
  sent_time?: number | string
  delivered_time?: number | string
  signed_time?: number | string
  declined_time?: number | string
  declined_reason?: string
  viewed_time?: number | string
  [key: string]: unknown
}

function mapRole(actionType: string | undefined): SignerRole {
  const a = (actionType ?? '').toUpperCase()
  if (a === 'SIGN' || a === 'INPERSONSIGN') return a === 'INPERSONSIGN' ? 'in_person_signer' : 'signer'
  if (a === 'VIEW' || a === 'CC') return 'cc'
  if (a === 'APPROVE') return 'approver'
  if (a === 'WITNESS') return 'witness'
  if (a === 'EDIT' || a === 'EDITOR') return 'editor'
  return 'signer'
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed') return 'signed'
  if (lower === 'declined' || lower === 'rejected') return 'declined'
  if (lower === 'delivered' || lower === 'viewed' || lower === 'opened') return 'delivered'
  if (lower === 'sent' || lower === 'sentforsign' || lower === 'sent_for_signature') return 'sent'
  if (lower === 'unopened' || lower === 'notyetsent') return 'created'
  return 'created'
}

export function transformSigner(
  raw: RawZohoSignSigner,
  envelopeId: string,
): Signer {
  const externalId = pickStr(raw.recipient_id) ?? pickStr(raw.action_id) ?? ''
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.recipient_email) ?? '',
    name: pickStr(raw.recipient_name) ?? '',
    role: mapRole(raw.action_type),
    status: mapStatus(raw.action_status),
    routingOrder: pickNum(raw.signing_order),
    sentAt: toIso(raw.sent_time),
    deliveredAt: toIso(raw.delivered_time ?? raw.viewed_time),
    signedAt: toIso(raw.signed_time),
    declinedAt: toIso(raw.declined_time),
    declineReason: pickStr(raw.declined_reason),
    platform: 'zoho-sign',
    metadata: strMap({
      actionType: raw.action_type,
      deliveryMode: raw.delivery_mode,
      recipientPhone: raw.recipient_phonenumber,
    }),
    raw,
  }
}
