import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

export interface ZohoBooksContact {
  contact_id: string
  contact_name: string
  company_name: string
  contact_type: 'customer' | 'vendor'
  status: 'active' | 'inactive'
  email: string
  phone: string
  mobile: string
  currency_code: string
  billing_address?: {
    address: string
    city: string
    state: string
    zip: string
    country: string
  }
  shipping_address?: {
    address: string
    city: string
    state: string
    zip: string
    country: string
  }
  [key: string]: unknown
}

export function transformContact(raw: ZohoBooksContact): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })

  const toAddr = (a: ZohoBooksContact['billing_address']): Address | undefined =>
    a ? { address1: a.address || undefined, city: a.city || undefined, postalCode: a.zip || undefined, country: a.country || undefined } : undefined

  return {
    id: raw.contact_id,
    name: raw.contact_name || undefined,
    companyName: raw.company_name || undefined,
    isCustomer: raw.contact_type === 'customer',
    isSupplier: raw.contact_type === 'vendor',
    isActive: raw.status === 'active',
    currency: raw.currency_code || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: toAddr(raw.billing_address),
    shippingAddress: toAddr(raw.shipping_address),
    metadata: raw as Record<string, unknown>,
  }
}
