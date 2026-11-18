/**
 * Transform a ClearFeed customer object into the canonical Contact schema.
 *
 * ClearFeed "customers" are organisations/accounts (B2B customer inboxes).
 * They are the closest entity to "contacts" in this vertical — representing
 * the customer company that submits support requests.
 *
 * API: GET /v1/rest/customers, GET /v1/rest/customers/:id
 *
 * ClearFeed customer fields:
 *  - id           → id / externalId
 *  - name         → name
 *  - domains[]    → primary email domain surfaced in metadata
 *  - owner        → organizationId (internal owner Slack user ID)
 *  - portal_users → array of {email, role} — first email used as contact email
 *  - collection_id → metadata
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawClearfeedCustomer {
  id: number | string
  name?: string | null
  owner?: string | null
  domains?: string[] | null
  channel_ids?: string[] | null
  collection_id?: number | null
  external_system?: string | null
  external_entity_id?: string | null
  portal_users?: Array<{ email?: string | null; role?: string | null }> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawClearfeedCustomer): Contact {
  const id = String(raw.id)
  // Use the first portal user email as the contact email; fall back to first domain.
  const portalEmail = raw.portal_users?.find((u) => u.email)?.email ?? undefined
  const primaryDomain = raw.domains?.[0] ?? undefined

  return {
    id,
    externalId: id,
    email: pickStr(portalEmail),
    name: pickStr(raw.name) ?? '',
    organizationId: pickStr(raw.external_entity_id),
    platform: 'clearfeed',
    metadata: strMap({
      owner: raw.owner,
      primaryDomain,
      collectionId: raw.collection_id,
      externalSystem: raw.external_system,
      externalEntityId: raw.external_entity_id,
    }),
    raw,
  }
}
