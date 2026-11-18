import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface AkauntingContact {
  id: number
  name: string
  email: string
  phone: string
  tax_number: string
  currency_code: string
  type: string
  enabled: boolean
  address: string
  city: string
  zip_code: string
  state: string
  country: string
  website: string
  [key: string]: unknown
}

export function transformContact(raw: AkauntingContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(Boolean) as NonNullable<
    ReturnType<typeof toPhone>
  >[]

  const isCustomer = raw.type === 'customer'
  const isSupplier = raw.type === 'vendor'

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.enabled ?? true,
    currency: raw.currency_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
      region: raw.state,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
