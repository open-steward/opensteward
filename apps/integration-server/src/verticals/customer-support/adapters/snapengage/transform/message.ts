/**
 * SnapEngage transcript entry → canonical Message.
 *
 * Each entry in a case's `transcripts` array becomes one Message.
 * SnapEngage transcript entries identify the author by `alias` only
 * (no separate agent_id per transcript line), so authorId is derived
 * from the alias.  The visitor alias is typically the visitor's name or
 * email; agent aliases are display names configured per widget.
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSnapengageTranscript {
  id?: string
  /** Unix epoch ms */
  date?: number
  date_seconds?: number
  date_milliseconds?: number
  /** Display alias of the author (visitor name, agent alias, or 'System') */
  alias?: string
  message?: string
  [key: string]: unknown
}

function toIsoFromMs(ms: number | undefined): string | undefined {
  if (ms == null || ms === 0) return undefined
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function inferAuthorType(alias: string | undefined, chatAgentAlias: string | undefined): AuthorType {
  if (!alias) return 'contact'
  const lc = alias.toLowerCase()
  if (lc === 'system' || lc === 'bot') return 'system'
  if (lc === 'agent') return 'user'
  if (chatAgentAlias && alias === chatAgentAlias) return 'user'
  return 'contact'
}

export function transformMessage(
  raw: RawSnapengageTranscript,
  ticketId: string,
  chatAgentAlias?: string,
): Message {
  const id = pickStr(raw.id) ?? `${ticketId}:${raw.date ?? 0}`
  const authorAlias = pickStr(raw.alias)
  const authorType = inferAuthorType(authorAlias, chatAgentAlias)
  const createdAtMs = raw.date ?? (raw.date_seconds ? raw.date_seconds * 1000 : undefined)
  const createdAt = toIsoFromMs(createdAtMs) ?? new Date(0).toISOString()

  return {
    id,
    externalId: id,
    ticketId,
    authorId: authorAlias ?? '',
    authorType,
    body: pickStr(raw.message) ?? '',
    type: 'public',
    createdAt,
    platform: 'snapengage',
    metadata: strMap({ alias: authorAlias }),
    raw,
  }
}
