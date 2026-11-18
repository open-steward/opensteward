import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface MazeedOneClient {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  tax_reg_no: string
  is_customer: boolean
  is_supplier: boolean
  [key: string]: unknown
}

export interface MazeedOneSupplier {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  tax_reg_no: string
  is_customer: boolean
  is_supplier: boolean
  [key: string]: unknown
}

export function transformClient(raw: MazeedOneClient): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: `client_${String(raw.id)}`,
    name: raw.name || undefined,
    identification: raw.tax_reg_no || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: MazeedOneSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: `supp_${String(raw.id)}`,
    name: raw.name || undefined,
    identification: raw.tax_reg_no || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
