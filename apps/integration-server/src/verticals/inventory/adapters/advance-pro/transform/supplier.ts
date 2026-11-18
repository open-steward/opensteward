/**
 * AdvancePro supplier / vendor transform.
 *
 * GET /api/Vendors returns vendor/supplier records.
 *
 * Known response fields:
 *   id, name, email, phone, currency,
 *   leadTimeDays, isActive, status,
 *   address1, address2, city, state, country, postalCode
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawAdvanceProVendor {
  id?: string | number
  name?: string
  email?: string
  phone?: string
  currency?: string
  leadTimeDays?: number | string
  isActive?: boolean | string | number
  active?: boolean | string | number
  status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawAdvanceProVendor): Supplier {
  const externalId = String(raw.id ?? '')
  const isActive = pickBool(raw.isActive ?? raw.active)
    ?? ((raw.status ?? '').toString().toLowerCase() !== 'inactive')

  return {
    id: externalId,
    externalId,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive,
    platform: 'advance-pro',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
