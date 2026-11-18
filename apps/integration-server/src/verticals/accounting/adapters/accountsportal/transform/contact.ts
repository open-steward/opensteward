import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

// AccountsPortal contact (customer or supplier) wire shape
export interface APContact {
  id: number
  name: string
  company_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  vat_number: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  region: string | null
  postcode: string | null
  country: string | null
  // AccountsPortal separates customers and suppliers into different endpoints;
  // this field is populated by the adapter from the fetch path.
  contact_type: 'customer' | 'supplier'
  is_active: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformContact(raw: APContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [
    toPhone(raw.phone, 'WORK'),
    toPhone(raw.mobile, 'MOBILE'),
  ].filter(Boolean) as NonNullable<ReturnType<typeof toPhone>>[]

  const isCustomer = raw.contact_type === 'customer'
  const isSupplier = raw.contact_type === 'supplier'

  return {
    id: `${raw.contact_type[0]}_${raw.id}`,
    name: raw.name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.is_active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_line_1,
      address2: raw.address_line_2,
      city: raw.city,
      region: raw.region,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
