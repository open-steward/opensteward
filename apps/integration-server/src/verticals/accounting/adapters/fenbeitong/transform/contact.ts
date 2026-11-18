import type { Contact } from '../../../schema/contact'

export interface FenbeitongContact {
  employeeId?: string
  employeeName?: string
  email?: string
  phone?: string
  department?: string
  [key: string]: unknown
}

export function transformContact(raw: FenbeitongContact): Contact {
  return {
    id: raw.employeeId ? String(raw.employeeId) : '',
    name: raw.employeeName || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    billingAddress: raw.department ? {
      address1: raw.department || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
