/**
 * Pesapal adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Pesapal v3 API provides no balance/ledger endpoint; settlement reporting is not exposed via REST.
 * Unavailable: dispute            — Pesapal v3 API has no dispute management endpoint; chargeback handling is not exposed via REST.
 * Unavailable: invoice            — Pesapal v3 API has no invoice endpoint; account_number on SubmitOrderRequest is an opaque reference, not a queryable invoice resource.
 * Unavailable: payment-method     — Pesapal v3 API has no stored payment-method management endpoint; only a masked payment_account string is returned in GetTransactionStatus.
 * Unavailable: payout             — Pesapal v3 API has no payout/settlement endpoint; merchant payouts are handled outside the API.
 * Unavailable: plan               — Pesapal v3 API has no plan/price/product catalog endpoint; recurring frequency is a parameter on SubmitOrderRequest, not a first-class resource.
 * Unavailable: subscription       — Pesapal v3 API has no subscription list/get endpoint; recurring payment metadata appears only inside GetTransactionStatus responses, not as a queryable resource.
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { PesapalClient } from './client'

import { transformRefund, type RawPesapalRefund } from './transform/refund'

const PESAPAL_NO_CUSTOMER =
  'the only documented GET endpoints are URLSetup/GetIpnList and Transactions/GetTransactionStatus; API 3.0 has no customer resource'
const PESAPAL_NO_CHARGE_LIST =
  'the only transaction read is "GetTransactionStatus?orderTrackingId=xxxxxxxxxxxx", a lookup by one order tracking id; no transaction list is documented'
const PESAPAL_NO_CHARGE_GET =
  'the only transaction read, GetTransactionStatus, needs a token from Auth/RequestToken (consumer_key + consumer_secret), which this connection does not collect'
const PESAPAL_NO_REFUND_LIST =
  'the only refund endpoint is the write-only POST Transactions/RefundRequest; no refund list or read is documented'

function notSupported(what: string, reason: string): Error {
  return Object.assign(new Error(`Pesapal cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class PesapalAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'pesapal'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Pesapal uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Pesapal uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Consumer Key',
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

  private client(credentials: Credentials): PesapalClient {
    return new PesapalClient(credentials)
  }

  // Pesapal API 3.0 documents nine requests (Postman collection linked from
  // https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference):
  // RequestToken, RegisterIPN, GetIpnList, SubmitOrderRequest (x2), stk,
  // GetTransactionStatus, RefundRequest, CancelOrder. None lists or reads
  // customers, charges or refunds, so these methods refuse before sending.

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported('list customers', PESAPAL_NO_CUSTOMER)
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported('get customers', PESAPAL_NO_CUSTOMER)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported('list charges', PESAPAL_NO_CHARGE_LIST)
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported('get charges', PESAPAL_NO_CHARGE_GET)
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported('list refunds', PESAPAL_NO_REFUND_LIST)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPesapalRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
