/**
 * LiveHelpNow canned response item → canonical Macro transform.
 *
 * Canned items come from GET /api/canned_sets/{id}/items.
 * The set (parent) ID is injected as `_setId` during the adapter iteration.
 *
 * Transforms NEVER throw; missing optional fields return undefined.
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Shape from GET /api/canned_sets/{id}/items payload.canned_items[] */
export interface RawLivehelpnowCannedItem {
  id: number
  title?: string | null
  message?: string | null
  enabled?: boolean
  order?: number
  /** Set name injected by the adapter to provide a category. */
  _setName?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawLivehelpnowCannedItem): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.title) ?? '',
    body: pickStr(raw.message) ?? '',
    category: pickStr(raw._setName),
    platform: 'livehelpnow',
    metadata: strMap({
      enabled: raw.enabled,
      order: raw.order,
    }),
    raw,
  }
}
