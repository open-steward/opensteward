/**
 * Transform a ProProfs Help Desk staff member into the canonical User shape.
 *
 * Staff objects appear as the `staff` sub-object inside ticket responses:
 *   { id: "ST001-001", name: "Jane Agent", email: "jane@example.com" }
 *
 * ProProfs staff IDs use the format ST###-###. There is no dedicated
 * "list agents" REST API endpoint; agents are encountered when reading tickets.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProprofsStaff {
  id?: string | number
  name?: string
  email?: string
  [key: string]: unknown
}

export function transformUser(raw: RawProprofsStaff): User {
  const id = String(raw.id ?? '')

  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name:  pickStr(raw.name) ?? '',
    teamIds: [],   // inbox association is on tickets, not available on staff sub-object
    platform: 'proprofs-help-desk',
    metadata: strMap({}),
    raw,
  }
}
