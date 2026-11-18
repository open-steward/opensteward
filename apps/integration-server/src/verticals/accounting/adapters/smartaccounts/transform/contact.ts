import type { Contact } from '../../../schema/contact'
import { toWorkEmail } from '../../shared/transform'

export interface SmartaccountsContact {
  id: string | number
  name: string
  reg_code?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export function transformContact(raw: SmartaccountsContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.reg_code || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
