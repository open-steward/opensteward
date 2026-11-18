import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName } from '../../shared/transform'

export interface ReckonAddress {
  address: string
  city: string
  state: string
  postCode: string
  country: string
  [key: string]: unknown
}

export interface ReckonContact {
  id: string
  displayName: string
  firstName: string
  lastName: string
  companyName: string
  email: string
  phone: string
  mobile: string
  fax: string
  abn: string
  isCustomer: boolean
  isSupplier: boolean
  currencyCode: string
  isActive: boolean
  billingAddress: ReckonAddress | null
  shippingAddress: ReckonAddress | null
  [key: string]: unknown
}

export function transformContact(raw: ReckonContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  const name = raw.displayName || composeName(raw.companyName, raw.firstName, raw.lastName)

  return {
    id: raw.id,
    name,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    identification: raw.abn || undefined,
    isCustomer: raw.isCustomer,
    isSupplier: raw.isSupplier,
    isActive: raw.isActive,
    currency: raw.currencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billingAddress
      ? toAddress({
          address1: raw.billingAddress.address,
          city: raw.billingAddress.city,
          region: raw.billingAddress.state,
          postalCode: raw.billingAddress.postCode,
          country: raw.billingAddress.country,
        })
      : undefined,
    shippingAddress: raw.shippingAddress
      ? toAddress({
          address1: raw.shippingAddress.address,
          city: raw.shippingAddress.city,
          region: raw.shippingAddress.state,
          postalCode: raw.shippingAddress.postCode,
          country: raw.shippingAddress.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
