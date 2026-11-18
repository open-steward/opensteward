/**
 * Transform an HD Saved Reply (Frappe Helpdesk) into the canonical Macro schema.
 *
 * Frappe Helpdesk's equivalent of macros / canned responses is "HD Saved Reply".
 *
 * Key HD Saved Reply fields:
 *   name      — document ID
 *   title     — display title
 *   message   — body of the saved reply (HTML)
 *   team      — link to HD Team (optional category grouping)
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFrappeSavedReply {
  name: string
  title?: string
  message?: string
  team?: string | null
  [key: string]: unknown
}

export function transformMacro(raw: RawFrappeSavedReply): Macro {
  return {
    id: raw.name,
    externalId: raw.name,
    title: pickStr(raw.title) ?? raw.name,
    // Strip HTML tags for plain text body
    body: pickStr(raw.message)?.replace(/<[^>]+>/g, '').trim() ?? '',
    category: pickStr(raw.team),
    platform: 'frappe-helpdesk',
    metadata: strMap({ team: raw.team }),
    raw,
  }
}
