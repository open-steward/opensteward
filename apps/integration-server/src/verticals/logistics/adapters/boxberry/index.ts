import { connectionScope, pageByRows, pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BoxberryClient } from './client'

import {
  transformShipment,
  transformParcelStoryShipment,
  type BoxberryShipment,
  type BoxberryParcelStoryItem,
} from './transform/shipment'
import { transformTrackingEvents, type BoxberryStatusItem } from './transform/tracking'
import { transformRate, type BoxberryTariff } from './transform/rate'
import {
  transformLabelUrl,
  transformParcelStoryLabel,
  type BoxberryLabelResponse,
} from './transform/label'
import { transformOrder, transformParcelStoryOrder, type BoxberryOrderRaw } from './transform/order'
import { transformWarehouse, type BoxberryPvz } from './transform/warehouse'
import { transformSelfCarrier } from './transform/carrier'
import {
  transformManifest,
  transformManifestFromCreate,
  type BoxberryParselSendResponse,
  type BoxberryParselSendStoryItem,
} from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Methods follow the first-party API docs,
// https://yandex.ru/support/delivery-boxberry/ru/pages/web-service-addresses
// (JSON API "Основной адрес: https://api.boxberry.ru/json.php").
// tracking — per parcel only (ListStatuses); listTrackingEvents is refused.
// carrier  — derived: Boxberry is itself the only carrier; no carrier-list
//            endpoint exists in the API. A static self-descriptor is returned.
// manifest — built: ParselSend (create transfer act) + ParselSendStory (list acts)

interface BoxberryAdapterConfig {
  /** Override the default API base URL. */
  apiBase?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class BoxberryAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'boxberry'
  readonly version = '1'

