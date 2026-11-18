import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, nonempty } from '../../shared/transform'

export interface KoraCustomer {
  id: string
  name?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export function transformContact(raw: KoraCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    metadata: raw as Record<string, unknown>,
  }
}
