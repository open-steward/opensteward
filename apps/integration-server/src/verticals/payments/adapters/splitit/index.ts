/**
 * Splitit adapter — payments vertical.
 *
 * Splitit's documented APIs are built around installment plans (Installments
 * API v3/v4, Merchant Reports, Chargebacks, Keys, AMS, Text-to-Pay). None of
 * them exposes a customer, charge, refund or payout resource, so every read
 * method here refuses with 501 NOT_SUPPORTED before sending a request.
 *
 *  - https://developers.splitit.com/api/v3/introduction/ — "Splitit's
 *    Installments API is the primary Splitit tool for establishing and
 *    maintaining installment plans."
 *  - https://developers.splitit.com/api/v3/refund/ — "POST
 *    /:installmentPlanNumber/refund Refund part or all of an installment plan."
 *    (a write on one plan; there is no refund collection or refund lookup).
 *
 * The earlier implementation called GET /customers, /charges, /refunds and
 * /payouts (and /{resource}/{id}) on web-api.production.splitit.com, a host
 * and paths that appear nowhere in Splitit's docs.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { DEFAULT_SCOPES } from './constants'

export interface SplititAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_RESOURCE =
  'Splitit\'s documented APIs cover installment plans only ("Splitit\'s Installments API is the primary Splitit tool for establishing and maintaining installment plans"); none documents this resource'

export class SplititAdapter implements PaymentsAdapter {
  readonly platform = 'splitit'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SplititAdapterConfig) {
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
    throw notSupported(`Splitit cannot list customers: ${NO_RESOURCE}`)
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(`Splitit cannot get a customer: ${NO_RESOURCE}`)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Splitit cannot list charges: the only plan reads are lookups by plan number or by RefOrderNumber/ExtendedParams ("GET /search Retrieves a plan by RefOrderNumber or ExtendedParams"), with no page or size parameter',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Splitit cannot get a charge: Splitit documents no charge resource; its plan reads return installment plans, which this adapter does not map to charges',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Splitit cannot list refunds: refunds are documented only as a write on one plan ("POST /:installmentPlanNumber/refund Refund part or all of an installment plan.")',
    )
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(
      'Splitit cannot get a refund: refunds are documented only as a write on one plan ("POST /:installmentPlanNumber/refund Refund part or all of an installment plan.")',
    )
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(`Splitit cannot list payouts: ${NO_RESOURCE}`)
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(`Splitit cannot get a payout: ${NO_RESOURCE}`)
  }
}
