import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface KwaraMember {
  id: string
  full_name?: string
  email?: string
  phone_number?: string
  address?: string
  [key: string]: unknown
}

export function transformContact(raw: KwaraMember): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone_number)
  const telephones = phone ? [phone] : []

  return {
    id: raw.id,
    name: raw.full_name || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
