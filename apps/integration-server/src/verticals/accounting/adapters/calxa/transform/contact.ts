import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

/**
 * Calxa contact record as returned by GET /contacts and GET /contacts/:id.
 *
 * A contact may be a customer, a supplier, or both.  The `isCustomer` /
 * `isSupplier` flags control which role(s) apply.
 */
export interface CalxaContact {
  id: string
  name?: string
  /** Organisation registration / company number. */
  taxNumber?: string
  emailAddress?: string
  /** Primary phone number. */
  phone?: string
  isCustomer?: boolean
  isSupplier?: boolean
  isActive?: boolean
  /** ISO 4217 default currency for transactions with this contact. */
  currency?: string
  addresses?: Array<{
    type?: string // "POBOX" | "STREET" | "DELIVERY" | "BILLING"
    line1?: string
    line2?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: CalxaContact): Contact {
  const emails = toWorkEmail(raw.emailAddress)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const billingAddr = (raw.addresses ?? []).find(
    (a) => a.type === 'BILLING' || a.type === 'STREET' || a.type === 'POBOX',
  )
  const shippingAddr = (raw.addresses ?? []).find((a) => a.type === 'DELIVERY')

  return {
    id: raw.id,
    name: raw.name || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: raw.isCustomer ?? undefined,
    isSupplier: raw.isSupplier ?? undefined,
    isActive: raw.isActive ?? undefined,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: billingAddr
      ? toAddress({
          address1: billingAddr.line1,
          address2: billingAddr.line2,
          city: billingAddr.city,
          region: billingAddr.region,
          postalCode: billingAddr.postalCode,
          country: billingAddr.country,
        })
      : undefined,
    shippingAddress: shippingAddr
      ? toAddress({
          address1: shippingAddr.line1,
          address2: shippingAddr.line2,
          city: shippingAddr.city,
          region: shippingAddr.region,
          postalCode: shippingAddr.postalCode,
          country: shippingAddr.country,
        })
      : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
