/**
 * SOS Inventory v2 does not expose a vendor/supplier list endpoint in the
 * public REST API. Vendor data is available only as a nested object on item
 * records (item.vendor.{id, name}).
 *
 * This module defines the raw type and transform for completeness; the adapter
 * index does NOT implement listSuppliers / getSupplier.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/** Minimal vendor shape as it appears embedded on an SOS Inventory item. */
export interface RawSosInventoryVendor {
  id: number | string
  name?: string
  email?: string
  phone?: string
  currency?: string
  leadTime?: number
  [key: string]: unknown
}

export function transformSupplier(raw: RawSosInventoryVendor): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTime),
    isActive: true,
    platform: 'sos-inventory',
    metadata: strMap({}),
    raw,
  }
}
