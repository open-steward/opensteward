/**
 * itemit item-profile → canonical Product transform.
 *
 * itemit is an asset-tracking platform; "items" map to the Product schema
 * (each item is a tracked physical asset). Fields: id, name, description,
 * serial, type, archived, createdAt, location.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawItemitItem {
  id: string
  name?: string
  description?: string
  serial?: string
  type?: string
  archived?: boolean
  createdAt?: string
  created?: {
    at?: { timestamp?: string }
    by?: { id?: string; name?: string; type?: string }
  }
  location?: {
    id?: string
    name?: string
    type?: string
  }
  workspace?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawItemitItem): Product {
  const createdAt = toIso(raw.createdAt) ?? toIso(raw.created?.at?.timestamp)
  const locationId = raw.location?.id

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.serial) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    unitOfMeasure: 'each',
    isActive: !(pickBool(raw.archived) ?? false),
    supplierIds: [],
    createdAt,
    platform: 'itemit',
    metadata: strMap({
      type: raw.type,
      workspace: raw.workspace,
      locationId,
      locationName: raw.location?.name,
      locationType: raw.location?.type,
    }),
    raw,
  }
}
