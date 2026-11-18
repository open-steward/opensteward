import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface FreeePartnerAddress {
  prefecture_code: string | null
  street_name: string | null
  city: string | null
  [key: string]: unknown
}

export interface FreeePartner {
  id: number
  name: string
  display_name: string | null
  email: string | null
  phone: string | null
  country_code: string | null
  long_name: string | null
  address_attributes: FreeePartnerAddress | null
  payer_walletable_id: number | null
  [key: string]: unknown
}

export function transformContact(raw: FreeePartner): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const addrAttrs = raw.address_attributes
  const billingAddress = toAddress({
    address1: addrAttrs?.street_name,
    city: addrAttrs?.city,
    country: raw.country_code,
  })

  return {
    id: String(raw.id),
    name: raw.display_name || raw.name || undefined,
    isCustomer: true,
    isSupplier: raw.payer_walletable_id != null,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}
