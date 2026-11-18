/**
 * Invoiced Customer → canonical Contact transform.
 *
 * Invoiced has a single "Customer" concept (no separate supplier entity).
 * Docs: https://developer.invoiced.com/api/customers
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface InvoicedCustomer {
  id: number
  object: string
  name: string
  number: string | null
  email: string | null
  type: string | null
  country: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  phone: string | null
  attention_to: string | null
  tax_id: string | null
  taxable: boolean
  currency: string | null
  payment_terms: string | null
  autopay: boolean
  credit_hold: boolean
  notes: string | null
  portal_url: string | null
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  [key: string]: unknown
}

export function transformContact(raw: InvoicedCustomer): Contact {
  const emails = toWorkEmail(raw.email ?? undefined)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    companyName: raw.type === 'company' ? (raw.name || undefined) : undefined,
    identification: raw.number || undefined,
    taxNumber: raw.tax_id || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: !raw.credit_hold,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    portalUrl: raw.portal_url || undefined,
    createdAt: raw.created_at ? new Date(raw.created_at * 1000) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
