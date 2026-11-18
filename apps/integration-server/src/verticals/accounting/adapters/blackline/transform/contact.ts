import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, nonempty } from '../../shared/transform'

export interface BlacklineContact {
  userId: string
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformContact(raw: BlacklineContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.userId),
    name: raw.name || undefined,
    isCustomer: false,
    isSupplier: false,
    isActive: raw.isActive ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    metadata: raw as Record<string, unknown>,
  }
}
