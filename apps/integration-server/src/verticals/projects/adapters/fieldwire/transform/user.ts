/**
 * Fieldwire project user → canonical User transform.
 *
 * Fieldwire exposes project-level membership via the projects/{id}/users
 * endpoint. User fields (v3):
 *   id (int32), email (string), first_name (string), last_name (string),
 *   phone_number (string|null), company (string|null), job_title (string|null),
 *   language (string), is_confirmed (boolean),
 *   created_at, updated_at
 *
 * Docs: https://developers.fieldwire.com/reference/get_projects_users_in_account_project
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFieldwireUser {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone_number?: string | null
  company?: string | null
  job_title?: string | null
  language?: string | null
  is_confirmed?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawFieldwireUser, projectId?: string): User {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name) ?? ''
  const name = ([firstName, lastName].filter(Boolean).join(' ') || pickStr(raw.email)) ?? ''

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name,
    workspaceIds: projectId ? [projectId] : [],
    platform: 'fieldwire',
    metadata: strMap({
      company: raw.company,
      jobTitle: raw.job_title,
      language: raw.language,
      isConfirmed: raw.is_confirmed,
    }),
    raw,
  }
}
