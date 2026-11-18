// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: manifest  — the CTT (Pakketmail) API documents no manifest endpoint
// Unavailable: order     — the CTT (Pakketmail) API documents no order endpoint
// Unavailable: warehouse — the CTT (Pakketmail) API documents no warehouse endpoint
//
// API: https://enviosecommerceapi.ctt.pt/v3/ (CTT's OpenAPI document at
// https://enviosecommerceapi.ctt.pt/v3/openapi/; human-readable pages for the
// same Pakketmail API at https://api.pakketmail.nl/v3/apidocs/usa/).

import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Shipment } from '../../schema/shipment'
import type { Label } from '../../schema/label'

import {
  buildAuthUrl,
  CTT_CREDENTIAL_FIELDS,
  exchangeKeyFields,
  readKeys,
  refreshCredentials as doRefresh,
} from './auth'
import { CttClient } from './client'
import { NEWSINCE_MIN_INTERVAL_MS, NEWSINCE_PAGE_SIZE } from './constants'

import { transformTracking, type CttTrackingResponse } from './transform/tracking'
import { transformRate, type CttRate } from './transform/rate'
import { transformCarrier, type CttCarrierListResponse } from './transform/carrier'
import { transformShipment, type CttShipmentListResponse } from './transform/shipment'
import { transformLabel, type CttLabelResponse } from './transform/label'

interface CttAdapterConfig {
  sandbox?: boolean
  /**
   * Least time between two GET /shipments/newsince requests of one
   * connection: "at a rate of 1 request per second at most". Tests set 0.
   */
  newsinceIntervalMs?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** When each connection (by public key) last sent GET /shipments/newsince. */
const lastNewsinceAt = new Map<string, number>()

/** RFC 3339 at whole seconds, UTC: `YYYY-MM-DDTHH:MM:SSZ`. */
function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * The `iso3339Date` of GET /shipments/newsince: "all shipments that are
 * imported in the system since the given date and time ... The maximum time
 * back in time is 2 days. So it is best to check at least once a day."
 *
 * `updatedAfter` when the caller sends one. Otherwise the start of the
 * previous UTC day: always inside the documented 2-day reach (24 to 48 hours
 * back), at least the day the docs ask a client to cover, and the same value
 * for every call on one UTC day, so page N of a walk names the same rows.
 */
function newsinceFrom(params: QueryParams, now = Date.now()): string {
  const after = params.updatedAfter as Date | string | undefined
  if (after !== undefined && after !== null && after !== '') {
    const d = after instanceof Date ? after : new Date(after)
    if (isNaN(d.getTime())) {
      throw Object.assign(new Error('updated_after must be an ISO-8601 date-time'), {
        statusCode: 400,
        code: 'VALIDATION',
      })
    }
    return rfc3339(new Date(Math.floor(d.getTime() / 1000) * 1000))
  }
  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS
  return rfc3339(new Date(startOfToday - DAY_MS))
}

/**
 * The error a GET /carriers/ reply reports, if any. The Pakketmail page
 * documents `Error` as a sublist ("Id Integer number Always returned ... The
 * id of the error Info String Textual error") plus an `ErrorList` array; CTT's
 * OpenAPI types `Error` as that array (`ErrorList`, items `{Id, Info}`). Both
 * shapes are read. An entry reports an error when it has a non-zero Id or any
 * Info text.
 */
function carrierReplyError(res: CttCarrierListResponse | undefined): string | undefined {
  const entries = [
    ...(Array.isArray(res?.Error) ? res.Error : res?.Error ? [res.Error] : []),
    ...(res?.ErrorList ?? []).map((e) => ({ Id: e.Id, Info: e.Tekst })),
  ]
  const bad = entries.filter((e) => (e.Id !== undefined && e.Id !== 0) || !!e.Info)
  if (bad.length === 0) return undefined
  return bad.map((e) => `${e.Id ?? ''}${e.Info ? ` ${e.Info}` : ''}`.trim()).join('; ')
}

export class CttAdapter implements LogisticsAdapter {
  readonly platform = 'ctt'
  readonly version = '1'

  private readonly newsinceIntervalMs: number

