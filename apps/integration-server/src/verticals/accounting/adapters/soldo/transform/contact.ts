/**
 * Soldo employee → canonical Contact.
 *
 * Endpoint: GET /business/v2/employees, GET /business/v2/employees/{userId}
 *
 * Employee fields:
 *   id, name (first name), surname (last name), email, mobile,
 *   jobTitle, department, status, visible, groupId, customreferenceId
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone } from '../../../schema/shared'

export interface SoldoEmployee {
  id: string
  name?: string
  surname?: string
  email?: string
  mobile?: string
  jobTitle?: string
  department?: string
  status?: string
  visible?: boolean
  groupId?: string
  customreferenceId?: string
  [key: string]: unknown
}

function isActive(status?: string): boolean {
  if (!status) return true
  const s = status.toUpperCase()
  return s === 'ACTIVE' || s === 'PENDING'
}

export function transformEmployee(raw: SoldoEmployee): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = raw.mobile ? [{ telephone: raw.mobile, type: 'MOBILE' }] : []

  const fullName = [raw.name, raw.surname].filter(Boolean).join(' ') || undefined

  return {
    id: raw.id,
    name: fullName,
    firstName: raw.name ?? undefined,
    lastName: raw.surname ?? undefined,
    isCustomer: false,
    isSupplier: false,
    isActive: isActive(raw.status),
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
