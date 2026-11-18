/**
 * Transform Brex vendor records to the canonical Contact type.
 *
 * Endpoint: GET /v1/vendors, GET /v1/vendors/{id}, POST /v1/vendors
 *
 * Brex vendor shape:
 * {
 *   id: string
 *   company_name: string
 *   email?: string
 *   phone?: string
 *   payment_accounts?: Array<{
 *     type: string
 *     payment_instrument_id: string
 *     routing_number?: string
 *     account_number?: string
 *     account_type?: string
 *     account_class?: string
 *   }>
 * }
 *
 * Brex does not have a "customer" concept in its Payments API — all contacts
 * are payment vendors (accounts-payable counterparties).
 */

import type { Contact } from '../../../schema/contact'
import type { Email } from '../../../schema/shared'

export interface BrexPaymentAccount {
  type?: string
  payment_instrument_id?: string
  routing_number?: string
  account_number?: string
  account_type?: string
  account_class?: string
}

export interface BrexVendor {
  id: string
  company_name?: string
  email?: string
  phone?: string
  payment_accounts?: BrexPaymentAccount[]
  [key: string]: unknown
}

export function transformVendor(raw: BrexVendor): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []

  return {
    id: raw.id,
    name: raw.company_name || undefined,
    companyName: raw.company_name || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: true,
    emails: emails.length ? emails : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformVendor(contact: Partial<Contact>): Record<string, unknown> {
  return {
    company_name: contact.companyName ?? contact.name,
    email: contact.emails?.[0]?.email,
    phone: contact.telephones?.[0]?.telephone,
  }
}
