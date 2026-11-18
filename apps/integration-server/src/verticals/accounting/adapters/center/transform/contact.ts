import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface CenterContact {
  id: string
  name: string
  email: string
  phone: string
  companyName: string
  taxNumber: string
  isCustomer: boolean
  isSupplier: boolean
  billingAddress: {
    line1: string
    line2: string
    city: string
    state: string
    zip: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: CenterContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(Boolean) as NonNullable<
    ReturnType<typeof toPhone>
  >[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.companyName || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: raw.isCustomer,
    isSupplier: raw.isSupplier,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billingAddress
      ? toAddress({
          address1: raw.billingAddress.line1,
          address2: raw.billingAddress.line2,
          city: raw.billingAddress.city,
          region: raw.billingAddress.state,
          postalCode: raw.billingAddress.zip,
          country: raw.billingAddress.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
