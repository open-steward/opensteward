/**
 * Transforms an Omnidesk label to the canonical Tag schema.
 *
 * Omnidesk label fields: label_id, label_title.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOmnideskLabel {
  label_id: number
  label_title?: string
  [key: string]: unknown
}

export function transformTag(raw: RawOmnideskLabel): Tag {
  return {
    id: String(raw.label_id),
    externalId: String(raw.label_id),
    name: pickStr(raw.label_title) ?? '',
    platform: 'omnidesk',
    metadata: strMap({}),
    raw,
  }
}
