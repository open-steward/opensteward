/**
 * Orderbot supplier transform.
 *
 * Orderbot tracks vendors/suppliers for products.  The REST API exposes
 * a /suppliers (or /vendors) endpoint.  Field names follow the snake_case
 * convention used throughout the Orderbot API.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawOrderbotSupplier {
  id?: string | number
  name?: string
  email?: string
  phone?: string
  currency?: string
  lead_time_days?: number | string
  lead_time?: number | string
  active?: boolean | string | number
  status?: string
  contact_name?: string
  website?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawOrderbotSupplier): Supplier {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time_days) ?? pickNum(raw.lead_time),
    isActive:
      pickBool(raw.active) ??
      (raw.status !== undefined ? raw.status.toString().toLowerCase() !== 'inactive' : true),
    platform: 'orderbot',
    metadata: strMap({ status: raw.status, contactName: raw.contact_name, website: raw.website }),
    raw,
  }
}
