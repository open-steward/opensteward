/**
 * Kayako macro → canonical Macro transform.
 *
 * Macros are returned from GET /api/v1/cases/macros.json.
 * The `title` field is the macro name; `reply_contents` holds the body.
 * `reply_type` is either REPLY or NOTE — store as metadata.
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface KayakoMacroAgentRef {
  id?: number
  full_name?: string
  [key: string]: unknown
}

export interface RawKayakoMacro {
  id: number
  title?: string
  reply_type?: string
  reply_contents?: string
  visibility?: string
  usage_count?: number
  agent?: KayakoMacroAgentRef | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawKayakoMacro): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.title) ?? '',
    body: pickStr(raw.reply_contents) ?? '',
    category: pickStr(raw.visibility),
    platform: 'kayako',
    metadata: strMap({ replyType: raw.reply_type, usageCount: raw.usage_count }),
    raw,
  }
}
