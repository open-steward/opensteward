import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface ChanjetContact {
  customerId?: string
  customerName?: string
  email?: string
  mobilePhone?: string
  taxNo?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: ChanjetContact): Contact {
  return {
    id: raw.customerId ? String(raw.customerId) : '',
    name: raw.customerName || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.mobilePhone ? [{ telephone: raw.mobilePhone, type: 'WORK' }] : undefined,
    taxNumber: raw.taxNo || undefined,
    billingAddress: (raw.city || raw.country) ? {
      city: raw.city || undefined,
      country: toIso3166Alpha2(raw.country),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
