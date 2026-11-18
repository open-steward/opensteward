import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import type { Telephone } from '../../../schema/shared'

export interface AxonautContact {
  id: string
  name: string
  siret: string
  vat_number: string
  email: string
  phone: string
  address: string
  zip_code: string
  city: string
  country: string
  is_prospect: boolean
  is_customer: boolean
  is_supplier: boolean
  is_active: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: AxonautContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.siret || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    isActive: raw.is_active ?? true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
