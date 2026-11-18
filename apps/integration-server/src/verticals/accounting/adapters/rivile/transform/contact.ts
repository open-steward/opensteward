import type { Contact } from '../../../schema/contact'
import { toWorkEmail } from '../../shared/transform'

export interface RivileContact {
  id: string | number
  name: string
  pvm_kodas?: string
  email?: string
  [key: string]: unknown
}

export function transformContact(raw: RivileContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.pvm_kodas || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
