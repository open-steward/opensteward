/**
 * Talkdesk User/Agent → canonical User transform.
 *
 * Talkdesk Users API field reference:
 *   id           — UUID string
 *   name         — string
 *   email        — string
 *   role         — string (e.g. "agent", "administrator", "supervisor")
 *   status       — "active" | "inactive"
 *   teams        — Array<{ id: string; name?: string }> | null
 *   ring_groups  — Array<{ id: string; name?: string }> | null
 *   extension    — string | null
 *   time_zone    — string | null
 *   language     — string | null
 *   created_at   — ISO-8601 string
 *   updated_at   — ISO-8601 string
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface TalkdeskTeamRef {
  id?: string
  name?: string
}

export interface RawTalkdeskAgent {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
  status?: string | null
  teams?: TalkdeskTeamRef[] | null
  ring_groups?: TalkdeskTeamRef[] | null
  extension?: string | null
  time_zone?: string | null
  language?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawTalkdeskAgent): User {
  const teamIds = (raw.teams ?? [])
    .map((t) => pickStr(t.id))
    .filter((id): id is string => id !== undefined)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds,
    platform: 'talkdesk',
    metadata: strMap({
      status: raw.status,
      extension: raw.extension,
      timeZone: raw.time_zone,
      language: raw.language,
      createdAt: toIso(raw.created_at),
      updatedAt: toIso(raw.updated_at),
    }),
    raw,
  }
}
