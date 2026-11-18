import {
  customForm,
  connectionScope,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiCredentials, refreshCredentials as doRefresh } from './auth'
import { IthinkLogisticsClient, type IthinkLogisticsEnvelope } from './client'
import { ITHINK_TRACK_URL, ORDER_DETAILS_MAX_AWBS } from './constants'

import { transformTracking, type IthinkLogisticsTrackingRaw } from './transform/tracking'
import { transformShipment, type IthinkLogisticsShipmentRaw } from './transform/shipment'
import { transformOrder, type IthinkLogisticsOrderRaw } from './transform/order'
import { transformWarehouse, type IthinkLogisticsWarehouseRaw } from './transform/warehouse'
import { transformLabel, type IthinkLogisticsLabelRaw } from './transform/label'
import { transformManifest, type IthinkLogisticsManifestRaw } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier — no dedicated list-carriers endpoint; carrier names
//              appear as logistic_name embedded in rate and order responses only.

interface IthinkLogisticsAdapterConfig {
  sandbox?: boolean
}

/**
 * Two secrets, both sent in every request's `data` envelope
 * (https://docs.ithinklogistics.com/doc-get-warehouse/3): "access_token ...
 * You will get this from IThink Logistics team." and "secret_key ... You will
 * get this from IThink Logistics team."
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Access token',
      type: 'password',
      required: true,
      helpText: 'The access_token the iThink Logistics team issued for your account.',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'The secret_key issued with the access token.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const accessToken = (fields['accessToken'] ?? '').trim()
    const secretKey = (fields['secretKey'] ?? '').trim()
    if (!accessToken) throw new Error('Access token is required.')
    if (!secretKey) throw new Error('Secret key is required.')
    return exchangeApiCredentials(accessToken, secretKey)
  },
})

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` of a UTC midnight, the documented date format ("start_date":"2022-04-01"). */
function ymd(dayStartMs: number): string {
  return new Date(dayStartMs).toISOString().slice(0, 10)
}

/** `data` of an order-details or tracking response: an object keyed per AWB. */
function rowsOf<T>(data: unknown): T[] {
  return data !== null && typeof data === 'object' ? (Object.values(data) as T[]) : []
}

type OrderDetailsResponse = IthinkLogisticsEnvelope & {
  data?: Record<string, IthinkLogisticsOrderRaw>
}
type WarehouseResponse = IthinkLogisticsEnvelope & { data?: IthinkLogisticsWarehouseRaw[] }
type TrackResponse = IthinkLogisticsEnvelope & { data?: Record<string, IthinkLogisticsTrackingRaw> }

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`iThink Logistics ${what} not found: ${id}`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}


export class IthinkLogisticsAdapter implements LogisticsAdapter {
  // Connect Link support — access token + secret key form.

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'ithink-logistics'
  readonly version = '1'

