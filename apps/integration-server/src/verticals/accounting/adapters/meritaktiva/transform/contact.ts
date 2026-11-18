import type { Contact } from '../../../schema/contact'
import { toWorkEmail } from '../../shared/transform'

export interface MeritaktivaContact {
  Id: string | number
  Name: string
  RegCode?: string
  Email?: string
  [key: string]: unknown
}

export function transformContact(raw: MeritaktivaContact): Contact {
  const emails = toWorkEmail(raw.Email)
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    taxNumber: raw.RegCode || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
