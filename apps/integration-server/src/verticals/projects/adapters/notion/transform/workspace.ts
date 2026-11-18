import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * The Notion API does not have a dedicated /workspaces endpoint. Workspace
 * information is surfaced on the bot-user object returned by GET /users/me.
 * A token is always scoped to exactly one workspace, so listWorkspaces returns
 * a single-element array derived from the bot user.
 */
export interface RawNotionBotUser {
  object?: string
  id: string
  type?: 'bot'
  name?: string | null
  avatar_url?: string | null
  bot?: {
    owner?: unknown
    workspace_id?: string
    workspace_name?: string | null
    workspace_limits?: Record<string, unknown>
  }
  [key: string]: unknown
}

export function transformWorkspace(raw: RawNotionBotUser): Workspace {
  const workspaceId = raw.bot?.workspace_id ?? raw.id
  return {
    id: workspaceId,
    externalId: workspaceId,
    name: pickStr(raw.bot?.workspace_name) ?? pickStr(raw.name) ?? '',
    platform: 'notion',
    metadata: strMap({
      botUserId: raw.id,
      botUserName: raw.name,
    }),
    raw,
  }
}
