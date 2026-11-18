/**
 * VosFactures → canonical Contact transform.
 *
 * VosFactures has a single "clients" resource that covers both customers and
 * suppliers.  The `company` boolean distinguishes businesses from individuals.
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

// ── VosFactures raw shape ─────────────────────────────────────────────────

export interface VosFacturesClient {
  id: number
  name?: string
  first_name?: string
  last_name?: string
  company?: boolean | string
  tax_no?: string
  post_code?: string
  city?: string
  street?: string
  country?: string
  email?: string
  phone?: string
  mobile_phone?: string
  note?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────

export function transformContact(raw: VosFacturesClient): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile_phone) telephones.push({ telephone: raw.mobile_phone, type: 'MOBILE' })

  const isCompany = raw.company === true || raw.company === 'true' || raw.company === '1'

  return {
    id: String(raw.id),
    name: composeName(
      isCompany ? (raw.name || undefined) : undefined,
      raw.first_name || undefined,
      raw.last_name || undefined,
    ) || raw.name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: isCompany ? (raw.name || undefined) : undefined,
    taxNumber: raw.tax_no || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.post_code,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
