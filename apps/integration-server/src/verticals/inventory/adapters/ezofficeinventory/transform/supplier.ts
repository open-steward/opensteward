/**
 * EZO vendor/supplier transform.
 *
 * List endpoint: GET /api/v2/vendors  → { vendors: [...], metadata: { next_page } }
 * Single:        GET /api/v2/vendors/:id → { vendor: {...} }
 *
 * Key EZO response fields:
 *   id, name, email, phone_number, fax, website, address,
 *   contact_person_name, description, status ("active" | "inactive")
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawEZOVendor {
  id: number | string
  name?: string
  email?: string
  /** EZO v2 uses "phone" (not "phone_number") for vendor phone */
  phone?: string
  fax?: string
  website?: string
  address?: string
  contact_person_name?: string
  description?: string
  /** EZO v2 vendor status is a boolean (true=active) */
  status?: boolean | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawEZOVendor): Supplier {
  const idStr = String(raw.id)

  return {
    id: idStr,
    externalId: idStr,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    // EZO v2 vendor status is a boolean (true=active); also handle string legacy
    isActive: typeof raw.status === 'boolean' ? raw.status : (raw.status ?? 'true') !== 'false',
    platform: 'ezofficeinventory',
    metadata: strMap({
      contactPerson: raw.contact_person_name,
      website: raw.website,
      fax: raw.fax,
      address: raw.address,
      status: raw.status,
    }),
    raw,
  }
}
