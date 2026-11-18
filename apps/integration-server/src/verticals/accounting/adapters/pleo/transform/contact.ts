/**
 * Transform Pleo employee to canonical Contact.
 *
 * Pleo API: GET /employees, GET /employees/{employeeId}
 * Response fields: id, firstName, lastName, email, jobTitle, phone, code, teamId
 *
 * Pleo REST API v1 surfaces employees as the primary contact entity.
 * They are mapped as internal contacts (isCustomer=false, isSupplier=false).
 *
 * Docs: https://developers.pleo.io/reference/getemployee
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone } from '../../../schema/shared'

export interface PleoEmployee {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  jobTitle?: string
  phone?: string
  code?: string
  teamId?: string
  [key: string]: unknown
}

export function transformEmployee(raw: PleoEmployee): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : []

  const nameParts = [raw.firstName, raw.lastName].filter(Boolean)
  return {
    id: raw.id,
    name: nameParts.length ? nameParts.join(' ') : undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    identification: raw.code || undefined,
    isCustomer: false,
    isSupplier: false,
    isActive: true,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
