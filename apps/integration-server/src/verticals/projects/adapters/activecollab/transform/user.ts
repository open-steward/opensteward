import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ActiveCollab `User` object (subset).
 *
 * `class` carries the role (e.g. `Owner`, `Member`, `Client`). Display name
 * is provided directly; we fall back to first/last when absent. ActiveCollab
 * has no workspace concept, so `workspaceIds` is left empty.
 */
export interface RawActivecollabUser {
  id: number | string
  class?: string
  first_name?: string
  last_name?: string
  display_name?: string
  email?: string
  is_archived?: boolean
  is_trashed?: boolean
  avatar_url?: string
  language_id?: number | null
  company_id?: number | null
  title?: string
  created_on?: number | null
  [key: string]: unknown
}

function fullName(raw: RawActivecollabUser): string {
  const display = pickStr(raw.display_name)
  if (display) return display
  const parts = [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean)
  return parts.join(' ')
}

export function transformUser(raw: RawActivecollabUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    workspaceIds: [],
    platform: 'activecollab',
    metadata: strMap({
      role: raw.class,
      companyId: raw.company_id,
      title: raw.title,
      isArchived: raw.is_archived,
    }),
    raw,
  }
}
