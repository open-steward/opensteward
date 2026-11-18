import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface HorizonErpContact {
  id: string
  name: string
  email: string
  phone: string
  address: string
  gstin: string
  customer: boolean
  supplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: HorizonErpContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.gstin || undefined,
    isCustomer: Boolean(raw.customer),
    isSupplier: Boolean(raw.supplier),
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
