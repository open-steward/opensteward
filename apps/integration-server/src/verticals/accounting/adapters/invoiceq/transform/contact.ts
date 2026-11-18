import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface InvoiceqCustomer {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: string
  tax_number?: string
  contact_type?: string
  [key: string]: unknown
}

export interface InvoiceqSupplier {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: string
  tax_number?: string
  contact_type?: string
  [key: string]: unknown
}

function buildContact(raw: InvoiceqCustomer | InvoiceqSupplier, isCustomer: boolean, isSupplier: boolean): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer,
    isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCustomer(raw: InvoiceqCustomer): Contact {
  return buildContact(raw, true, false)
}

export function transformSupplier(raw: InvoiceqSupplier): Contact {
  return buildContact(raw, false, true)
}
