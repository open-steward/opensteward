/**
 * Transform a ProProfs Help Desk inbox into the canonical Team shape.
 *
 * Inboxes appear as the `inbox` sub-object inside ticket responses:
 *   { id: "IB001-001", name: "Support", email: "support@example.com" }
 *
 * ProProfs inbox IDs use the format IB###-###. There is no dedicated
 * "list inboxes" REST API endpoint; inboxes are encountered when reading tickets.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProprofsInbox {
  id?: string | number
  name?: string
  email?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawProprofsInbox): Team {
  const id = String(raw.id ?? '')

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'proprofs-help-desk',
    metadata: strMap({
      email: raw.email,
    }),
    raw,
  }
}
