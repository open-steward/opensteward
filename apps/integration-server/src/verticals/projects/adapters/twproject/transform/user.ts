import type { User } from '../../../schema'
import { nonEmpty } from './shared'

/**
 * A Twproject person, read with `{ command: "list", object: "person" }` or
 * `{ command: "get", object: "person", id }`. Fields are those of the
 * documented person response example
 * (https://twproject.com/support/api/returnSamples.json, `person.list`):
 * `displayName` ("Johanna Lake") and `email` (often "").
 */
export interface RawTwprojectPerson {
  /** Returned as a string, e.g. "105". */
  id: string | number
  displayName?: string
  email?: string
  [key: string]: unknown
}

/**
 * Twproject has no workspace object, so `workspaceIds` is empty. Address,
 * phone and other personal data are left out (schema PII rule).
 */
export function transformUser(raw: RawTwprojectPerson): User {
  const id = String(raw.id)
  if (typeof raw.displayName !== 'string') {
    throw new Error(`Twproject person ${id} has no displayName`)
  }
  return {
    id,
    externalId: id,
    email: nonEmpty(raw.email),
    name: raw.displayName,
    workspaceIds: [],
    platform: 'twproject',
    metadata: {},
    raw,
  }
}
