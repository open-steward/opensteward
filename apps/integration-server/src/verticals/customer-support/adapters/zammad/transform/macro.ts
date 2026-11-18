/**
 * Zammad text-module-as-macro transform.
 *
 * Zammad calls these "text modules" — pre-written snippets agents can insert
 * into replies. They are the closest Zammad equivalent to a "macro".
 *
 * Endpoint (undocumented but stable): GET /api/v1/text_modules
 * Response: array of text-module objects
 *
 * Docs: https://admin-docs.zammad.org/en/latest/manage/text-modules.html
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZammadTextModule {
  id: number
  name?: string
  keywords?: string | null
  content?: string
  note?: string | null
  active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawZammadTextModule): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.name) ?? '',
    body: pickStr(raw.content) ?? '',
    category: pickStr(raw.keywords),
    platform: 'zammad',
    metadata: strMap({
      active: raw.active,
      note: raw.note,
    }),
    raw,
  }
}
