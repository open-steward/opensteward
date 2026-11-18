import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface SpeedLedgerContact {
  id: number | string
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  postalCode?: string
  country?: string
  orgNumber?: string
  isCustomer?: boolean
  isSupplier?: boolean
  [key: string]: unknown
}

export function transformContact(raw: SpeedLedgerContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.orgNumber || undefined,
    isCustomer: raw.isCustomer ?? true,
    isSupplier: raw.isSupplier ?? false,
    isActive: true,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
