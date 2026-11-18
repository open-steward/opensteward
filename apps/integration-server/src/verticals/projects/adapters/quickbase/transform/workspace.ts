import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * A Quickbase **app** maps to the canonical Workspace — it is the top-level
 * container that owns tables (projects) and records (tasks).
 * Docs: https://developer.quickbase.com/operation/getApp
 */
export interface RawQuickbaseApp {
  id: string
  name?: string
  description?: string
  created?: string
  updated?: string
  timeZone?: string
  dateFormat?: string
  hasEveryoneOnTheInternet?: boolean
  [key: string]: unknown
}

export function transformWorkspace(raw: RawQuickbaseApp): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'quickbase',
    metadata: strMap({
      description: raw.description,
      timeZone: raw.timeZone,
      dateFormat: raw.dateFormat,
      hasEveryoneOnTheInternet: raw.hasEveryoneOnTheInternet,
    }),
    raw,
  }
}
