/**
 * Pagseguro adapter — payments vertical.
 *
 * Reads charges by id (GET /charges/{charge_id} on https://api.pagseguro.com,
 * https://developer.pagbank.com.br/reference/consultar-pagamento.md). PagBank
 * documents no collection endpoint for customers, charges, refunds or payouts on
 * that host, so those methods refuse with 501 NOT_SUPPORTED before any request.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { PagseguroClient } from './client'
import { DEFAULT_SCOPES } from './constants'

import { transformCharge, type RawPagseguroCharge } from './transform/charge'

export interface PagseguroAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class PagseguroAdapter implements PaymentsAdapter {
  readonly platform = 'pagseguro'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PagseguroAdapterConfig) {
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

  private client(credentials: Credentials): PagseguroClient {
    return new PagseguroClient(credentials)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'PagBank cannot list customers: GET /customers is documented only on the Recurring Payments API ' +
        '(server https://sandbox.api.assinaturas.pagseguro.com), which needs its own token ("Para utilizar as APIs de ' +
        'Pagamento Recorrente será necessário o token de acesso disponibilizado pelo PagBank.") and has no documented ' +
        'production API host; https://api.pagseguro.com has no customer collection',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'PagBank cannot read a customer: GET /customers/{customer_id} ("Consultar por id") is documented only on the ' +
        'Recurring Payments API (server https://sandbox.api.assinaturas.pagseguro.com), which needs its own token and ' +
        'has no documented production API host; https://api.pagseguro.com has no customer resource',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'PagBank cannot list charges: charges are documented by id only ("Este endpoint permite que você consulte o ' +
        'status de um pagamento por meio de seu identificador da cobrança gerado pelo PagBank."), and GET /orders ' +
        'requires charge_id',
    )
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawPagseguroCharge>(`/charges/${id}`)
    return transformCharge(raw)
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'PagBank cannot list refunds: GET /refunds is documented only on the Recurring Payments API ' +
        '(server https://sandbox.api.assinaturas.pagseguro.com), which needs its own token and has no documented ' +
        'production API host; on https://api.pagseguro.com a refund is POST /charges/{charge_id}/cancel',
    )
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(
      'PagBank cannot read a refund by id: GET /refunds/{refund_id} ("Consultar estorno") is documented only on the ' +
        'Recurring Payments API (server https://sandbox.api.assinaturas.pagseguro.com), which needs its own token and ' +
        'has no documented production API host; no GET /refunds/{id} is documented on https://api.pagseguro.com',
    )
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(
      'PagBank cannot list payouts: no /payouts path is documented; cash-outs are listed only by the separate EDI ' +
        'statement API (https://edi.api.pagbank.com.br/movement/v3.00/cashouts/AAAA-MM-DD) with its own USER + TOKEN credentials',
    )
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'PagBank cannot read a payout: no /payouts path is documented on https://api.pagseguro.com',
    )
  }
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}
