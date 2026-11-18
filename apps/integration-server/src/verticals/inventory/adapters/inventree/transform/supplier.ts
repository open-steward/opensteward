import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Raw Company record from InvenTree GET /api/company/?is_supplier=true
 * Source: InvenTree API schema v265, Company schema.
 */
export interface RawInvenTreeCompany {
  pk: number
  name?: string
  description?: string
  website?: string
  phone?: string
  email?: string
  currency?: string
  active?: boolean
  is_supplier?: boolean
  is_manufacturer?: boolean
  is_customer?: boolean
  parts_supplied?: number
  address?: string | null
  primary_address?: number | null
  [key: string]: unknown
}

export function transformSupplier(raw: RawInvenTreeCompany): Supplier {
  const id = String(raw.pk)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: undefined,
    isActive: raw.active !== false,
    platform: 'inventree',
    metadata: strMap({
      description: raw.description,
      website: raw.website,
      isManufacturer: raw.is_manufacturer,
      partsSupplied: raw.parts_supplied,
    }),
    raw,
  }
}
