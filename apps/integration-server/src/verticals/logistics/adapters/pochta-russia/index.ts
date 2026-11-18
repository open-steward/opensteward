import { connectionScope, cursorPagerKey, customForm, pageByRows } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, refreshCredentials as doRefresh } from './auth'
import { PochtaRussiaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, POCHTA_RUSSIA_API_BASE } from './constants'

import { transformShipment, type PochtaRussiaShipment } from './transform/shipment'
import { transformOrder, type PochtaRussiaOrder } from './transform/order'
import { transformRate, type PochtaRussiaTariffResponse } from './transform/rate'
import { transformLabel, type PochtaRussiaLabelMeta } from './transform/label'
import { transformCarrier, POCHTA_RUSSIA_CARRIER } from './transform/carrier'
import { transformManifest, type PochtaRussiaBatch } from './transform/manifest'

interface PochtaRussiaAdapterConfig {
  clientId?: string
  clientSecret?: string
}

/**
 * Connect Link form for Pochta Rossii basic-auth credentials.
 * token    → accessToken (application token from Otpravka portal)
 * userKey  → refreshToken (base64-encoded "login:password" user key)
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'token',
      label: 'Application token (Токен авторизации)',
      type: 'password',
      required: true,
      helpText: 'Found in your Otpravka portal account settings.',
    },
    {
      name: 'userKey',
      label: 'User key (Ключ авторизации — base64 login:password)',
      type: 'password',
      required: true,
      helpText: 'Base64-encoded string of your Otpravka login and password.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const token = (fields['token'] ?? '').trim()
    const userKey = (fields['userKey'] ?? '').trim()
    if (!token) throw new Error('Application token is required.')
    if (!userKey) throw new Error('User key is required.')
    return { accessToken: token, refreshToken: userKey }
  },
})

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: warehouse — the Otpravka API has no warehouse endpoint;
//              confirmed by lapaygroup/RussianPost SDK which documents
//              "this functionality doesn't work in Russian Post API."

/**
 * Pochta Rossii (Russian Post) logistics adapter.
 *
 * Authentication: Two-header basic scheme.
 *   Authorization: AccessToken <token>           — app token from Otpravka portal
 *   X-User-Authorization: Basic <base64(login:password)> — user key
 *
 * The Connect Link form collects both values.
 * Credentials are stored as:
 *   accessToken  → application token
 *   refreshToken → base64-encoded user key
 */
