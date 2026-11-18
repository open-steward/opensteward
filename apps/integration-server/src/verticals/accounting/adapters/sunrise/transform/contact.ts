import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface SunriseContact {
  id: string
  display_name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  tax_number: string
  is_customer: boolean
  is_supplier: boolean
  is_active: boolean
  address: {
    line_1: string
    line_2: string
    city: string
    state: string
    postal_code: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: SunriseContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.display_name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.is_active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.address
      ? toAddress({
          address1: raw.address.line_1,
          address2: raw.address.line_2,
          city: raw.address.city,
          region: raw.address.state,
          postalCode: raw.address.postal_code,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
