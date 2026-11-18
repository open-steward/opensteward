import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface HoldedContact {
  id: string
  name: string
  email: string
  phone: string
  mobile: string
  vatnumber: string
  tradeName: string
  type: string
  billAddress: {
    address: string
    city: string
    province: string
    postalCode: string
    country: string
  } | null
  isPerson: boolean
  [key: string]: unknown
}

export function transformContact(raw: HoldedContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK'), toPhone(raw.mobile, 'MOBILE')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.tradeName || undefined,
    taxNumber: raw.vatnumber || undefined,
    isCustomer: raw.type === 'client',
    isSupplier: raw.type === 'supplier',
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billAddress
      ? toAddress({
          address1: raw.billAddress.address,
          city: raw.billAddress.city,
          region: raw.billAddress.province,
          postalCode: raw.billAddress.postalCode,
          country: raw.billAddress.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
