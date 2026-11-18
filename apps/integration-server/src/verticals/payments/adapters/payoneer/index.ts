/**
 * Payoneer adapter — payments vertical.
 *
 * Every read method refuses with 501 before sending a request. Payoneer's v4
 * API is published as two first-party OpenAPI exports (Stoplight project
 * cHJqOjEwNzYxNg, embedded by
 * https://developer.payoneer.com/docs/mass-payouts-and-services.html):
 * "Open APIs.oas2.yml" (27 operations) and "Mass Payout V4.oas2.yml"
 * (8 operations). Neither has a /customers, /charges, /refunds or /payouts
 * collection. Its Common Calling Conventions article says "The method name
 * will be prefixed by the name of the entity to which the call applies, for
 * example /accounts/.", and the single-item reads it does publish are scoped
 * by a program_id or account_id this adapter has no source for:
 * - GET /programs/{program_id}/payees/{payee_id}/status
 * - GET /programs/{program_id}/payouts/{client_reference_id}/status
 * - GET /accounts/{account_id}/payments/{payment_id}
 *
 * Auth (unchanged): OAuth 2 authorization code against
 * login.payoneer.com/api/v2 (see auth.ts).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { DEFAULT_SCOPES } from './constants'

export interface PayoneerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_CUSTOMERS =
  'Payoneer cannot list customers: its v4 API has no /customers resource. The nearest entity is a payee, readable only one at a time by "/programs/{program_id}/payees/{payee_id}/status", and no operation lists payees.'
const NO_CHARGES =
  'Payoneer cannot list charges: its v4 API has no /charges resource. A charge is created by "/accounts/{account_id}/balances/{balance_id}/payments/debit", and no operation lists them.'
const NO_REFUNDS =
  'Payoneer cannot list refunds: its v4 API has no refund resource; none of its 35 published operations is a refund.'
const NO_PAYOUTS =
  'Payoneer cannot list payouts: its v4 API has no list operation for payouts. It documents only POST /programs/{program_id}/masspayouts, GET "/programs/{program_id}/payouts/{client_reference_id}/status" and PUT .../cancel.'

export class PayoneerAdapter implements PaymentsAdapter {
  readonly platform = 'payoneer'
  readonly version = '0.2.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PayoneerAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials, this.clientId, this.clientSecret)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(NO_CUSTOMERS)
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(NO_CUSTOMERS.replace('cannot list customers', 'cannot read customers'))
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(NO_CHARGES)
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Payoneer cannot read charges: its v4 API has no /charges resource. The only payment read, "/accounts/{account_id}/payments/{payment_id}", needs an account_id this connection does not carry.',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(NO_REFUNDS)
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(NO_REFUNDS.replace('cannot list refunds', 'cannot read refunds'))
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(NO_PAYOUTS)
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'Payoneer cannot read payouts: its only payout read, "/programs/{program_id}/payouts/{client_reference_id}/status", needs a program_id this connection does not carry, and is keyed by the client reference id rather than a payout id.',
    )
  }
}
