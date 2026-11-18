/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail } from '../../shared/transform'

export interface SzamlazzhuContact {
  id: string | number
  name: string
  taxNumber?: string
  email?: string
  [key: string]: unknown
}

export function transformContact(raw: SzamlazzhuContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
