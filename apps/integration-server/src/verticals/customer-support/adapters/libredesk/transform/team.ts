/**
 * Transforms a Libredesk team into the canonical Team schema.
 *
 * Ref: internal/team/models/models.go (Team)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLibredeskTeam {
  id: number
  name: string
  emoji?: string | null
  conversation_assignment_type?: string
  timezone?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawLibredeskTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'libredesk',
    metadata: strMap({
      emoji: raw.emoji,
      conversationAssignmentType: raw.conversation_assignment_type,
      timezone: raw.timezone,
    }),
    raw,
  }
}
