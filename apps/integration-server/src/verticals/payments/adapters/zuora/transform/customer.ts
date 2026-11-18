/**
 * Zuora Account -> canonical Customer.
 *
 * Zuora has no customer object: a customer is an Account. Fields are those of
 * `GET /object-query/accounts` ("List accounts",
 * https://developer.zuora.com/v1-api-reference/api/object-queries/queryaccounts.md),
 * with the bill-to contact expanded (`expand[]` enum value "billto"):
 *   data.id            "The unique identifier of the account."
 *   data.name          "The name of the account."
 *   data.currency      "A currency defined in the web-based UI administrative settings."
 *   data.balance       "The customer's total invoice balance minus credit balance."
 *   data.defaultPaymentMethodId "ID of the default payment method for the account."
 *   data.notes         "A string of up to 65,535 characters."
 *   data.createdDate / data.updatedDate
 *   data.billTo.workEmail "The contact's business email address."
 *   data.billTo.workPhone "The contact's business phone number."
 * Amounts are major-unit decimals (`balance: 7300` beside `currency: USD` in
 * the documented example).
 */

import { majorToMinor } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { toIsoDatetime, pickStr } from './shared'

export interface RawZuoraAccount {
  id: string
  accountNumber?: string
  name?: string | null
  currency?: string | null
  balance?: number | null
  defaultPaymentMethodId?: string | null
  notes?: string | null
  createdDate?: string | null
  updatedDate?: string | null
  billTo?: { workEmail?: string | null; workPhone?: string | null } | null
  [key: string]: unknown
}

export function transformCustomer(raw: RawZuoraAccount): Customer {
  const currency =
    typeof raw.currency === 'string' && raw.currency ? raw.currency.toUpperCase() : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.billTo?.workEmail),
    name: pickStr(raw.name),
    phone: pickStr(raw.billTo?.workPhone),
    defaultPaymentMethodId: pickStr(raw.defaultPaymentMethodId),
    currency,
    // A balance without its currency has no scale; omit it rather than guess one.
    balance:
      currency && typeof raw.balance === 'number' ? majorToMinor(raw.balance, currency) : undefined,
    description: pickStr(raw.notes),
    gateway: 'zuora',
    metadata: {},
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
