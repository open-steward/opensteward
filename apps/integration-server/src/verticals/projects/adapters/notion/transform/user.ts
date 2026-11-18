import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/** A Notion workspace user — either a `person` or a `bot`. */
export interface RawNotionUser {
  object?: string
  id: string
  type?: 'person' | 'bot'
  name?: string | null
  avatar_url?: string | null
  person?: { email?: string }
  bot?: Record<string, unknown>
  [key: string]: unknown
}

export function transformUser(raw: RawNotionUser, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.person?.email),
    name: pickStr(raw.name) ?? '',
    // Notion exposes one workspace per token; thread it through when known.
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'notion',
    metadata: strMap({
      userType: raw.type,
      avatarUrl: raw.avatar_url,
    }),
    raw,
  }
}
