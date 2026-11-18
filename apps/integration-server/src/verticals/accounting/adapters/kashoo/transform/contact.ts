import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface KashooContact {
  id: string
  name: string
  email: string
  phone: string
  company_name: string
  tax_number: string
  is_customer: boolean
  is_supplier: boolean
  billing_address: {
    line1: string
    line2: string
    city: string
    state: string
    zip: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: KashooContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billing_address
      ? toAddress({
          address1: raw.billing_address.line1,
          city: raw.billing_address.city,
          region: raw.billing_address.state,
          postalCode: raw.billing_address.zip,
          country: raw.billing_address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
