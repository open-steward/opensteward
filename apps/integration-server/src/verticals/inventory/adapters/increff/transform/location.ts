/**
 * Increff warehouse / fulfilment location transform.
 *
 * Increff calls locations "warehouses" or "fulfilment locations". Each has
 * a warehouseCode (the external ID used in stock queries), a human-readable
 * name, and an optional address.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawIncreffLocation {
  /** Unique warehouse code — used as the external ID */
  warehouseCode: string
  name?: string
  /** Active / enabled status */
  isActive?: boolean | string
  status?: string
  /** Address sub-object */
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    country?: string
    pincode?: string
    postalCode?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawIncreffLocation): Location {
  const isActive =
    pickBool(raw.isActive) ??
    (raw.status ? (raw.status as string).toLowerCase() !== 'inactive' : true)

  return {
    id: raw.warehouseCode,
    externalId: raw.warehouseCode,
    name: pickStr(raw.name) ?? raw.warehouseCode,
    code: raw.warehouseCode,
    type: 'warehouse',
    address: raw.address ? {
      line1: raw.address.line1,
      line2: raw.address.line2,
      city: raw.address.city,
      region: raw.address.state,
      country: raw.address.country,
      postalCode: raw.address.pincode ?? raw.address.postalCode,
    } : undefined,
    isActive,
    platform: 'increff',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
