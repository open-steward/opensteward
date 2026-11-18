import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface FinancioContact {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  city: string
  postcode: string
  state: string
  country: string
  is_customer: boolean
  is_supplier: boolean
  currency_code: string
  reg_no: string
  tax_no: string
  credit_limit: number
  is_active: boolean
  [key: string]: unknown
}

export function transformContact(raw: FinancioContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.reg_no || undefined,
    taxNumber: raw.tax_no || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.is_active,
    currency: raw.currency_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postcode,
      region: raw.state,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
