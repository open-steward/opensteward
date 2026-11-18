import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * BreezeDoc recipient. `party` is BreezeDoc's 0-indexed signing-order group;
 * `owner` flags the document owner (the sender, when included as a party).
 * Timestamps are ISO-8601 strings: `sent_at`, `opened_at`, `completed_at`.
 */
export interface RawBreezedocRecipient {
  id: number | string
  slug?: string
  email?: string
  name?: string
  recipient_fields?: Record<string, unknown>
  party?: number
  owner?: boolean
  sent_at?: string | null
  opened_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawBreezedocRecipient): SignerStatus {
  if (raw.completed_at) return 'signed'
  if (raw.opened_at) return 'delivered'
  if (raw.sent_at) return 'sent'
  return 'created'
}

function mapRole(raw: RawBreezedocRecipient): SignerRole {
  // BreezeDoc has no recipient-type taxonomy; the owner party is the sender,
  // everyone else is a signer.
  return raw.owner ? 'cc' : 'signer'
}

export function transformSigner(raw: RawBreezedocRecipient, documentId: string): Signer {
  const externalId = String(raw.id)
  return {
    id: `${documentId}:${externalId}`,
    externalId,
    envelopeId: documentId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw),
    status: mapStatus(raw),
    // BreezeDoc parties are 0-indexed; canonical routingOrder is 1-indexed.
    routingOrder: raw.party != null ? raw.party + 1 : undefined,
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.opened_at),
    signedAt: toIso(raw.completed_at),
    platform: 'breezedoc',
    metadata: strMap({
      slug: raw.slug,
      party: raw.party,
      owner: raw.owner,
      openedAt: raw.opened_at,
    }),
    raw,
  }
}
