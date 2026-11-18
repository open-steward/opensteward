import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByRows,
  pageLocally,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials as buildRawCredentials } from './auth'
import { SamedayClient } from './client'
import {
  MAX_PAGE_SIZE,
  LIST_PAGE_SIZE,
  MAX_LIST_PAGES,
  PACKAGE_TYPE_PARCEL,
  AWB_PAYMENT_CLIENT,
} from './constants'

import {
  transformAwbResponse,
  transformAwbStatusToShipment,
  type SamedayAwbResponse,
  type SamedayAwbStatusHistory,
} from './transform/shipment'
import { transformStatusHistory } from './transform/tracking'
import { transformEstimation, type SamedayEstimationResponse } from './transform/rate'
import { transformLabel } from './transform/label'
import {
  transformServicesToCarrier,
  type SamedayService,
  type SamedayServicesPage,
} from './transform/carrier'
import {
  transformPickupPoint,
  type SamedayPickupPoint,
  type SamedayPickupPointsPage,
} from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — Sameday has no manifest concept; the official PHP SDK
//              exposes only AWB/parcel/pickup-point/service/geo/status-sync ops.
// Unavailable: order — Sameday is a carrier-only API; there is no order
//              resource or endpoint; AWBs (shipments) are created directly.

/**
 * Credential form for Sameday: username + password (used to obtain a JWT token
 * from POST /api/authenticate). Stored as `refreshToken = "username:password"`.
 */
const SAMEDAY_CREDENTIAL_FORM = customForm({
  fields: [
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ],
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const username = (input['username'] ?? '').trim()
    const password = input['password'] ?? ''
    if (!username) throw new Error('Username is required.')
    if (!password) throw new Error('Password is required.')
    return buildRawCredentials(username, password)
  },
})

/**
 * The next upstream page number after `page`, or null at the end.
 * Sameday answers paginated lists with `pages` ("Total number of pages."); an
 * answer without it continues while pages come back full.
 */
function nextPage(
  res: { pages?: number | null; data?: unknown[] | null },
  page: number,
): number | null {
  if (typeof res.pages === 'number') return page < res.pages ? page + 1 : null
  return (res.data?.length ?? 0) >= LIST_PAGE_SIZE ? page + 1 : null
}

/** One connection's pager scope: the Sameday username, fingerprinted by the connection's secret. */
function samedayScope(credentials: Credentials): string {
  const user = (credentials.refreshToken ?? '').split(':')[0] ?? ''
  return connectionScope(`sameday:${user}`, credentials)
}

interface SamedayAdapterConfig {
  /** Override the API host (e.g. for the demo environment). */
  host?: string
}

export class SamedayAdapter implements LogisticsAdapter {
  // Connect-Link: username + password credential form.
  credentialFields = SAMEDAY_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = SAMEDAY_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'sameday'
  readonly version = '1'

