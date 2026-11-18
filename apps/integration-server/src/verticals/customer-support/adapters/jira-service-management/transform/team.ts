/**
 * Transform a Jira Service Management ServiceDeskDTO to canonical Team.
 *
 * JSM "service desks" map naturally to support Teams — each service desk is an
 * independent support unit (IT Helpdesk, HR, etc.).
 *
 * ServiceDeskDTO fields:
 *   id           — numeric service desk ID
 *   projectId    — linked Jira project ID
 *   projectName  — human-readable name
 *   projectKey   — Jira project key (e.g. "IT")
 *
 * Docs: https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-servicedesk/
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJsmServiceDesk {
  id?: string | number
  projectId?: string | number
  projectName?: string
  projectKey?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawJsmServiceDesk): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.projectName) ?? String(raw.id ?? ''),
    platform: 'jira-service-management',
    metadata: strMap({
      projectId: raw.projectId,
      projectKey: raw.projectKey,
    }),
    raw,
  }
}
