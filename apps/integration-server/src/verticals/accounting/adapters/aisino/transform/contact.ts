import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface AisinoContact {
  buyerId?: string
  buyerName?: string
  buyerEmail?: string
  buyerPhone?: string
  taxNo?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: AisinoContact): Contact {
  return {
    id: raw.buyerId ? String(raw.buyerId) : '',
    name: raw.buyerName || undefined,
    emails: raw.buyerEmail ? [{ email: raw.buyerEmail, type: 'WORK' }] : undefined,
    telephones: raw.buyerPhone ? [{ telephone: raw.buyerPhone, type: 'WORK' }] : undefined,
    taxNumber: raw.taxNo || undefined,
    billingAddress: (raw.city || raw.country) ? {
      city: raw.city || undefined,
      country: toIso3166Alpha2(raw.country),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
