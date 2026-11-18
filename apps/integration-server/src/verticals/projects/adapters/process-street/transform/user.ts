/**
 * Transform a Process Street user into the canonical User shape.
 *
 * Documented shape (ListUsersResponse.users[] in
 * https://public-api.process.st/api/v1.1/docs/openapi.json, required: id,
 * email, username):
 *   id; email — "The user's email address (also their login identifier).";
 *   username — "The user's display name (e.g. `Jane Doe`)."
 */
import type { User } from '../../../schema'

export interface RawProcessStreetUser {
  id: string
  email: string
  username: string
}

export function transformUser(raw: RawProcessStreetUser): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: raw.email,
    name: raw.username,
    workspaceIds: [],
    platform: 'process-street',
    metadata: {},
    raw,
  }
}
