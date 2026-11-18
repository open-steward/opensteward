/**
 * Transform a Yooz Rising supplier record into a canonical Contact.
 *
 * Yooz is an AP platform so contacts are suppliers/vendors only.
 * The supplier endpoint returns vendor master data used to match
 * incoming documents during the AP workflow.
 */
import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Yooz supplier record ──────────────────────────────────────────────────────

export interface YoozSupplier {
  id?: string | number
  name?: string
  legalName?: string
  siret?: string          // French company registration (SIRET)
  vatNumber?: string
  email?: string
  phone?: string
  address?: string
  address2?: string
  city?: string
  zipCode?: string
  countryCode?: string
  currency?: string
  isActive?: boolean
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformSupplier(raw: YoozSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = raw.phone
    ? [{ telephone: raw.phone, type: 'WORK' as const }]
    : []

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || raw.legalName || undefined,
    companyName: raw.legalName || raw.name || undefined,
    identification: raw.siret || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.isActive !== undefined ? raw.isActive : true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      address2: raw.address2,
      city: raw.city,
      postalCode: raw.zipCode,
      country: raw.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
