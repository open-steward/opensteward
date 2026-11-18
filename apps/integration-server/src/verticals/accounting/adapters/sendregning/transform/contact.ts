import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface SendRegningContact {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    countryCode?: string
  }
  orgNo?: string
  isRecipient?: boolean
  active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: SendRegningContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.orgNo || undefined,
    isCustomer: raw.isRecipient ?? false,
    isSupplier: false,
    isActive: raw.active ?? true,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
