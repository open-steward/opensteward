/**
 * M-Pesa (Safaricom Daraja) adapter — payments vertical.
 *
 * Daraja documents no GET /charges or /payouts resource, so every read method
 * refuses with 501 NOT_SUPPORTED before sending anything:
 *
 * - Charges: the only documented list of incoming payments is Pull
 *   Transactions (https://api.safaricom.co.ke/pulltransactions/v1/query,
 *   body { ShortCode, StartDate, EndDate, OffSetValue }). It needs the
 *   merchant's ShortCode — "This is your paybill number/till number, which you
 *   expect to receive payments notifications about." — plus a one-time Register
 *   Pull, and this connection carries no ShortCode. A single transaction can
 *   only be looked up through Transaction Status, whose result is delivered
 *   asynchronously to a ResultURL.
 *   https://developer.safaricom.co.ke/apis/PullTransaction
 * - Payouts: "The B2C API is asynchronous. You receive an acknowledgement
 *   immediately, but the actual transaction result is sent later to your
 *   specified ResultURL." No endpoint lists or reads outgoing payments.
 *   https://developer.safaricom.co.ke/apis/BusinessToCustomer
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { DEFAULT_SCOPES } from './constants'

export interface MpesaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const CHARGES_REASON =
  'the only documented list, Pull Transactions (/pulltransactions/v1/query), requires the ' +
  'merchant ShortCode ("This is your paybill number/till number, which you expect to receive ' +
  'payments notifications about.") and a one-time Register Pull, and this connection has no ShortCode'

const PAYOUTS_REASON =
  '"The B2C API is asynchronous. You receive an acknowledgement immediately, but the actual ' +
  'transaction result is sent later to your specified ResultURL." Daraja documents no endpoint ' +
  'that lists or reads payouts'

export class MpesaAdapter implements PaymentsAdapter {
  readonly platform = 'mpesa'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MpesaAdapterConfig) {
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

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(`M-Pesa cannot list charges: ${CHARGES_REASON}`)
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'M-Pesa cannot read a charge by id: Daraja has no GET /charges/{id}; Transaction Status ' +
        '(POST /mpesa/transactionstatus/v1/query) delivers its result asynchronously to a ResultURL',
    )
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(`M-Pesa cannot list payouts: ${PAYOUTS_REASON}`)
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(`M-Pesa cannot read a payout by id: ${PAYOUTS_REASON}`)
  }
}
