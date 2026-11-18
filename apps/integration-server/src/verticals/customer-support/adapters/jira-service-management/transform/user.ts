/**
 * Transform a Jira Cloud UserDTO (agent) to canonical User.
 *
 * Agents are Jira users with service desk roles.
 * Fetched from the Jira Platform v3 API:
 *   GET /rest/api/3/users/search?query=&maxResults=50
 *
 * Jira v3 UserDTO fields:
 *   accountId    — Atlassian account ID (primary key)
 *   displayName  — full display name
 *   emailAddress — email (may be absent if profile is private)
 *   accountType  — "atlassian" | "app" | "customer"
 *   active       — boolean
 *
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJiraUser {
  accountId?: string
  displayName?: string
  emailAddress?: string
  accountType?: string
  active?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawJiraUser): User {
  return {
    id: pickStr(raw.accountId) ?? '',
    externalId: pickStr(raw.accountId) ?? '',
    email: pickStr(raw.emailAddress),
    name: pickStr(raw.displayName) ?? '',
    role: pickStr(raw.accountType),
    teamIds: [], // Team membership not available in the user search endpoint
    platform: 'jira-service-management',
    metadata: strMap({
      accountType: raw.accountType,
      active: raw.active,
    }),
    raw,
  }
}
