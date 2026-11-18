import type { Contact } from '../../../schema/contact'
import { toWorkEmail } from '../../shared/transform'

export interface SmartbillContact {
  id: string | number
  name: string
  cif?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export function transformContact(raw: SmartbillContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.cif || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
