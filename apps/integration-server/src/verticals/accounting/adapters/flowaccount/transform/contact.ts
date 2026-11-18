import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface FlowAccountContact {
  id: string | number
  contactCode: string
  contactName: string
  contactType: string
  email: string
  phone: string
  address: string
  province: string
  postCode: string
  countryNameEN: string
  taxId: string
  [key: string]: unknown
}

export function transformContact(raw: FlowAccountContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.contactName || undefined,
    identification: raw.taxId || undefined,
    isCustomer: raw.contactType === '1' || raw.contactType === '3',
    isSupplier: raw.contactType === '2' || raw.contactType === '3',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      region: raw.province,
      postalCode: raw.postCode,
      country: toIso3166Alpha2(raw.countryNameEN),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
