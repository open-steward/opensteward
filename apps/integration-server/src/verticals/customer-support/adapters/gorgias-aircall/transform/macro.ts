/**
 * Pylon Macro → canonical Macro transform.
 *
 * Macro object fields: id, name, text_html, text_type,
 * macro_group_id, actions, has_actions, created_at, updated_at, visibility.
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPylonMacroAction {
  type?: string
  [key: string]: unknown
}

export interface RawPylonMacroVisibility {
  type?: string
  user_ids?: string[]
  team_ids?: string[]
  [key: string]: unknown
}

export interface RawPylonMacro {
  id: string
  name?: string
  text_html?: string | null
  text_type?: string | null
  macro_group_id?: string | null
  actions?: RawPylonMacroAction[]
  has_actions?: boolean
  created_at?: string
  updated_at?: string
  visibility?: RawPylonMacroVisibility | null
  [key: string]: unknown
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function transformMacro(raw: RawPylonMacro): Macro {
  const htmlBody = pickStr(raw.text_html)
  const body = htmlBody ? stripHtml(htmlBody) : ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.name) ?? '',
    body,
    category: raw.macro_group_id ? pickStr(raw.macro_group_id) : undefined,
    platform: 'gorgias-aircall',
    metadata: strMap({
      textType: raw.text_type,
      visibilityType: raw.visibility?.type,
    }),
    raw,
  }
}
