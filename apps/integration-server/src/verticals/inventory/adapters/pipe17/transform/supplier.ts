/**
 * Pipe17 /suppliers endpoint -> Supplier schema.
 *
 * Pipe17 supplier key fields (camelCase):
 *   supplierId, name, email, phone, currency, leadTimeDays,
 *   status, createdAt, updatedAt
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawPipe17Supplier {
  supplierId?: string
  name?: string
  email?: string
  phone?: string
  currency?: string
  leadTimeDays?: number | string
  status?: string
  active?: boolean | string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawPipe17Supplier): Supplier {
  const id = pickStr(raw.supplierId) ?? ''
  const isActive = raw.status
    ? raw.status.toLowerCase() !== 'inactive' && raw.status.toLowerCase() !== 'archived'
    : (pickBool(raw.active) ?? true)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive,
    platform: 'pipe17',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
