/**
 * Telr adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   refund (createRefund only — see notes)
// Unavailable: customer — no customer resource; details are sent inline with an order (listCustomers/getCustomer throw 501)
// Unavailable: charge/refund lists — Service API transaction lists are capped at 30 rows / 48h with no paging (throw 501)
// Unavailable: charge read — the documented lookup needs HTTP Basic merchant_id:api_key and no merchant ID is collected (getCharge throws 501)
// NOT VERIFIED: createRefund still POSTs a REST sub-path of /gateway/order.json that Telr does not document
// Unavailable: balance-transaction — no dedicated API endpoint; ledger entries are not exposed as a REST resource
// Unavailable: dispute — no dedicated dispute/chargeback API endpoint; chargebacks are handled outside the REST API
// Unavailable: plan — no plan catalog endpoint; recurring billing params are embedded in order creation, not listable plan objects
// Unavailable: subscription — repeat billing agreements have no list/get REST endpoint; initiated via order creation params only
// Unverified:  invoice — invoice creation endpoint exists but list/get endpoint and response field names are not publicly documented
// Unverified:  payment-method — stored cards feature exists but list/get endpoint and field names are not publicly documented
// Unverified:  payout — GET /api/v1/accounts/{accountId}/payouts confirmed but response JSON field names are not publicly documented

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { TelrClient } from './client'

import { transformRefund, type RawTelrRefund } from './transform/refund'

const RECENT_LIST_CAP =
  'This will provide a list of the most recent transactions processed within the last 48 hours. A maximum of 30 transactions will be included.'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class TelrAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'telr'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Telr uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Telr uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Auth Key',
        type: 'password',
        required: true,
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): TelrClient {
    return new TelrClient(credentials)
  }

  // Telr has no customer resource: "You can send these details by including
  // the following fields with the transaction request:"
  // (https://docs.telr.com/reference/customer-details). Nothing lists or reads
  // them back, and https://secure.telr.com/gateway/order.json is a single POST
  // RPC endpoint (https://docs.telr.com/reference/payment-page), not a REST base.
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Telr cannot list customers: customer details are only sent "with the transaction request" (https://docs.telr.com/reference/customer-details) and no endpoint lists them.',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Telr cannot read customers: customer details are only sent "with the transaction request" (https://docs.telr.com/reference/customer-details) and no endpoint returns them.',
    )
  }

  // The only documented transaction listing is the Service API "Recent
  // transaction list" (GET https://secure.telr.com/tools/api/xml/transaction),
  // which takes no parameters and is capped (https://docs.telr.com/reference/services).
  // A capped window is not a list: served as one, the sync would drop older rows.
  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      `Telr cannot list charges: "${RECENT_LIST_CAP}" (https://docs.telr.com/reference/services), with no parameter to page past it.`,
    )
  }

  // The only documented lookup is "https://secure.telr.com/tools/api/xml/transaction/{tranref}"
  // (https://docs.telr.com/reference/services), authenticated with HTTP Basic
  // merchant_id:api_key: "Service API uses the HTTP Basic Access Authentication
  // method." (https://docs.telr.com/reference/authentication). The adapter
  // collects no merchant ID, so it cannot build that request.
  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Telr cannot read charges: the documented transaction lookup (GET https://secure.telr.com/tools/api/xml/transaction/{tranref}, https://docs.telr.com/reference/services) needs HTTP Basic merchant_id:api_key (https://docs.telr.com/reference/authentication), and this connection has no merchant ID.',
    )
  }

  // Telr has no refund resource: a refund is one more row in the Service API
  // transaction lists, each capped "A maximum of 30 transactions will be
  // included." with no paging parameters (https://docs.telr.com/reference/services).
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      `Telr cannot list refunds: refunds are only rows in the Service API transaction lists, and "${RECENT_LIST_CAP}" (https://docs.telr.com/reference/services), with no parameter to page past it.`,
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawTelrRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
