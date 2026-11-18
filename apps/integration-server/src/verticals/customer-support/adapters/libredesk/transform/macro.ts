/**
 * Transforms a Libredesk macro into the canonical Macro schema.
 *
 * Libredesk macros have a name, message_content (the reply body), and
 * visibility ("global" | "personal" | "team").
 *
 * Ref: internal/macro/models/models.go (Macro)
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLibredeskMacro {
  id: number
  name: string
  message_content?: string
  visibility?: string
  usage_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawLibredeskMacro): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.name) ?? '',
    body: pickStr(raw.message_content) ?? '',
    category: pickStr(raw.visibility),
    platform: 'libredesk',
    metadata: strMap({ usageCount: raw.usage_count, visibility: raw.visibility }),
    raw,
  }
}
