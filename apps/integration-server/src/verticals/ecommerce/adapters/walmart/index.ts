/**
 * Walmart Marketplace adapter for the ecommerce vertical.
 *
 * Maps Walmart's Marketplace REST APIs to the canonical ecommerce resources.
 * OAuth2 client-credentials auth.
 *
 * Slug: `walmart`
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: collection   — Walmart taxonomy categories are not seller-managed
 *                             product collections; there is no collection CRUD API.
 * Unavailable: customer     — Walmart does not expose buyer/customer profiles to
 *                             marketplace sellers via the API.
 * Unavailable: discount     — Walmart has promotional pricing (item-level price
 *                             reductions via feed) but no standalone discount code
 *                             or coupon resource with list/get endpoints.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  DEFAULT_PAGE_LIMIT,
  oauth2ClientCredentials,
  pageByRows,
  pageLocally,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Location } from '../../schema/location'
import type { Transaction } from '../../schema/transaction'
import { WalmartClient } from './client'
import { TOKEN_URL } from './constants'

import {
  transformLocation,
  type RawWalmartShipNode,
  type RawWalmartShipNodesEnvelope,
} from './transform/location'
import {
  transformTransaction,
  type RawWalmartReconRecord,
  type RawWalmartReconEnvelope,
} from './transform/transaction'

const CREDENTIAL_FORM = oauth2ClientCredentials({ tokenUrl: TOKEN_URL })

/** reconFileJson `noOfRecords`: "number of records in the report (max limit 1000)". */
const RECON_MAX_RECORDS = 1000

/**
 * A position in the recon walk: which report (of the dates fixed when the
 * walk started) and the BYTE offset into it. Replayable: fetching it again
 * returns the same records.
 */
interface ReconCursor {
  dates: string[]
  index: number
  offset: number
}

/** The documented 200 is a bare array; an enveloped shape is still read. */
function shipNodesOf(
  res: RawWalmartShipNode[] | RawWalmartShipNodesEnvelope | null | undefined,
): RawWalmartShipNode[] {
  if (Array.isArray(res)) return res
  return res?.shipNodes ?? []
}

export interface WalmartAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class WalmartAdapter implements EcommerceAdapter {
  readonly platform = 'walmart'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: WalmartAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  private client(credentials: Credentials): WalmartClient {
    return new WalmartClient(credentials)
  }

  getAuthUrl(_state: string): string {
    throw new Error('Walmart uses client-credentials — no user-facing auth URL.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Walmart uses client-credentials — exchangeCode is not applicable.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Client-credentials tokens are re-requested, not refreshed.
    return credentials
  }

  // ── Locations ───────────────────────────────────────────────────────────────

  /**
   * List all seller ship nodes (fulfillment centers) via the Settings API.
   * GET /v3/settings/shipping/shipnodes
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // No limit/offset/page/cursor is documented: the whole list comes back.
    const res = await this.client(credentials).get<
      RawWalmartShipNode[] | RawWalmartShipNodesEnvelope
    >('/v3/settings/shipping/shipnodes')
    return pageLocally(shipNodesOf(res).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // Walmart's ship node endpoint returns all nodes; filter by id.
    const res = await this.client(credentials).get<
      RawWalmartShipNode[] | RawWalmartShipNodesEnvelope
    >('/v3/settings/shipping/shipnodes')
    const node = shipNodesOf(res).find(
      (n: RawWalmartShipNode) => n.shipNode === id || n.customNodeId === id,
    )
    if (!node) throw new Error(`Walmart ship node not found: ${id}`)
    return transformLocation(node)
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  /**
   * List financial transactions from Walmart's Recon Report JSON API.
   * GET /v3/report/reconreport/reconFileJson
   *
   * `reportDate`, `offset` and `noOfRecords` are all required. `offset` is a
   * BYTE offset ("starting number of the bytes, initial value for the offset
   * is zero") that `nextOffset` continues, so a page is reached only by
   * walking from 0. With a `reportDate` param only that report is walked;
   * without one, every date from
   * GET /v3/report/reconreport/availableReconFiles?reportVersion=v1 is walked
   * in the order returned. A report ends on a short page and may be empty, so
   * `pageByRows` re-cuts the stream to the caller's pages.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.client(credentials)
    // Read the limit exactly as pageByRows does (a numeric string counts), so
    // the upstream size and the caller's page size agree.
    const raw: unknown = params.limit ?? DEFAULT_PAGE_LIMIT
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
    const asked =
      typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE_LIMIT
    const size = Math.min(asked, RECON_MAX_RECORDS)
    const reportDate =
      typeof params['reportDate'] === 'string' && params['reportDate'] !== ''
        ? params['reportDate']
        : undefined
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const account = typeof extra['clientId'] === 'string' ? extra['clientId'] : ''
    const key = cursorPagerKey(connectionScope(`walmart:${account}`, credentials), 'transactions', {
      reportDate,
      noOfRecords: size,
    })

    const fetch = async (
      cursor: ReconCursor | undefined,
    ): Promise<{ items: Transaction[]; next?: ReconCursor }> => {
      let at = cursor
      if (!at) {
        const dates = reportDate
          ? [reportDate]
          : ((
              await client.get<{ availableApReportDates?: string[] }>(
                '/v3/report/reconreport/availableReconFiles',
                { reportVersion: 'v1' },
              )
            )?.availableApReportDates ?? [])
        if (dates.length === 0) return { items: [] }
        at = { dates, index: 0, offset: 0 }
      }
      const res = await client.get<RawWalmartReconEnvelope>(
        '/v3/report/reconreport/reconFileJson',
        { reportDate: at.dates[at.index], offset: at.offset, noOfRecords: size },
      )
      const rows = res?.reportData ?? []
      const nextOffset = Number(res?.nextOffset)
      // What nextOffset holds at end of file is undocumented: a short page, or
      // one whose nextOffset does not move forward, ends this report.
      const more = rows.length === size && Number.isFinite(nextOffset) && nextOffset > at.offset
      const next: ReconCursor | undefined = more
        ? { dates: at.dates, index: at.index, offset: nextOffset }
        : at.index + 1 < at.dates.length
          ? { dates: at.dates, index: at.index + 1, offset: 0 }
          : undefined
      return {
        items: rows.map((r: RawWalmartReconRecord) => transformTransaction(r)),
        next,
      }
    }

    const { items } = await pageByRows<Transaction, ReconCursor>(key, params, fetch)
    return items
  }
}