export class PochtaRussiaAdapter implements LogisticsAdapter {
  readonly platform = 'pochta-russia'
  readonly version = '1'

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  constructor(_config: PochtaRussiaAdapterConfig = {}) {}

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Pochta Rossii, the "code" is a JSON string {"token":"…","userKey":"…"}
    // Parse it directly from the auth module helper
    try {
      const parsed = JSON.parse(code) as Record<string, unknown>
      return {
        accessToken: String(parsed['token'] ?? parsed['accessToken'] ?? ''),
        refreshToken: String(parsed['userKey'] ?? parsed['refreshToken'] ?? ''),
      }
    } catch {
      return { accessToken: code, refreshToken: '' }
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ───────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    return walkBatchRecords(credentials, params, 'batch-shipment', transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new PochtaRussiaClient(credentials)
    const raw = await client.get<PochtaRussiaShipment>(`/shipment/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PochtaRussiaClient(credentials)
    // Pochta Rossii creates shipments as orders (отправления)
    const body = buildShipmentPayload(data)
    const res = await client.post<PochtaRussiaShipment[]>('/shipment', [body])
    const created = Array.isArray(res) ? res[0] : (res as PochtaRussiaShipment)
    return transformShipment(created ?? (body as PochtaRussiaShipment))
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new PochtaRussiaClient(credentials)
    await client.delete(`/shipment/${id}`)
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // The specification titles GET /1.0/batch/{name}/shipment "Запрос данных о
    // заказах в партии": the orders in a партия, the same records getOrder
    // reads by id. Orders not yet in a партия (the backlog) are documented
    // only as a search by query (GET /1.0/backlog/search) and a read by id, so
    // they are not listed.
    return walkBatchRecords(credentials, params, 'batch-order', transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PochtaRussiaClient(credentials)
    const raw = await client.get<PochtaRussiaOrder>(`/shipment/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new PochtaRussiaClient(credentials)
    const body = buildOrderPayload(data)
    const res = await client.post<PochtaRussiaOrder[]>('/shipment', [body])
    const created = Array.isArray(res) ? res[0] : (res as PochtaRussiaOrder)
    return transformOrder(created ?? (body as PochtaRussiaOrder))
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new PochtaRussiaClient(credentials)
    await client.delete(`/shipment/${id}`)
  }

  // ── Tracking Events ──────────────────────────────────────────────────────────

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    // The Otpravka specification has no tracking endpoint. Tracking is the
    // separate SOAP service at https://tracking.russianpost.ru/rtm34
    // (getOperationHistory), authenticated by its own login and password,
    // which this connection does not hold.
    // https://tracking.pochta.ru/specification
    throw notSupported(
      'Pochta Rossii tracking is not part of the Otpravka API: it is the SOAP service https://tracking.russianpost.ru/rtm34 (getOperationHistory), which needs a separate "Логин для доступа к API Сервиса отслеживания" and password',
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    // https://tracking.pochta.ru/specification
    throw notSupported(
      'Pochta Rossii cannot list tracking events: its tracking service answers one item per call ("за одно обращение к Сервису отслеживания получить информацию по одному регистрируемому почтовому отправлению"), over SOAP with separate credentials',
    )
  }

  // ── Rates ────────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new PochtaRussiaClient(credentials)
    const pkg = params.packages[0]
    const weightGrams = pkg?.weight
      ? pkg.weight.unit === 'kg'
        ? pkg.weight.value * 1000
        : pkg.weight.unit === 'lb'
          ? pkg.weight.value * 453.592
          : pkg.weight.unit === 'oz'
            ? pkg.weight.value * 28.3495
            : pkg.weight.value // assume grams
      : 1000

    // Tariff API: GET /calculate?object=47030&from=<postal>&to=<postal>&weight=<grams>
    const fromPostal = params.originAddress.postalCode ?? '101000'
    const toPostal = params.destinationAddress.postalCode ?? '101000'

    // Mail type 47030 = first class parcel (посылка первого класса) as default
    const raw = await client.tariffGet<PochtaRussiaTariffResponse>('/calculate', {
      object: 47030,
      from: fromPostal,
      to: toPostal,
      weight: Math.round(weightGrams),
    })

    return [transformRate(raw)]
  }

  // ── Labels ───────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new PochtaRussiaClient(credentials)
    // GET /1.0/forms/{id}/f7p — returns label form for shipment
    // We use the metadata endpoint to get the shipment, then derive label URL
    const raw = await client.get<
      PochtaRussiaShipment & { 'created-on'?: string | null; 'updated-on'?: string | null }
    >(`/shipment/${id}`)
    const labelMeta: PochtaRussiaLabelMeta = {
      id,
      barcode: raw['barcode'] ?? undefined,
      'shipment-id': id,
      'form-url': `https://otpravka.pochta.ru/1.0/forms/${id}/f7p`,
      'created-on': raw['created-on'] ?? undefined,
      'updated-on': raw['updated-on'] ?? undefined,
    }
    return transformLabel(labelMeta, id, raw['barcode'] ?? undefined)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId)
      throw new Error('shipmentId is required to generate a Pochta Rossii label')
    const client = new PochtaRussiaClient(credentials)
    // POST /1.0/forms/{id}/send-global — generates and sends the label
    const raw = await client.post<PochtaRussiaLabelMeta>(
      `/forms/${data.shipmentId}/send-global`,
      {},
    )
    return transformLabel(
      raw ?? ({ id: data.shipmentId } as PochtaRussiaLabelMeta),
      data.shipmentId,
      data.trackingNumber,
    )
  }

  // ── Carriers ─────────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    // Pochta Rossii has no carrier listing endpoint — the platform itself is
    // the single carrier. Return the static carrier record derived from known
    // platform metadata and documented mail types.
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    if (id !== 'pochta-russia') {
      throw new Error(`Unknown carrier id: ${id}. Only 'pochta-russia' is available.`)
    }
    return POCHTA_RUSSIA_CARRIER
  }

  // ── Manifests (Batches / Партии) ─────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new PochtaRussiaClient(credentials)
    // GET /1.0/batch ("Поиск всех партий") — "size Количество записей на
    // странице", "page Номер страницs (0..N)": 0-based upstream pages. The
    // response is a bare array with no total, so only a short page marks the
    // end; pageByRows peeks at the next upstream page when a caller page ends
    // on a full one, which makes hasMore exact. The upstream page is sized from
    // the caller's limit (capped at the adapter's MAX_PAGE_SIZE), so that size
    // is in the key; a larger limit is served from several upstream pages.
    const size = Math.min(Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope(POCHTA_RUSSIA_API_BASE, credentials), 'batch', {
      size,
    })
    const { items } = await pageByRows<Manifest, number>(
      key,
      params,
      async (page = 0) => {
        const res = await client.get<PochtaRussiaBatch[]>('/batch', { size, page })
        const rows = Array.isArray(res) ? res : []
        return {
          items: rows.map(transformManifest),
          next: rows.length < size ? undefined : page + 1,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new PochtaRussiaClient(credentials)
    // GET /1.0/batch/{batch_name} — find batch by name (batch-name is the identifier)
    const raw = await client.get<PochtaRussiaBatch>(`/batch/${id}`)
    return transformManifest(raw)
  }
}

/**
 * Every record of every партия, in order. The specification documents no
 * account-wide list; each отправление belongs to a партия, and both levels
 * page by "size" and "page Номер страницs (0..N)":
 *   GET /1.0/batch                 ("Поиск всех партий")
 *   GET /1.0/batch/{name}/shipment ("Запрос данных о заказах в партии")
 * Neither returns a total or a next link, so a short page ends each level.
 * pageByRows walks the batches in order and each batch's records in order;
 * the cursor carries the batch page's names, so it replays without refetching
 * them. Record pages are sized from the caller's limit (capped at
 * MAX_PAGE_SIZE), batch pages at MAX_PAGE_SIZE: both sizes are in the key,
 * because the cursor's {index, page} counts pages of that size.
 *
 * Archived партии are read by GET /1.0/archive ("Запрос данных о партиях в
 * архиве"), which takes no paging parameters. The specification does not say
 * whether GET /1.0/batch also returns them, so they are not walked here.
 */
async function walkBatchRecords<T>(
  credentials: Credentials,
  params: QueryParams,
  resource: string,
  transform: (raw: PochtaRussiaShipment) => T,
): Promise<T[]> {
  const client = new PochtaRussiaClient(credentials)
  const size = Math.min(Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
  const batchSize = MAX_PAGE_SIZE
  const key = cursorPagerKey(connectionScope(POCHTA_RUSSIA_API_BASE, credentials), resource, {
    size,
    batchSize,
  })
  const { items } = await pageByRows<T, BatchShipmentCursor>(
    key,
    params,
    async (cursor) => {
      const batchPage = cursor?.batchPage ?? 0
      let names = cursor?.names
      let lastBatchPage = cursor?.lastBatchPage ?? false
      if (!names) {
        const res = await client.get<PochtaRussiaBatch[]>('/batch', {
          size: batchSize,
          page: batchPage,
        })
        const batches = Array.isArray(res) ? res : []
        // "batch-name - Строка Номер партии" is required; skip a row without one.
        names = batches
          .map((b) => b['batch-name'])
          .filter((n): n is string => typeof n === 'string' && n !== '')
        lastBatchPage = batches.length < batchSize
        if (names.length === 0)
          return { items: [], next: lastBatchPage ? undefined : { batchPage: batchPage + 1 } }
      }
      const index = cursor?.index ?? 0
      const page = cursor?.page ?? 0
      const res = await client.get<PochtaRussiaShipment[]>(
        `/batch/${encodeURIComponent(names[index]!)}/shipment`,
        { size, page },
      )
      const rows = Array.isArray(res) ? res : []
      let next: BatchShipmentCursor | undefined
      if (rows.length >= size) next = { batchPage, names, lastBatchPage, index, page: page + 1 }
      else if (index + 1 < names.length)
        next = { batchPage, names, lastBatchPage, index: index + 1, page: 0 }
      else if (!lastBatchPage) next = { batchPage: batchPage + 1 }
      return { items: rows.map(transform), next }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

interface BatchShipmentCursor {
  /** 0-based page of GET /1.0/batch. */
  batchPage: number
  /** The batch names on that page; absent until the page is fetched. */
  names?: string[]
  /** That batch page was short: no batch page follows it. */
  lastBatchPage?: boolean
  /** Position in `names`. */
  index?: number
  /** 0-based page of GET /1.0/batch/{name}/shipment. */
  page?: number
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// ── Private payload builders ─────────────────────────────────────────────────

function buildShipmentPayload(data: Partial<Shipment>): Record<string, unknown> {
  const dest = data.destinationAddress
  const origin = data.originAddress
  return {
    'mail-type': data.serviceCode ? Number(data.serviceCode) : 47030,
    'mail-category': 3,
    mass: data.totalWeight
      ? data.totalWeight.unit === 'kg'
        ? data.totalWeight.value * 1000
        : data.totalWeight.unit === 'lb'
          ? Math.round(data.totalWeight.value * 453.592)
          : data.totalWeight.unit === 'oz'
            ? Math.round(data.totalWeight.value * 28.3495)
            : data.totalWeight.value
      : 1000,
    'order-num': data.reference ?? undefined,
    'recipient-name': dest?.name ?? undefined,
    'address-to': dest
      ? {
          place: dest.city ?? undefined,
          region: dest.state ?? undefined,
          street: dest.street1 ?? undefined,
          index: dest.postalCode ?? undefined,
        }
      : undefined,
    'address-from': origin
      ? {
          place: origin.city ?? undefined,
          region: origin.state ?? undefined,
          street: origin.street1 ?? undefined,
          index: origin.postalCode ?? undefined,
        }
      : undefined,
  }
}

function buildOrderPayload(data: Partial<Order>): Record<string, unknown> {
  const dest = data.destinationAddress
  const origin = data.originAddress
  return {
    'mail-type': 47030,
    'mail-category': 3,
    mass: 1000,
    'order-num': data.orderNumber ?? undefined,
    'address-to': dest
      ? {
          place: dest.city ?? undefined,
          region: dest.state ?? undefined,
          street: dest.street1 ?? undefined,
          index: dest.postalCode ?? undefined,
        }
      : undefined,
    'address-from': origin
      ? {
          place: origin.city ?? undefined,
          region: origin.state ?? undefined,
          street: origin.street1 ?? undefined,
          index: origin.postalCode ?? undefined,
        }
      : undefined,
  }
}
