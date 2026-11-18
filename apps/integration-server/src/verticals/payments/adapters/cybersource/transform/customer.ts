/**
 * Cybersource Customer transform.
 *
 * Cybersource stores recurring-billing customers as "Customer Payment
 * Instruments" via its Token Management Service (TMS). The minimal
 * customer record returned by GET /tms/v1/customers/{id} is used here.
 *
 * Docs: https://developer.cybersource.com/api/reference/api-reference.html#tms-customers
 */

import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawCybersourceCustomer {
  id?: string
  clientReferenceInformation?: { code?: string }
  buyerInformation?: {
    merchantCustomerId?: string
    email?: string
    firstName?: string
    lastName?: string
    company?: string
  }
  merchantDefinedInformation?: Array<{ name?: string; value?: string }>
  _embedded?: {
    defaultPaymentInstrument?: { id?: string }
  }
  submitTimeUtc?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawCybersourceCustomer): Customer {
  const buyer = raw.buyerInformation
  const name = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ').trim() || undefined

  return {
    id: String(raw.id ?? raw.clientReferenceInformation?.code ?? ''),
    externalId: String(raw.id ?? ''),
    email: buyer?.email ?? undefined,
    name: name ?? undefined,
    defaultPaymentMethodId: raw._embedded?.defaultPaymentInstrument?.id ?? undefined,
    gateway: 'cybersource',
    metadata: strMap({
      merchantCustomerId: buyer?.merchantCustomerId,
      company: buyer?.company,
      clientReferenceCode: raw.clientReferenceInformation?.code,
    }),
    createdAt: raw.submitTimeUtc ?? undefined,
    raw,
  }
}
