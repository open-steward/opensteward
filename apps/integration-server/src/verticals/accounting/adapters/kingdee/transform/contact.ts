import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface KingdeeContact {
  custId?: string
  custName?: string
  email?: string
  phone?: string
  taxNo?: string
  address?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: KingdeeContact): Contact {
  return {
    id: raw.custId ? String(raw.custId) : '',
    name: raw.custName || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.taxNo || undefined,
    billingAddress: (raw.address || raw.city || raw.country) ? {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      country: toIso3166Alpha2(raw.country),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
