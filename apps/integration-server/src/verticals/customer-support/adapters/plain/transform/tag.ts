/**
 * Plain label type → canonical Tag transform.
 *
 * Plain "label types" are the configured tag categories; individual "labels"
 * are instances attached to threads. We model label types as canonical Tags.
 * Docs: https://www.plain.com/docs/graphql/labels
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPlainLabelType {
  id: string
  name?: string | null
  externalId?: string | null
  /** Hex colour string, e.g. #e53935 */
  color?: string | null
  isArchived?: boolean | null
  [key: string]: unknown
}

export function transformTag(raw: RawPlainLabelType): Tag {
  return {
    id: raw.id,
    externalId: pickStr(raw.externalId) ?? raw.id,
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'plain',
    metadata: strMap({ isArchived: raw.isArchived }),
    raw,
  }
}
