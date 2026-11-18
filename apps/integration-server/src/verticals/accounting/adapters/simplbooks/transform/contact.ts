import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

// SimplBooks client / supplier (business partner)
// The same endpoint covers both clients (isCustomer) and suppliers (isSupplier).
export interface SimplbooksContact {
  id: number
  name?: string | null
  reg_code?: string | null       // company registration number
  vat_number?: string | null
  email?: string | null
  phone?: string | null
  // type: 'client' | 'supplier' | 'both'
  type?: string | null
  is_active?: boolean | null
  currency?: string | null
  address?: string | null
  city?: string | null
  postal_code?: string | null
  country?: string | null        // ISO 3166-1 alpha-2
  [key: string]: unknown
}

export function transformContact(raw: SimplbooksContact): Contact {
  const type = (raw.type ?? '').toLowerCase()
  const emails = toWorkEmail(raw.email)
  const phones = [toPhone(raw.phone, 'WORK')].filter(
    (p): p is NonNullable<typeof p> => p != null,
  )

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    identification: raw.reg_code || undefined,
    isCustomer: type === 'client' || type === 'both',
    isSupplier: type === 'supplier' || type === 'both',
    isActive: raw.is_active ?? undefined,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
