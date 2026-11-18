/**
 * Southeastern Freight Lines (SEFL) – LogisticsAdapter implementation.
 *
 * Auth: HTTP Basic (MySEFL username:password).
 * Adapter slug: 'southeastern-freight'
 *
 * Supported operations:
 *   - createShipment    – POST /pickup-web/api/pickup
 *   - getTrackingEvents – GET  /webconnect/tracing (JSON output)
 *   - getRates          – POST /webconnect/ratequotes/rest/submitQuote
 *   - listCarriers      – static SEFL identity record (no API endpoint)
 *   - getCarrier        – static SEFL identity record (no API endpoint)
 *   - getLabel          – POST /document-retrieval/ (BOL doc as base64 PDF)
 *
 * SEFL has no webhook signing scheme; webhook.ts is omitted.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: manifest  — SEFL REST API has no manifest/close-out endpoint
 * Unavailable: order     — SEFL is an LTL freight carrier with no order management API
 * Unavailable: warehouse — SEFL exposes no service center / terminal data via REST API
 */

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, buildCredentials, refreshCredentials as doRefresh } from './auth'
import { SeflClient } from './client'
import {
  SEFL_PICKUP_PATH,
  SEFL_TRACING_PATH,
  SEFL_RATE_QUOTE_PATH,
} from './constants'

import { transformShipment, type SeflPickupResponse } from './transform/shipment'
import { transformTrackingEvents, type SeflTracingResponse } from './transform/tracking'
import { transformRate, type SeflRateResponse } from './transform/rate'
import { transformCarrier } from './transform/carrier'
import { transformLabel, type SeflDocumentItem } from './transform/label'

const SEFL_DOCUMENT_RETRIEVAL_PATH = '/document-retrieval'

export interface SeflAdapterConfig {
  username?: string
  password?: string
  shipperAccount?: string
  /** When true, pickup requests are validated but not submitted (SEFL developer mode). */
  developer?: boolean
}

export class SoutheasternFreightAdapter implements LogisticsAdapter {
  readonly platform = 'southeastern-freight'
  readonly version = '1'

  private config: SeflAdapterConfig

