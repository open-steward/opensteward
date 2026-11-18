import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, composeName, nonempty } from '../../shared/transform'

export interface PatriotContact {
  id: string
  name: string
  email: string
  phone: string
  company_name: string
  tax_id: string
  address: {
    line1: string
    city: string
    state: string
    zip: string
    country: string
  }
  [key: string]: unknown
}

export function transformContact(raw: PatriotContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: composeName(raw.company_name, raw.name),
    companyName: raw.company_name || undefined,
    taxNumber: raw.tax_id || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    currency: 'USD',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address?.line1,
      city: raw.address?.city,
      region: raw.address?.state,
      postalCode: raw.address?.zip,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
