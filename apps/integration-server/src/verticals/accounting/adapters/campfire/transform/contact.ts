import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

/**
 * Campfire uses a unified vendor object for both customers and vendors/suppliers.
 * vendor_type: 'customer' | 'vendor' | 'employee'
 */
export interface CampfireVendor {
  id: number
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone_number?: string | null
  mobile_number?: string | null
  website?: string | null
  vendor_type?: string | null
  status?: string | null
  business_id_ssn?: string | null
  vat_number?: string | null
  address_street_1?: string | null
  address_street_2?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
  billing_address_street_1?: string | null
  billing_address_street_2?: string | null
  billing_city?: string | null
  billing_state?: string | null
  billing_zip_code?: string | null
  billing_country?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  [key: string]: unknown
}

export function transformVendor(raw: CampfireVendor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone_number) telephones.push({ telephone: raw.phone_number, type: 'WORK' })
  if (raw.mobile_number) telephones.push({ telephone: raw.mobile_number, type: 'MOBILE' })

  const vendorType = (raw.vendor_type ?? '').toLowerCase()
  const isCustomer = vendorType === 'customer'
  const isSupplier = vendorType === 'vendor' || vendorType === 'employee'

  return {
    id: String(raw.id),
    name: composeName(raw.company_name, raw.first_name, raw.last_name) || raw.name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.vat_number || undefined,
    identification: raw.business_id_ssn || undefined,
    isCustomer,
    isSupplier,
    isActive: (raw.status ?? '').toUpperCase() === 'ACTIVE',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.billing_address_street_1,
      address2: raw.billing_address_street_2,
      city: raw.billing_city,
      region: raw.billing_state,
      postalCode: raw.billing_zip_code,
      country: raw.billing_country,
    }),
    shippingAddress: toAddress({
      address1: raw.address_street_1,
      address2: raw.address_street_2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip_code,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
