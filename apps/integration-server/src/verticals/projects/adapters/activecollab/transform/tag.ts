import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ActiveCollab `Label` object (subset) → canonical `Tag`.
 *
 * Labels are account-global (no per-workspace scoping). `class` is either
 * `ProjectLabel` or `TaskLabel`; `color` is a `#RRGGBB` hex string.
 */
export interface RawActivecollabLabel {
  id: number | string
  name?: string
  color?: string
  class?: string
  is_default?: boolean
  is_global?: boolean
  position?: number
  [key: string]: unknown
}

export function transformTag(raw: RawActivecollabLabel): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // Labels are not scoped to a workspace in ActiveCollab.
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'activecollab',
    metadata: strMap({
      class: raw.class,
      isDefault: raw.is_default,
      isGlobal: raw.is_global,
    }),
    raw,
  }
}
