import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface MoneyForwardPartner {
  id: string
  name: string
  code: string | null
  email: string | null
  phone: string | null
  zip: string | null
  prefecture_code: string | null
  address1: string | null
  address2: string | null
  [key: string]: unknown
}

export function transformContact(raw: MoneyForwardPartner): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const billingAddress = toAddress({
    address1: raw.address1,
    address2: raw.address2,
    postalCode: raw.zip,
  })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}
