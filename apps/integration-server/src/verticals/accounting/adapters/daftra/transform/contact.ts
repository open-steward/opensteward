import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty, composeName } from '../../shared/transform'

export interface DaftraClient {
  id: string | number
  business_name?: string
  first_name?: string
  last_name?: string
  email?: string
  phone1?: string
  address1?: string
  city?: string
  state?: string
  postal_code?: string
  country_code?: string
  bn1?: string
  [key: string]: unknown
}

export interface DaftraSupplier {
  id: string | number
  business_name?: string
  first_name?: string
  last_name?: string
  email?: string
  phone1?: string
  address1?: string
  city?: string
  state?: string
  postal_code?: string
  country_code?: string
  bn1?: string
  [key: string]: unknown
}

function transformClientRecord(raw: DaftraClient | DaftraSupplier, isCustomer: boolean, isSupplier: boolean): Contact {
  const name = raw.business_name || composeName(raw.first_name, raw.last_name) || undefined
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone1, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name,
    taxNumber: raw.bn1 || undefined,
    isCustomer,
    isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address1,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_code,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformClient(raw: DaftraClient): Contact {
  return transformClientRecord(raw, true, false)
}

export function transformSupplier(raw: DaftraSupplier): Contact {
  return transformClientRecord(raw, false, true)
}
