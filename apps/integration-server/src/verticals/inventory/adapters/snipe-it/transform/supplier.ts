/**
 * Snipe-IT supplier → Supplier transform.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap, toIso} from './shared'

interface SnipeDate {
  datetime?: string
  formatted?: string
}

export interface RawSnipeItSupplier {
  id: number
  name?: string
  url?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  zip?: string | null
  fax?: string | null
  phone?: string | null
  email?: string | null
  contact?: string | null
  notes?: string | null
  assets_count?: number
  accessories_count?: number
  licenses_count?: number
  consumables_count?: number
  components_count?: number
  created_at?: SnipeDate | string | null
  updated_at?: SnipeDate | string | null
  [key: string]: unknown
}

function extractDate(v: SnipeDate | string | null | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return toIso(v)
  return toIso(v.datetime ?? v.formatted)
}

export function transformSupplier(raw: RawSnipeItSupplier): Supplier {
  const id = String(raw.id)

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    isActive: true,
    platform: 'snipe-it',
    metadata: strMap({
      url: raw.url,
      contact: raw.contact,
      address: raw.address,
      address2: raw.address2,
      city: raw.city,
      state: raw.state,
      country: raw.country,
      zip: raw.zip,
      fax: raw.fax,
      notes: raw.notes,
      assetsCount: raw.assets_count,
      accessoriesCount: raw.accessories_count,
      licensesCount: raw.licenses_count,
      consumablesCount: raw.consumables_count,
      componentsCount: raw.components_count,
      createdAt: extractDate(raw.created_at),
      updatedAt: extractDate(raw.updated_at),
    }),
    raw,
  }
}
