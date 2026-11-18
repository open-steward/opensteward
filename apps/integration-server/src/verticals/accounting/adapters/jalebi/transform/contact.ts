import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface JalebiCustomer {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  tax_registration: string
  type: string
  [key: string]: unknown
}

export interface JalebiSupplier {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  tax_registration: string
  type: string
  [key: string]: unknown
}

export function transformCustomer(raw: JalebiCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: `cust_${String(raw.id)}`,
    name: raw.name || undefined,
    identification: raw.tax_registration || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: JalebiSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: `supp_${String(raw.id)}`,
    name: raw.name || undefined,
    identification: raw.tax_registration || undefined,
    isCustomer: false,
    isSupplier: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