  constructor(config: IthinkLogisticsAdapterConfig = {}) {

    void config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'iThink Logistics connects with an access token and a secret key; use the credential form.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * `POST https://api.ithinklogistics.com/api_v3/order/track.json`
   * (https://docs.ithinklogistics.com/doc-track-order/3), with
   * "awb_number_list ... List of AWB Number which you want to track."
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new IthinkLogisticsClient(credentials)
    const res = await client.post<TrackResponse>(ITHINK_TRACK_URL, {
      awb_number_list: trackingNumber,
    })
    const row = rowsOf<IthinkLogisticsTrackingRaw>(res.data).find(
      (r) => r.awb_no === trackingNumber,
    )
    if (!row || row.message !== 'success') throw notFound('AWB', trackingNumber)
    return transformTracking(row, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new IthinkLogisticsClient(credentials)
    const raw = await client.post<IthinkLogisticsShipmentRaw>('order/add.json', {
      reference: data.reference,
      service_code: data.serviceCode,
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * `POST order/get_details.json` (https://docs.ithinklogistics.com/doc-order-details/3)
   * is the only order list. It takes "start_date ... Date from which order data
   * is needed." and "end_date ... Date till which order data is needed.", returns
   * "maximum 500 AWB details in one request", and documents no page, offset or
   * cursor, and no lookback limit.
   *
   * So the call needs `updatedAfter`: without it there is no documented lower
   * bound and it is refused before any request. With it, the walk runs over
   * one-day windows (start_date = end_date, "till" read as inclusive) anchored
   * to UTC calendar days, newest first, from today back to the day of
   * `updatedAfter`, through `pageByRows`. A day is the smallest window the
   * date-only filter can express, so a day that comes back with 500 AWBs, the
   * documented cap, may be truncated and cannot be split: it throws rather
   * than serve part of the day as the whole.
   *
   * The docs do not say which date the range filters on (order date is
   * likely), so `updatedAfter` bounds the walk by that date.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const after = params.updatedAfter
    if (!after) {
      throw Object.assign(
        new Error(
          'iThink Logistics cannot list orders without updated_after: its only order list, ' +
            'POST order/get_details.json, needs a start_date/end_date range ("maximum 500 AWB ' +
            'details in one request") and documents no paging and no lookback limit. Pass ' +
            'updated_after to walk the days since then.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const top = Math.floor(Date.now() / DAY_MS) * DAY_MS
    const bottom = Math.floor(after.getTime() / DAY_MS) * DAY_MS
    if (bottom > top) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const days = (top - bottom) / DAY_MS + 1
    const client = new IthinkLogisticsClient(credentials)
    const key =
      `ithink-logistics:${connectionScope('ithink-logistics', credentials)}` +
      `:order-details:${ymd(bottom)}:${ymd(top)}`
    const { items } = await pageByRows<Order, number>(
      key,
      params,
      async (cursor) => {
        const index = cursor ?? 0
        const day = ymd(top - index * DAY_MS)
        const res = await client.post<OrderDetailsResponse>('order/get_details.json', {
          awb_number_list: '',
          start_date: day,
          end_date: day,
        })
        const rows = rowsOf<IthinkLogisticsOrderRaw>(res.data)
        if (rows.length >= ORDER_DETAILS_MAX_AWBS) {
          throw Object.assign(
            new Error(
              `iThink Logistics returned ${rows.length} orders for ${day}, the documented cap of ` +
                `${ORDER_DETAILS_MAX_AWBS} per request; the day may be truncated and a date-only ` +
                'range cannot be split further.',
            ),
            { statusCode: 502, code: 'UPSTREAM_TRUNCATED' },
          )
        }
        return {
          items: rows.map(transformOrder),
          next: index + 1 < days ? index + 1 : null,
        }
      },
      { maxUpstreamPages: days + 1 },
    )
    return items
  }

  /**
   * The same endpoint by AWB: "awb_number_list ... Comma seperated list of AWB
   * Numbers whose data is needed." with the dates empty ("You can keep this
   * empty if you want data for entered awb in awb_number_list field").
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new IthinkLogisticsClient(credentials)
    const res = await client.post<OrderDetailsResponse>('order/get_details.json', {
      awb_number_list: id,
      start_date: '',
      end_date: '',
    })
    const row = rowsOf<IthinkLogisticsOrderRaw>(res.data).find((r) => r.awb_no === id)
    if (!row) throw notFound('order', id)
    return transformOrder(row)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * `POST warehouse/get.json` (https://docs.ithinklogistics.com/doc-get-warehouse/3):
   * "Retrieve the list of registered warehouse". Its only parameter besides
   * the secrets is "warehouse_id ... #Optional. Warehouse Id whose data is
   * needed."; there is no paging, so the whole list is sliced locally.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new IthinkLogisticsClient(credentials)
    const res = await client.post<WarehouseResponse>('warehouse/get.json', {})
    return pageLocally((res.data ?? []).map(transformWarehouse), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new IthinkLogisticsClient(credentials)
    const res = await client.post<WarehouseResponse>('warehouse/get.json', {
      warehouse_id: id,
    })
    const row = (res.data ?? []).find((r) => r.id != null && String(r.id) === id)
    if (!row) throw notFound('warehouse', id)
    return transformWarehouse(row)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new IthinkLogisticsClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ data?: Array<Record<string, unknown>> }>('rate/check.json', {
      from_pincode: params.originAddress.postalCode,
      to_pincode: params.destinationAddress.postalCode,
      shipping_weight_kg: pkg?.weight?.value,
      shipping_length_cms: pkg?.dimensions?.length,
      shipping_width_cms: pkg?.dimensions?.width,
      shipping_height_cms: pkg?.dimensions?.height,
      payment_method: 'Prepaid',
      order_type: 'Forward',
      product_mrp: 0,
    })
    const list = res.data ?? []
    return list.map((r) => ({
      carrierId: 'ithink-logistics',
      serviceCode: (r.logistic_name as string | undefined),
      serviceName: (r.logistic_name as string | undefined),
      currency: 'INR',
      totalAmount: typeof r.rate === 'number' ? r.rate : undefined,
      transitDays: typeof r.delivery_tat === 'number' ? r.delivery_tat : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new IthinkLogisticsClient(credentials)
    const raw = await client.post<IthinkLogisticsLabelRaw>('shipping/label.json', {
      awb_numbers: id,
      page_size: 'A4',
    })
    return transformLabel(raw, id)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new IthinkLogisticsClient(credentials)
    const awbNumbers = data.shipmentIds ?? []
    const raw = await client.post<IthinkLogisticsManifestRaw>('shipping/manifest.json', {
      awb_numbers: awbNumbers.join(','),
    })
    return transformManifest(raw, awbNumbers)
  }
}
