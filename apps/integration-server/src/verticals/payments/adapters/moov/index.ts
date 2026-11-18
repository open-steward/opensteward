/**
 * Moov adapter — payments vertical.
 *
 * Auth (auth.ts): Basic authentication with the API key pair, collected with
 * the account ID on the Connect Link form. "You can use your API key's public
 * and private keys with Basic authentication."
 * (https://docs.moov.io/api/authentication/api-authentication/). Moov documents
 * no authorization-code flow, so getAuthUrl and exchangeCode throw.
 *
 * Reads: Moov's money movement is one resource, the transfer
 * (https://docs.moov.io/api/money-movement/transfers/list/): "GET
 * /accounts/{accountID}/transfers" and "GET /accounts/{accountID}/transfers/
 * {transferID}". Charges and payouts are the transfers on the rails rails.ts
 * names, quoted there: a charge is collected from a payer (card-payment,
 * apple-pay, google-pay, ach-debit-collect as the source), a payout is sent to
 * a recipient's bank account or card (ach-credit-*, instant-bank-credit,
 * rtp-credit, push-to-* as the destination).
 *
 * Paging: "When you run this request, you retrieve 200 transfers at a time.
 * You can advance past a results set of 200 transfers by using the skip
 * parameter". Moov documents no filter on the rail, so the adapter walks
 * upstream pages of 200 by `skip` and cuts the caller's page out of the rows
 * that match (pageByRows).
 *
 * `updatedAfter` is not sent: the only date filters are "startDateTime …
 * inclusively filters all transfers created after this date-time" and
 * "endDateTime … created before", creation-time filters that would drop older
 * transfers whose status changed since.
 *
 * Every other resource is unimplemented, so the router answers 501.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import {
  MOOV_CREDENTIAL_FIELDS,
  NO_REDIRECT_FLOW,
  accountIdOf,
  exchangeMoovCredentials,
} from './auth'
import { MoovClient } from './client'
import {
  API_BASE_URL,
  DEFAULT_PAGE_SIZE,
  MAX_UPSTREAM_PAGES,
  TRANSFERS_PAGE_SIZE,
  transferPath,
  transfersPath,
} from './constants'
import { isCharge, isPayout, type RawMoovTransfer } from './rails'
import { transformCharge } from './transform/charge'
import { transformPayout } from './transform/payout'

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class MoovAdapter implements PaymentsAdapter {
  readonly platform = 'moov'
  readonly version = '0.2.0'

  getAuthUrl(_state?: string): string {
    throw new Error(NO_REDIRECT_FLOW)
  }

  async exchangeCode(_code?: string, _redirectUri?: string): Promise<Credentials> {
    throw new Error(NO_REDIRECT_FLOW)
  }

  credentialFields(): CredentialField[] {
    return MOOV_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeMoovCredentials(fields)
  }

  /** API keys do not expire; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  /**
   * The caller's page of the transfers that `keep` selects, walked over
   * upstream pages of 200 by `skip` and `count` (the only query parameters
   * sent). A page shorter than the 200 asked for is the last one.
   */
  private async pageTransfers(
    credentials: Credentials,
    params: QueryParams,
    rail: 'charges' | 'payouts',
    keep: (raw: RawMoovTransfer) => boolean,
  ): Promise<RawMoovTransfer[]> {
    const accountID = accountIdOf(credentials)
    const client = new MoovClient(credentials)
    const path = transfersPath(accountID)
    const key = cursorPagerKey(connectionScope(`${API_BASE_URL}${path}`, credentials), rail, {
      count: TRANSFERS_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawMoovTransfer, number>(
      key,
      params,
      async (cursor) => {
        // No cursor is the first upstream page: skip nothing.
        const skip = cursor === undefined ? 0 : cursor
        const rows = await client.get<RawMoovTransfer[]>(path, { skip, count: TRANSFERS_PAGE_SIZE })
        if (!Array.isArray(rows)) throw new Error(`Moov ${path} returned no transfer array`)
        return {
          items: rows.filter(keep),
          next: rows.length < TRANSFERS_PAGE_SIZE ? undefined : skip + rows.length,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE, maxUpstreamPages: MAX_UPSTREAM_PAGES },
    )
    return items
  }

  private async getTransfer(credentials: Credentials, id: string): Promise<RawMoovTransfer> {
    const accountID = accountIdOf(credentials)
    return new MoovClient(credentials).get<RawMoovTransfer>(transferPath(accountID, id))
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageTransfers(credentials, params, 'charges', isCharge)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.getTransfer(credentials, id)
    if (!isCharge(raw)) {
      throw notFound(
        `Moov transfer ${id} is not a charge: its source rail is ${String(raw.source?.paymentMethodType)}`,
      )
    }
    return transformCharge(raw)
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.pageTransfers(credentials, params, 'payouts', isPayout)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.getTransfer(credentials, id)
    if (!isPayout(raw)) {
      throw notFound(
        `Moov transfer ${id} is not a payout: its destination rail is ${String(raw.destination?.paymentMethodType)}`,
      )
    }
    return transformPayout(raw)
  }
}
