import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface FatouaClient {
  id: string
  name?: string
  email?: string
  mobile?: string
  address?: string
  vat_number?: string
  is_customer?: boolean
  is_supplier?: boolean
  [key: string]: unknown
}

export interface FatouaSupplier {
  id: string
  name?: string
  email?: string
  mobile?: string
  address?: string
  vat_number?: string
  is_customer?: boolean
  is_supplier?: boolean
  [key: string]: unknown
}

function buildContact(raw: FatouaClient | FatouaSupplier, isCustomer: boolean, isSupplier: boolean): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.mobile, 'MOBILE')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.is_customer !== undefined ? raw.is_customer : isCustomer,
    isSupplier: raw.is_supplier !== undefined ? raw.is_supplier : isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformClient(raw: FatouaClient): Contact {
  return buildContact(raw, true, false)
}

export function transformSupplier(raw: FatouaSupplier): Contact {
  return buildContact(raw, false, true)
}
