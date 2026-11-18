/**
 * Toast Configuration API `MenuGroup` → canonical Collection.
 *
 * GET /config/v2/menuGroups "Returns an array of `MenuGroup` objects
 * containing information about the subsections of the menus configured for a
 * restaurant." https://doc.toasttab.com/openapi/configuration/operation/menuGroupsGet/
 *
 * The documented `MenuGroup` carries `guid`, `name`, `menu`, `visibility`,
 * `parent`, `items` ("An array of `ExternalReference` objects containing the
 * identifiers of the `MenuItem`s in the menu group."), `subgroups`,
 * `optionGroups`, `images` and unit-of-measure fields. It has no description
 * or timestamps.
 */

import type { Collection } from '../../../schema/collection'
import type { RawToastImage } from './product'

export interface RawToastReference {
  guid: string
  entityType?: string
  externalId?: string
}

export interface RawToastMenuGroup {
  guid: string
  entityType?: string
  externalId?: string
  name?: string
  menu?: RawToastReference
  orderableOnline?: string
  visibility?: string
  parent?: RawToastReference | null
  items?: RawToastReference[]
  subgroups?: RawToastReference[]
  optionGroups?: RawToastReference[]
  inheritOptionGroups?: boolean
  images?: RawToastImage[]
  unitOfMeasure?: string
  inheritUnitOfMeasure?: boolean
  [key: string]: unknown
}

export function transformCollection(raw: RawToastMenuGroup): Collection {
  // "The name of the menu group as it appears in the Toast POS." Required by
  // the canonical schema, with no other documented source.
  if (typeof raw.name !== 'string') throw new Error(`Toast menu group ${raw.guid} has no name`)
  const productIds = (raw.items ?? []).map((item) => item.guid).filter((g) => !!g)
  const image = raw.images?.find((img) => !!img.url)
  return {
    id: raw.guid,
    title: raw.name,
    productIds: productIds.length > 0 ? productIds : undefined,
    image: image?.url ? { url: image.url } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Toast menu group body for create/update. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    visibility: 'ALL',
    menuItems: collection.productIds?.map((id) => ({ guid: id })),
  }
}
