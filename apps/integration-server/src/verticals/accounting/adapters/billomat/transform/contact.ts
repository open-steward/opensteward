import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface BillomatContact {
  id: string
  name: string
  company_name: string
  email: string
  phone: string
  fax: string
  street: string
  city: string
  state: string
  zip: string
  country_code: string
  tax_number: string
  vat_number: string
  is_customer: boolean
  is_supplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: BillomatContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK'), toPhone(raw.fax, 'FAX')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.vat_number || raw.tax_number || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country_code,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