  constructor(_config: BoxberryAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * `ParselStory`, Boxberry's only parcel list; see {@link parcelStoryPage}.
   * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    return parcelStoryPage(credentials, params, 'shipments', transformParcelStoryShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new BoxberryClient(credentials)
    // Try by tracking number first; fall back to order ID lookup.
    const raw = await client.get<BoxberryShipment>('getOrderInfoByTrack', {
      ImId: id,
    })
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BoxberryClient(credentials)

    const orderBody = {
      order: {
        PalletNum: '',
        BarCode: data.reference ?? '',
        OrderId: data.reference ?? '',
        PalletId: '',
        Weights: {
          Weight: data.totalWeight?.value
            ? Math.round(
                data.totalWeight.unit === 'kg'
                  ? data.totalWeight.value * 1000
                  : data.totalWeight.value,
              )
            : 0,
        },
        Customer: data.destinationAddress
          ? {
              FIO: data.destinationAddress.name ?? '',
              Phone: data.destinationAddress.phone ?? '',
              Email: data.destinationAddress.email ?? '',
              Address: data.destinationAddress.street1 ?? '',
              City: data.destinationAddress.city ?? '',
              PostalCode: data.destinationAddress.postalCode ?? '',
            }
          : {},
        Items: [],
        Places: [],
      },
    }

    const res = await client.post<BoxberryLabelResponse>('createOrder', orderBody)
    return transformShipment({
      track: res.track,
      label: res.label,
      order_id: data.reference,
      customer: data.destinationAddress
        ? {
            FIO: data.destinationAddress.name,
            Phone: data.destinationAddress.phone,
            Email: data.destinationAddress.email,
            Address: data.destinationAddress.street1,
            City: data.destinationAddress.city,
            PostalCode: data.destinationAddress.postalCode,
          }
        : undefined,
    })
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new BoxberryClient(credentials)
    await client.get<unknown>('deleteOrderByTrack', { ImId: id, CancelType: 1 })
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * `ParselStory` again: Boxberry's parcels are its orders ("Позволяет
   * получить список созданных посылок в ЛК ИМ"); see {@link parcelStoryPage}.
   * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return parcelStoryPage(credentials, params, 'orders', transformParcelStoryOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BoxberryClient(credentials)
    const raw = await client.get<BoxberryOrderRaw>('getOrderInfoByOrderId', {
      ImId: id,
    })
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new BoxberryClient(credentials)

    const orderBody = {
      order: {
        OrderId: data.orderNumber ?? '',
        Customer: data.destinationAddress
          ? {
              FIO: data.destinationAddress.name ?? '',
              Phone: data.destinationAddress.phone ?? '',
              Email: data.destinationAddress.email ?? '',
              Address: data.destinationAddress.street1 ?? '',
              City: data.destinationAddress.city ?? '',
              PostalCode: data.destinationAddress.postalCode ?? '',
            }
          : {},
        Items:
          data.lineItems?.map((li) => ({
            Id: li.id ?? '',
            Name: li.name ?? '',
            Amount: li.unitAmount ?? 0,
            Quantity: li.quantity ?? 1,
          })) ?? [],
        Places: [],
      },
    }

    const res = await client.post<BoxberryLabelResponse>('createOrder', orderBody)
    return transformOrder({
      track: res.track,
      order_id: data.orderNumber,
      customer: data.destinationAddress
        ? {
            FIO: data.destinationAddress.name,
            Phone: data.destinationAddress.phone,
            Email: data.destinationAddress.email,
            Address: data.destinationAddress.street1,
            City: data.destinationAddress.city,
            PostalCode: data.destinationAddress.postalCode,
          }
        : undefined,
    })
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new BoxberryClient(credentials)
    await client.get<unknown>('deleteOrderByOrderId', { ImId: id, CancelType: 1 })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * `ListStatuses` takes one required `ImId` ("Трек-номер посылки/Номер
   * заказа") and returns the parcel's status history as an array of
   * `{ Date, Name }`.
   * https://yandex.ru/support/delivery-boxberry/ru/pages/list-statuses
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new BoxberryClient(credentials)
    const res = await client.get<BoxberryStatusItem[] | BoxberryError>('ListStatuses', {
      ImId: trackingNumber,
    })
    return transformTrackingEvents(trackingNumber, expectArray(res, 'ListStatuses'))
  }

  /**
   * Refused. Boxberry's status methods are all per parcel: `ListStatuses` and
   * `ListStatusesFull` require `ImId`, and `GetLastStatusData` requires
   * `trackNumbers` and returns only each parcel's last status. None lists
   * events across the account.
   */
  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'Boxberry cannot list tracking events: its status methods are per parcel ' +
        '(ListStatuses and ListStatusesFull require "ImId — Трек-номер посылки/Номер заказа"; ' +
        'GetLastStatusData requires "trackNumbers" and returns only the last status). ' +
        'Use GET /tracking-events/{trackingNumber}.',
    )
  }

  // ── Warehouses (PVZ pickup points) ─────────────────────────────────────────

  /**
   * `ListPoints`: "Позволяет получить информацию о всех точках выдачи
   * заказов." It documents no page, limit or offset, only filters, so the one
   * response is paged locally. `prepaid=1` is the docs' own request for
   * "все отделения" (without it the default 0 returns only points that take
   * payment on collection).
   * https://yandex.ru/support/delivery-boxberry/ru/pages/list-points
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    return pageLocally(await listPoints(credentials), params).map(transformWarehouse)
  }

  /** `ListPoints` has no lookup by code, so the point is found in the full list. */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const pvz = (await listPoints(credentials)).find((p) => p.Code === id)
    if (!pvz) {
      throw Object.assign(new Error(`Boxberry pickup point not found: ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformWarehouse(pvz)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new BoxberryClient(credentials)

    const weightG = (() => {
      const pkg = params.packages[0]
      if (!pkg?.weight) return 1000
      const { value, unit } = pkg.weight
      if (unit === 'kg') return Math.round(value * 1000)
      if (unit === 'g') return Math.round(value)
      if (unit === 'lb') return Math.round(value * 453.592)
      if (unit === 'oz') return Math.round(value * 28.3495)
      return 1000
    })()

    const raw = await client.get<BoxberryTariff>('calcTariff', {
      weight: weightG,
      target: params.destinationAddress.postalCode ?? '',
      orderSum: 0,
    })

    return [transformRate(raw)]
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * `ParselStory` rows carry `label`, "Ссылка на скачивание pdf файла с
   * этикетками"; rows with no label URL are skipped. See {@link parcelStoryPage}.
   * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
   */
  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    return parcelStoryPage(credentials, params, 'labels', transformParcelStoryLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new BoxberryClient(credentials)
    // getLabel returns a URL string for the label PDF.
    const url = await client.get<string>('getLabel', { ImId: id })
    return transformLabelUrl(typeof url === 'string' ? url : String(url ?? ''), id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.trackingNumber && !data.shipmentId) {
      throw new Error('trackingNumber or shipmentId is required to create a Boxberry label')
    }
    const id = data.trackingNumber ?? data.shipmentId ?? ''
    return this.getLabel(credentials, id)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Boxberry cancels the underlying order (cancelType=2 = cancel without deletion).
    const client = new BoxberryClient(credentials)
    await client.get<unknown>('deleteOrderByTrack', { ImId: id, CancelType: 2 })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Boxberry is itself the single carrier — derived from platform identity.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformSelfCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformSelfCarrier()
  }

  // ── Manifests (Transfer Acts / Акты приема-передачи) ──────────────────────
  // ParselSendStory lists acts; ParselSend creates an act.

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new BoxberryClient(credentials)

    // ParselSendStory documents only token, method and a from/to date range:
    // no page, limit or next signal, so whatever one response returns is paged
    // locally. Known gap (rebuild backlog, not paging): the docs say that
    // without from/to only the most recently created act is returned, and no
    // range is sent here, so the collection this pages is that single act.
    // https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-send-story
    const res = await client.get<BoxberryParselSendStoryItem[]>('ParselSendStory')
    const items = Array.isArray(res) ? res : []

    return pageLocally(items, params).map(transformManifest)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new BoxberryClient(credentials)

    const shipmentIds = data.shipmentIds ?? []
    const imIds = shipmentIds.join(',')
    const res = await client.get<BoxberryParselSendResponse>('ParselSend', {
      ImIds: imIds,
    })
    return transformManifestFromCreate(res, shipmentIds)
  }
}

// ── ParselStory date windows ─────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** A documented Boxberry error body, e.g. `{ "err": "Слишком много запросов" }`. */
interface BoxberryError {
  err?: unknown
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The array a list method returns. Boxberry reports failures in the body as
 * `err` (`{ "err": "Слишком много запросов" }`,
 * https://yandex.ru/support/delivery-boxberry/ru/pages/request-limits; `err`
 * is `false` on success where a method documents it, e.g. WarehouseInfo), so
 * an `err` other than false is thrown rather than read as an empty list. Any
 * other non-array body holds no rows.
 */
function expectArray<T>(res: T[] | BoxberryError | null | undefined, method: string): T[] {
  if (Array.isArray(res)) return res
  const err = res && typeof res === 'object' && 'err' in res ? res.err : undefined
  if (err !== undefined && err !== false && err !== null) {
    throw new Error(`Boxberry ${method} failed: ${String(err)}`)
  }
  return []
}

async function listPoints(credentials: Credentials): Promise<BoxberryPvz[]> {
  const client = new BoxberryClient(credentials)
  const res = await client.get<BoxberryPvz[] | BoxberryError>('ListPoints', { prepaid: 1 })
  return expectArray(res, 'ListPoints')
}

/** Months since year 0 in UTC, so every window is one UTC calendar month. */
function utcMonthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/** The first day of month `index`, as ParselStory's YYYYMMDD integer. */
function monthStart(index: number): number {
  return Math.floor(index / 12) * 10000 + ((index % 12) + 1) * 100 + 1
}

/** The month of a ParselStory `date` ("YYYY.MM.DD HH:MM:SS"), or undefined. */
function parcelMonth(date: string | null | undefined): number | undefined {
  const m = /^(\d{4})\.(\d{2})\./.exec(date ?? '')
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : undefined
}

/**
 * The caller's page of ParselStory, Boxberry's only parcel list: "Позволяет
 * получить список созданных посылок в ЛК ИМ. Если не указывать диапазоны
 * дат, то будет возвращена последняя созданная посылка. Для указания
 * диапазона дат используется параметры from (период с) и to (период до) в
 * формате YYYYMMDD." Its only parameters are token, method, from and to: no
 * page, limit or offset.
 * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
 *
 * Without a range it returns one parcel, and the docs name no retention limit
 * to bound a range, so a call without `updatedAfter` is refused. With it, the
 * UTC calendar months from the newest back to the month of `updatedAfter`
 * are the upstream pages of `pageByRows`. `from` is the month's first day and
 * `to` the next month's first day. Whether `to` is inclusive is not
 * documented, so only rows whose `date` falls in the month are kept: a row is
 * served once whichever way `to` reads. A row whose `date` does not parse is
 * kept in the window that returned it. The newest month is the one holding
 * tomorrow (UTC): ParselStory's `date` has no documented zone, and Boxberry
 * gives MSK (GMT+3) for its other timestamps, so a parcel created just after
 * midnight in Moscow still falls inside a window.
 *
 * ParselStory filters by creation date, so `updatedAfter` bounds when a
 * parcel was CREATED: parcels created before it are not served.
 */
async function parcelStoryPage<T>(
  credentials: Credentials,
  params: QueryParams,
  collection: string,
  map: (row: BoxberryParcelStoryItem) => T | undefined,
): Promise<T[]> {
  const after = params.updatedAfter
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
    throw notSupported(
      `Boxberry cannot list ${collection} without updatedAfter: its only parcel list, ParselStory, ` +
        '"Если не указывать диапазоны дат, то будет возвращена последняя созданная посылка", ' +
        'and the docs name no retention limit to bound the from/to range walked',
    )
  }
  const newest = utcMonthIndex(new Date(Date.now() + DAY_MS))
  const oldest = Math.min(utcMonthIndex(after), newest)
  const client = new BoxberryClient(credentials)
  const key = `${connectionScope('boxberry', credentials)}:parcel-story:${collection}:${newest}:${oldest}`
  const { items } = await pageByRows<T, number>(key, params, async (cursor) => {
    const month = cursor ?? newest
    const res = await client.get<BoxberryParcelStoryItem[] | BoxberryError>('ParselStory', {
      from: monthStart(month),
      to: monthStart(month + 1),
    })
    const rows: T[] = []
    for (const row of expectArray(res, 'ParselStory')) {
      if (!row.track) continue
      const m = parcelMonth(row.date)
      if (m !== undefined && m !== month) continue
      const out = map(row)
      if (out !== undefined) rows.push(out)
    }
    return { items: rows, next: month > oldest ? month - 1 : null }
  })
  return items
}
