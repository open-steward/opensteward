import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import type { Telephone } from '../../../schema/shared'

export interface ParasutContact {
  id: string
  type: string
  attributes: {
    name?: string
    contact_type?: string  // 'person' | 'company'
    email?: string
    phone?: string
    city?: string
    district?: string
    country?: string
    tax_number?: string
    is_customer?: boolean
    is_supplier?: boolean
  }
  [key: string]: unknown
}

export function transformContact(raw: ParasutContact): Contact {
  const attrs = raw.attributes ?? {}
  const emails = toWorkEmail(attrs.email)
  const telephones: Telephone[] = []
  if (attrs.phone) telephones.push({ telephone: attrs.phone, type: 'WORK' })

  return {
    id: raw.id,
    name: attrs.name || undefined,
    taxNumber: attrs.tax_number || undefined,
    isCustomer: attrs.is_customer ?? true,
    isSupplier: attrs.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      city: attrs.city,
      region: attrs.district,
      country: attrs.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
