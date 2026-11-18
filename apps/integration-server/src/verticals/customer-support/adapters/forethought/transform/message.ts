/**
 * Transform a raw Forethought Solve API conversation turn (widget component
 * exchange) into the canonical Message.
 *
 * Forethought conversations consist of alternating user queries and bot
 * responses, each represented as a "turn". A turn bundles one or more
 * `widget_components` (text blocks, buttons, forms) into a single exchange.
 *
 *   turn_id / index      → id / externalId
 *   conversation_id      → ticketId
 *   role (user/bot)      → authorType (contact / system)
 *   text content         → body (concatenated widget_component messages)
 *   created_at           → createdAt
 *
 * Docs: https://support.forethought.ai/hc/en-us/articles/31636750750227
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** A single component inside a conversation turn. */
export interface RawForethoughtWidgetComponent {
  type?: string
  format?: string
  message?: string
  [key: string]: unknown
}

/**
 * Raw Forethought conversation turn as returned from the Solve API.
 * When listing conversation history, the API wraps turns in an array.
 */
export interface RawForethoughtTurn {
  /** Unique identifier for this turn; may be an index or UUID. */
  turn_id?: string | number
  /** Role of the author: 'user' (end-user) or 'bot' (Forethought AI). */
  role?: string
  /** One or more UI components making up this turn. */
  widget_components?: RawForethoughtWidgetComponent[]
  /** Flat text body, if the platform returns it alongside widget_components. */
  text?: string | null
  /** ISO-8601 */
  created_at?: string
  [key: string]: unknown
}

/**
 * Concatenate all text-bearing widget_components into a single string.
 * Non-text components (buttons, forms) are skipped; their labels are
 * included where available to preserve conversational context.
 */
function extractBody(raw: RawForethoughtTurn): string {
  // Prefer the flat text field when present (some API versions surface this)
  const flat = pickStr(raw.text)
  if (flat) return flat

  const components = raw.widget_components ?? []
  const parts: string[] = []
  for (const c of components) {
    const msg = pickStr(c.message)
    if (msg) parts.push(msg)
  }
  return parts.join('\n').trim()
}

function mapAuthorType(role: string | undefined): AuthorType {
  if (role === 'user') return 'contact'
  if (role === 'bot') return 'system'
  // any other unknown role → unknown
  return 'unknown'
}

export function transformMessage(raw: RawForethoughtTurn, conversationId: string): Message {
  const idStr = raw.turn_id != null ? String(raw.turn_id) : `${conversationId}:unknown`

  return {
    id: idStr,
    externalId: idStr,
    ticketId: conversationId,
    // Forethought does not provide an author user ID in the turn payload; use role as surrogate
    authorId: pickStr(raw.role) ?? 'bot',
    authorType: mapAuthorType(raw.role),
    body: extractBody(raw),
    // Forethought turns are always public (no internal notes in the Solve widget)
    type: 'public',
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'forethought',
    metadata: strMap({ role: raw.role }),
    raw,
  }
}
