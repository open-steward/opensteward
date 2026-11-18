/**
 * Deskpro Snippet (macro / canned response) transform.
 *
 * Deskpro calls these "Snippets" — short pre-written responses agents can
 * insert into replies. They map onto the Macro canonical schema.
 *
 * Endpoint: GET /api/v2/snippets
 * Response envelope: { data: [...] }
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Deskpro snippet object as returned inside response.data for
 * GET /api/v2/snippets and GET /api/v2/snippets/{id}.
 */
export interface RawDeskproSnippet {
  id: number
  title?: string
  /** Snippet body in plain text */
  body?: string
  /** Snippet body in HTML (used when plain body is absent) */
  body_html?: string | null
  /** Category/folder name if available */
  snippet_category?: { title?: string } | string | null
  [key: string]: unknown
}

function extractCategory(cat: RawDeskproSnippet['snippet_category']): string | undefined {
  if (cat == null) return undefined
  if (typeof cat === 'string') return cat || undefined
  return pickStr((cat as { title?: string }).title)
}

export function transformMacro(raw: RawDeskproSnippet): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.title) ?? '',
    body: pickStr(raw.body) ?? pickStr(raw.body_html) ?? '',
    category: extractCategory(raw.snippet_category),
    platform: 'deskpro',
    metadata: strMap({}),
    raw,
  }
}