  constructor(config: SeflAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  /**
   * For Basic Auth adapters, `code` is interpreted as the raw `username:password`
   * string; callers should pass credentials directly rather than going through
   * an OAuth redirect.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [username = '', password = ''] = code.split(':')
    return buildCredentials({
      username,
      password,
      shipperAccount: this.config.shipperAccount,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Pickup / Create Shipment ───────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SeflClient(credentials)

    const pkg = data.packages?.[0]

    const body = {
      developer: this.config.developer ?? false,
      contact: {
        company: data.originAddress?.company ?? data.originAddress?.name ?? undefined,
        name: data.originAddress?.name ?? undefined,
        phone: data.originAddress?.phone ?? undefined,
        email: data.originAddress?.email ?? undefined,
      },
      shipper: {
        shipperName: data.originAddress?.company ?? data.originAddress?.name ?? undefined,
        shipperCountry: data.originAddress?.country === 'MX' ? 'MX' : data.originAddress?.country === 'CA' ? 'CN' : '',
        address: data.originAddress?.street1 ?? undefined,
        city: data.originAddress?.city ?? undefined,
        state: data.originAddress?.state ?? undefined,
        zip: data.originAddress?.postalCode ?? undefined,
        pickupContactName: data.originAddress?.name ?? undefined,
        phone: data.originAddress?.phone ?? undefined,
        email: data.originAddress?.email ?? undefined,
        hazmat: 'N',
        liftgate: 'N',
        overlength: 'N',
        foodstuff: 'N',
        medical: 'N',
        pickupNotes: data.notes ?? undefined,
        shipAs: 'S',
      },
      consignees: [
        {
          name: data.destinationAddress?.company ?? data.destinationAddress?.name ?? undefined,
          destZip: data.destinationAddress?.postalCode ?? undefined,
          destCountry: data.destinationAddress?.country === 'MX' ? 'MX' : data.destinationAddress?.country === 'CA' ? 'CN' : '',
          weight: data.totalWeight?.value ?? pkg?.weight?.value ?? 0,
          pieces: data.packages?.length ?? 1,
          pkgType: 'PT' as const,
          ...(data.reference ? { specialNumType: 'ORN', specialNum: data.reference } : {}),
        },
      ],
    }

    const res = await client.pickupPost<SeflPickupResponse>(SEFL_PICKUP_PATH, body)
    return transformShipment(res)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SeflClient(credentials)

    const res = await client.webconnectGet<SeflTracingResponse>(SEFL_TRACING_PATH, {
      Type: 'PN',
      RefNum1: trackingNumber,
      output: 'JSON',
    })

    return transformTrackingEvents(res)
  }

  // ── Rate Quotes ────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SeflClient(credentials)
    const extra = (credentials.extra ?? {}) as Record<string, unknown>

    const firstPkg = params.packages[0]
    const weightValue = firstPkg?.weight?.value ?? 100
    // SEFL rates use pounds
    const weightLbs =
      firstPkg?.weight?.unit === 'kg' ? weightValue * 2.20462 : weightValue

    const form = new URLSearchParams()
    form.set('CustomerAccount', (extra.shipperAccount as string | undefined) ?? '')
    form.set('OriginCity', params.originAddress.city ?? '')
    form.set('OriginState', params.originAddress.state ?? '')
    form.set('OriginZip', params.originAddress.postalCode ?? '')
    form.set('OrigCountry', params.originAddress.country === 'CA' ? 'C' : params.originAddress.country === 'MX' ? 'M' : 'U')
    form.set('DestinationCity', params.destinationAddress.city ?? '')
    form.set('DestinationState', params.destinationAddress.state ?? '')
    form.set('DestinationZip', params.destinationAddress.postalCode ?? '')
    form.set('DestCountry', params.destinationAddress.country === 'CA' ? 'C' : params.destinationAddress.country === 'MX' ? 'M' : 'U')
    form.set('Class1', '70')
    form.set('Weight1', String(Math.ceil(weightLbs)))
    form.set('Terms', 'P')

    const res = await client.webconnectPost<SeflRateResponse>(SEFL_RATE_QUOTE_PATH, form)

    // API may return a single quote object or an array
    const quotes: SeflRateResponse[] = Array.isArray(res) ? res : [res]
    return quotes.map(transformRate)
  }

  // ── Carrier (static SEFL identity — no /carriers list endpoint) ───────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels (via Document Retrieval API — POST /document-retrieval/) ────────
  //
  // SEFL's Document Retrieval API returns Bill of Lading documents (and other
  // document types) as base64-encoded PDFs keyed by pro number.  The BOL is the
  // closest SEFL analogue to a shipping label.
  //
  // Source: https://www.sefl.com/seflWebsite/documentRetrieval/documentRetrievalRESTService.jsp

  async getLabel(credentials: Credentials, proNumber: string): Promise<Label> {
    const client = new SeflClient(credentials)

    const body = {
      imageTypes: ['BL'],
      associated: false,
      format: 'pdf',
    }

    type DocResponse = SeflDocumentItem[] | { documents?: SeflDocumentItem[] }
    const res = await client.documentPost<DocResponse>(SEFL_DOCUMENT_RETRIEVAL_PATH, body)

    // Response may be an array directly or wrapped in { documents: [...] }
    const docs: SeflDocumentItem[] = Array.isArray(res)
      ? res
      : ((res as { documents?: SeflDocumentItem[] }).documents ?? [])

    // Filter to the requested pro number when multiple documents returned
    const doc: SeflDocumentItem =
      docs.find((d) => d.pro === proNumber) ?? docs[0] ?? { pro: proNumber }

    return transformLabel(doc)
  }
}
