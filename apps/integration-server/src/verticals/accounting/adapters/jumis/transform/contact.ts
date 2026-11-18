import type { Contact } from '../../../schema/contact'
import { toWorkEmail } from '../../shared/transform'

export interface JumisContact {
  id: string | number
  name: string
  reg_nr?: string
  email?: string
  [key: string]: unknown
}

export function transformContact(raw: JumisContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.reg_nr || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