  constructor(_config: SamedayAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Sameday the "code" is encoded as "username:password".
    const colonIdx = code.indexOf(':')
    if (colonIdx === -1) {
      return { accessToken: '', refreshToken: code }
    }
    const username = code.slice(0, colonIdx)
    const password = code.slice(colonIdx + 1)
    return buildRawCredentials(username, password)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Force re-authentication by clearing the token; the client will
    // re-authenticate on the next request using username:password from refreshToken.
    return { ...credentials, accessToken: '' }
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SamedayClient(credentials)
    const raw = await client.get<SamedayAwbStatusHistory>(
      `/api/client/awb/${id}/status`,
      credentials,
    )
    return transformAwbStatusToShipment(raw, id)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SamedayClient(credentials)

    const recipientAddress = data.destinationAddress ?? {}
    const body = {
      pickupPoint: (data.metadata as Record<string, unknown> | undefined)?.pickupPointId ?? 0,
      packageType: PACKAGE_TYPE_PARCEL,
      packageNumber: 1,
      packageWeight: data.totalWeight?.value ?? 1,
      service: (data.metadata as Record<string, unknown> | undefined)?.serviceId ?? 0,
      awbPayment: AWB_PAYMENT_CLIENT,
      cashOnDelivery: 0,
      insuredValue: 0,
      thirdPartyPickup: 0,
      awbRecipient: {
        name: recipientAddress.name ?? '',
        phoneNumber: recipientAddress.phone ?? '',
        email: recipientAddress.email ?? '',
        personType: 0,
        companyName: recipientAddress.company ?? '',
        postalCode: recipientAddress.postalCode ?? '',
        address: recipientAddress.street1 ?? '',
        cityString: recipientAddress.city ?? '',
        countyString: recipientAddress.state ?? '',
        countryCode: recipientAddress.country ?? 'RO',
      },
      parcels: [
        {
          weight: data.totalWeight?.value ?? 1,
          width: data.dimensions?.width ?? 10,
          length: data.dimensions?.length ?? 10,
          height: data.dimensions?.height ?? 10,
        },
      ],
      clientInternalReference: data.reference ?? undefined,
      observation: data.notes ?? undefined,
    }

    const raw = await client.post<SamedayAwbResponse>('/api/awb', credentials, body)
    return transformAwbResponse(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new SamedayClient(credentials)
    await client.delete(`/api/awb/${id}`, credentials)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    // Every service folds into ONE carrier record, so read every page of
    // services (`page` / `countPerPage`, ended by `pages`) and page that one
    // row locally.
    const client = new SamedayClient(credentials)
    const services: SamedayService[] = []
    for (let page = 1; ; page++) {
      if (page > MAX_LIST_PAGES)
        throw new Error(`Sameday services: more than ${MAX_LIST_PAGES} pages`)
      const res = await client.get<SamedayServicesPage>('/api/client/services', credentials, {
        page,
        countPerPage: LIST_PAGE_SIZE,
      })
      services.push(...(res.data ?? []))
      if (nextPage(res, page) === null) break
    }
    return pageLocally(services.length === 0 ? [] : [transformServicesToCarrier(services)], params)
  }

  async getCarrier(credentials: Credentials, _id: string): Promise<Carrier> {
    const client = new SamedayClient(credentials)
    const res = await client.get<SamedayServicesPage>(
      '/api/client/services',
      credentials,
      { currentPage: 1, pageSize: MAX_PAGE_SIZE },
    )
    const services: SamedayService[] = res.data ?? []
    return transformServicesToCarrier(services)
  }

  // ── Warehouses (Pickup Points) ─────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    // Page-numbered (`page` / `countPerPage`, ended by `pages`). No maximum
    // countPerPage is documented, so ask for the SDK's own 50 and cut the
    // caller's page out of those.
    const client = new SamedayClient(credentials)
    const key = cursorPagerKey(samedayScope(credentials), 'pickup-points', {
      countPerPage: LIST_PAGE_SIZE,
    })
    const { items } = await pageByRows<Warehouse, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const res = await client.get<SamedayPickupPointsPage>(
          '/api/client/pickup-points',
          credentials,
          { page, countPerPage: LIST_PAGE_SIZE },
        )
        return { items: (res.data ?? []).map(transformPickupPoint), next: nextPage(res, page) }
      },
      { maxUpstreamPages: MAX_LIST_PAGES },
    )
    return items
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new SamedayClient(credentials)
    const res = await client.get<SamedayPickupPointsPage>(
      '/api/client/pickup-points',
      credentials,
      { currentPage: 1, pageSize: MAX_PAGE_SIZE },
    )
    const pickupPoints: SamedayPickupPoint[] = res.data ?? []
    const found = pickupPoints.find((pp) => String(pp.id) === id)
    if (!found) throw new Error(`Pickup point ${id} not found`)
    return transformPickupPoint(found)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SamedayClient(credentials)
    const raw = await client.get<SamedayAwbStatusHistory>(
      `/api/client/awb/${trackingNumber}/status`,
      credentials,
    )
    return transformStatusHistory(raw, trackingNumber)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    // Sameday does not provide a bulk tracking list endpoint; consumers should
    // call getTrackingEvents per AWB number. Return empty to satisfy the interface.
    void credentials
    void params
    return []
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SamedayClient(credentials)
    const destination = params.destinationAddress
    const pkg = params.packages[0]

    // Sameday requires a serviceId to get an estimate. If serviceCodes are
    // provided, fan out one estimate per code; otherwise use 0 as a sentinel.
    const serviceCodes = params.serviceCodes ?? ['0']

    const rates: Rate[] = []

    for (const code of serviceCodes) {
      const serviceId = parseInt(code, 10)
      const body = {
        pickupPoint: (params as Record<string, unknown>)['pickupPointId'] ?? 0,
        packageType: PACKAGE_TYPE_PARCEL,
        packageNumber: params.packages.length || 1,
        packageWeight: pkg?.weight?.value ?? 1,
        service: isNaN(serviceId) ? 0 : serviceId,
        awbPayment: AWB_PAYMENT_CLIENT,
        cashOnDelivery: 0,
        insuredValue: 0,
        thirdPartyPickup: 0,
        awbRecipient: {
          name: destination.name ?? '',
          phoneNumber: destination.phone ?? '',
          email: destination.email ?? '',
          personType: 0,
          companyName: destination.company ?? '',
          postalCode: destination.postalCode ?? '',
          address: destination.street1 ?? '',
          cityString: destination.city ?? '',
          countyString: destination.state ?? '',
          countryCode: destination.country ?? 'RO',
        },
        parcels: params.packages.map((p) => ({
          weight: p.weight?.value ?? 1,
          width: p.dimensions?.width ?? 10,
          length: p.dimensions?.length ?? 10,
          height: p.dimensions?.height ?? 10,
        })),
      }

      try {
        const raw = await client.post<SamedayEstimationResponse>(
          '/api/awb/estimate-cost',
          credentials,
          body,
        )
        rates.push(transformEstimation(raw, isNaN(serviceId) ? undefined : serviceId))
      } catch {
        // Skip services that return errors (e.g. not available for the route).
      }

    }

    return rates
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // The label PDF is available at GET /api/awb/download/{awbNumber}/A6.
    // Callers should use the SamedayClient download endpoint for raw PDF bytes.
    void credentials
    return transformLabel(id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    // In Sameday a label is generated at the same time as the AWB (shipment).
    // If shipmentId is provided and the AWB already exists, we return label metadata.
    if (!data.shipmentId) throw new Error('shipmentId (AWB number) is required')
    void credentials
    return transformLabel(data.shipmentId)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Voiding a Sameday label = deleting the AWB.
    const client = new SamedayClient(credentials)
    await client.delete(`/api/awb/${id}`, credentials)
  }
}
