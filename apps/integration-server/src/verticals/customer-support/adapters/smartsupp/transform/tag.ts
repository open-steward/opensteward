/**
 * Transform a Smartsupp tag object into the canonical Tag schema.
 *
 * Smartsupp tags have:
 *   id          — string starting with "tg"
 *   name        — string
 *   description — string
 *   color       — hex color string e.g. "#e53935"
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSmartsuppTag {
  id: string
  name?: string
  description?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawSmartsuppTag): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'smartsupp',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
