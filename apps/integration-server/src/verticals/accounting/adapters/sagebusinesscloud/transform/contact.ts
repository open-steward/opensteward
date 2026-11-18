import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface SageContactAddress {
  address_line_1?: string
  city?: string
  postal_code?: string
  region?: string
  country?: { id?: string }
  [key: string]: unknown
}

export interface SageContact {
  id: string
  name?: string
  email?: string
  mobile?: string
  phone?: string
  main_address?: SageContactAddress
  is_customer?: boolean
  is_supplier?: boolean
  [key: string]: unknown
}

export function transformContact(raw: SageContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })

  return {
    id: raw.id,
    name: raw.name || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.main_address
      ? toAddress({
          address1: raw.main_address.address_line_1,
          city: raw.main_address.city,
          postalCode: raw.main_address.postal_code,
          region: raw.main_address.region,
          country: raw.main_address.country?.id,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
