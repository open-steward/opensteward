import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, nonempty } from '../../shared/transform'

export interface PagaCustomer {
  customerPublicId?: string
  displayName?: string
  firstName?: string
  lastName?: string
  emailAddress?: string
  phoneNumber?: string
  [key: string]: unknown
}

export function transformContact(raw: PagaCustomer): Contact {
  const emails = toWorkEmail(raw.emailAddress)
  const phone = toPhone(raw.phoneNumber)
  const telephones = phone ? [phone] : []
  const name = raw.displayName || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined

  return {
    id: raw.customerPublicId || String(Math.random()),
    name,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    metadata: raw as Record<string, unknown>,
  }
}
