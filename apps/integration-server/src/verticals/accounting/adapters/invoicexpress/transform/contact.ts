import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty, composeName } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface InvoiceXpressContact {
  id: number
  name: string
  organization_name: string
  email: string
  phone: string
  address: string
  city: string
  postal_code: string
  country: string
  tax_id: string
  website: string
  [key: string]: unknown
}

export function transformContact(raw: InvoiceXpressContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: composeName(raw.organization_name, raw.name) || undefined,
    identification: raw.tax_id || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postal_code,
      country: toIso3166Alpha2(raw.country),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
