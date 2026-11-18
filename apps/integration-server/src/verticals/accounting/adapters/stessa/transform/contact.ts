import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface StessaContact {
  id: string
  name: string
  email: string
  phone: string
  companyName: string
  taxNumber: string
  isCustomer: boolean
  isSupplier: boolean
  billingAddress: {
    address1: string
    city: string
    state: string
    postalCode: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: StessaContact): Contact {
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
          address1: raw.billingAddress.address1,
          city: raw.billingAddress.city,
          region: raw.billingAddress.state,
          postalCode: raw.billingAddress.postalCode,
          country: raw.billingAddress.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
