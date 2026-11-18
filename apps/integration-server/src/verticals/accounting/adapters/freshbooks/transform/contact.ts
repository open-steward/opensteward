import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

export interface FreshBooksClient {
  id: number
  fname: string
  lname: string
  email: string
  organization: string
  work_phone: string
  mobile_phone: string
  currency_code: string
  p_street: string
  p_street2: string
  p_city: string
  p_code: string
  p_province: string
  p_country: string
  s_street: string
  s_street2: string
  s_city: string
  s_code: string
  s_country: string
  vis_state: number  // 0=active, 1=deleted, 2=archived
  [key: string]: unknown
}

export function transformClient(raw: FreshBooksClient): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.work_phone) telephones.push({ telephone: raw.work_phone, type: 'WORK' })
  if (raw.mobile_phone) telephones.push({ telephone: raw.mobile_phone, type: 'MOBILE' })

  return {
    id: String(raw.id),
    name: composeName(raw.organization, raw.fname, raw.lname),
    firstName: raw.fname || undefined,
    lastName: raw.lname || undefined,
    companyName: raw.organization || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.vis_state === 0,
    currency: raw.currency_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.p_street,
      address2: raw.p_street2,
      city: raw.p_city,
      postalCode: raw.p_code,
      region: raw.p_province,
      country: raw.p_country,
    }),
    shippingAddress: toAddress({
      address1: raw.s_street,
      address2: raw.s_street2,
      city: raw.s_city,
      postalCode: raw.s_code,
      country: raw.s_country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