  constructor(config: CttAdapterConfig = {}) {
    this.newsinceIntervalMs = config.newsinceIntervalMs ?? NEWSINCE_MIN_INTERVAL_MS
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  credentialFields() {
    return CTT_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeKeyFields(fields)
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw Object.assign(
      new Error(
        'CTT has no authorization-code flow: connect with the application key, public key, secret key and shop URL.',
      ),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * POST /tracking/ with `TrackingIdList` ("A list of tracking id's",
   * https://api.pakketmail.nl/v3/apidocs/usa/endpoints/tracking/POST).
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new CttClient(credentials)
    const raw = await client.post<CttTrackingResponse>('tracking/', {
      TrackingIdList: [trackingNumber],
    })
    return transformTracking(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * GET /carriers/: "Get all set up carriers and options belonging to them."
   * One unpaged reply under `Carrier`, so the caller's page is cut locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new CttClient(credentials)
    const res = await client.get<CttCarrierListResponse>('carriers/')
    if (!Array.isArray(res?.Carrier)) {
      // "Error sublist Always returned Any error will be reported here": a
      // reply that reports an error and carries no `Carrier` is a failure,
      // not an account with no carriers.
      const reported = carrierReplyError(res)
      if (reported !== undefined) throw new Error(`CTT carriers/ reported an error: ${reported}`)
    }
    return pageLocally((res?.Carrier ?? []).map(transformCarrier), params)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * GET /shipments/newsince/:startNumber/:iso3339Date
   * (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/shipments/newsince/GET):
   * "Each request will return 25 shipments at most ... If the list is longer
   * than 25 items, a second request is done and the start item is set to 26,
   * etc. at a rate of 1 request per second at most." The start item is the
   * cursor; "If ShipmentCount is less than 25, it means this is the last
   * possible shipment list, further requests are not needed."
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const keys = readKeys(credentials)
    const since = newsinceFrom(params)
    const client = new CttClient(credentials)
    const key = cursorPagerKey(connectionScope(`ctt:${keys.publicKey}`, credentials), 'shipments', {
      since,
      size: NEWSINCE_PAGE_SIZE,
    })
    const { items } = await pageByRows<Shipment, number>(key, params, async (start) => {
      const startNumber = start ?? 1
      await this.paceNewsince(keys.publicKey)
      const res = await client.get<CttShipmentListResponse>(
        `shipments/newsince/${startNumber}/${since}`,
      )
      const rows = res?.Shipments ?? []
      if (rows.length === 0) return { items: [] }
      if (typeof res.ShipmentCount !== 'number') {
        throw new Error('CTT shipments/newsince reply has Shipments but no ShipmentCount')
      }
      return {
        items: rows.map(transformShipment),
        next: res.ShipmentCount < NEWSINCE_PAGE_SIZE ? undefined : startNumber + NEWSINCE_PAGE_SIZE,
      }
    })
    return items
  }

  /** Hold a newsince request until a second has passed since this connection's last one. */
  private async paceNewsince(publicKey: string): Promise<void> {
    const last = lastNewsinceAt.get(publicKey)
    const wait = last === undefined ? 0 : last + this.newsinceIntervalMs - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastNewsinceAt.set(publicKey, Date.now())
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new CttClient(credentials)
    // Step 1: submit the label request
    const postRes = await client.post<CttLabelResponse>('labels', {
      ClientReferenceCodeList: [data.id ?? data.shipmentId],
      LabelType: 1,
    })
    const callbackUrl = postRes.CallbackURL
    if (!callbackUrl) {
      return transformLabel(postRes)
    }
    // Step 2: poll until finished
    const runId = callbackUrl.split('/').pop()
    let pollRes: CttLabelResponse = postRes
    for (let i = 0; i < 30; i++) {
      pollRes = await client.get<CttLabelResponse>(`labels/${runId}`)
      if ((pollRes.Finished ?? 0) >= 100) break
      await new Promise((r) => setTimeout(r, 2000))
    }
    return transformLabel({ ...pollRes, createdAt: new Date().toISOString() })
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CttClient(credentials)
    const res = await client.post<{ rates: CttRate[] }>('pricing', {
      origin: {
        postal_code: params.originAddress.postalCode,
        city: params.originAddress.city,
        country: params.originAddress.country,
      },
      destination: {
        postal_code: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        country: params.destinationAddress.country,
      },
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit ?? 'kg',
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
        dimension_unit: pkg.dimensions?.unit ?? 'cm',
      })),
      service_codes: params.serviceCodes,
    })
    return (res.rates ?? []).map(transformRate)
  }
}

export { newsinceFrom as _newsinceFrom }
