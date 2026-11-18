import type { Contact } from '../../../schema/contact'
import type { Email, Telephone } from '../../../schema/shared'

export interface DilovodContact {
  id: string
  name: string
  edrpou?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export function transformContact(raw: DilovodContact): Contact {
  const emails: Email[] = []
  if (raw.email) emails.push({ email: raw.email, type: 'WORK' })

  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.edrpou || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    emails: emails.length > 0 ? emails : undefined,
    telephones: telephones.length > 0 ? telephones : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
