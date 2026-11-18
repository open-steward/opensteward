/**
 * Lightspeed Retail Category → canonical Collection.
 *
 * Lightspeed R-Series uses "Categories" as the primary grouping mechanism
 * for items. Categories support nesting via `parentID`.
 */

import type { Collection } from '../../../schema/collection'

export interface RawLightspeedCategory {
  categoryID: string
  name?: string
  parentID?: string
  nodeDepth?: string
  fullPathName?: string
  leftNode?: string
  rightNode?: string
  createTime?: string
  timeStamp?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawLightspeedCategory): Collection {
  return {
    id: raw.categoryID,
    title: raw.name ?? '',
    type: 'MANUAL',
    description: raw.fullPathName ?? undefined,
    updatedAt: raw.timeStamp,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Lightspeed Category body for create/update. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
  }
}
