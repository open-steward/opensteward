import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface ProfitBooksContact {
  id: string
  name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  tax_number: string
  is_customer: boolean
  is_supplier: boolean
  is_active: boolean
  billing_address: {
    address1: string
    city: string
    state: string
    postal_code: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: ProfitBooksContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.is_active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billing_address
      ? toAddress({
          address1: raw.billing_address.address1,
          city: raw.billing_address.city,
          region: raw.billing_address.state,
          postalCode: raw.billing_address.postal_code,
          country: raw.billing_address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
