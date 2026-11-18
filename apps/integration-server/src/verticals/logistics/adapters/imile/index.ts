import type { CredentialField } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import {
  credentialFields as imileCredentialFields,
  exchangeCredentials as imileExchangeCredentials,
  getAuthUrl as imileGetAuthUrl,
  refreshCredentials as imileRefreshCredentials,
} from './auth'
import { IMileClient } from './client'
import { IMILE_LANGUAGE_ENGLISH, IMILE_ORDER_TYPE_WAYBILL, IMILE_TRACK_ONE_PATH } from './constants'

import { transformShipment, type IMileShipment } from './transform/shipment'
import { transformTracking, type IMileTrackOne } from './transform/tracking'
import { transformLabel, type IMileLabel } from './transform/label'
import { transformOrder, type IMileOrder } from './transform/order'
import { transformRate, type IMileRate } from './transform/rate'
import { getIMileCarrier } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Not implemented: warehouse — the public catalog documents POST /client/wmsOrder/listWmsHouses
//                  ("This interface is used to get the list of all warehouses in a country."), not yet mapped here
// Not implemented: manifest  — no manifest collection in the public catalog; POST /order/pick/notify (pickup
//                  appointments) only mentions "Australia manifest" functionality

/**
 * iMile's public Open API catalog lists 36 documents at
 * https://developer.imile.com (catalog JSON:
 * /third/web/api/doc/category/page, each document at
 * /apis/details/<id>). None of them lists an account's shipments, orders or
 * tracking events, and none reads one shipment or order record:
 *   - "Track Order(Batch)", POST /client/track/list
 *     (https://developer.imile.com/apis/details/1826890969244053505), takes
 *     the body fields orderType, language and orderNo (an array of waybill
 *     numbers), all required, and no page or pageSize.
 *   - " Transfer Orders", POST /client/order/queryTransferOrders
 *     (https://developer.imile.com/apis/details/1825840735831273473), is
 *     "used to query the orders that can be transferred": a filtered subset,
 *     not the account's orders.
 * The paths this adapter used to call (shipment/list, order/list,
 * tracking/list, shipment/query, order/query) are not in the catalog, so
 * those methods refuse before sending anything.
 */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface IMileAdapterConfig {
  appKey?: string
  appSecret?: string
}

/**
 * iMile Express logistics adapter.
 *
 * iMile is a last-mile carrier operating primarily in the Middle East,
 * South Asia, and Africa. The adapter covers:
 *   - Shipment creation and retrieval
 *   - Order management
 *   - Tracking events
 *   - Rate queries
 *   - Label generation / retrieval
 *   - Shipment cancellation
 *
 * Auth: Customer ID + Sign Key, collected through the credential form and
 * exchanged at POST /auth/accessToken/grant for a two-hour access token
 * (see auth.ts). No OAuth redirect.
 */
export class IMileAdapter implements LogisticsAdapter {
  readonly platform = 'imile'
  readonly version = '1'

  constructor(_config: IMileAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return imileCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return imileExchangeCredentials(fields)
  }

  getAuthUrl(state: string): never {
    return imileGetAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'iMile has no OAuth redirect: use credentialFields() / exchangeCredentials() instead of exchangeCode()',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return imileRefreshCredentials(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'iMile cannot list shipments: its Open API catalog (developer.imile.com) documents no shipment list endpoint; POST /client/track/list only looks up the waybill numbers named in its required "orderNo" array',
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      'iMile cannot read a shipment record: its Open API catalog (developer.imile.com) documents no shipment lookup endpoint',
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new IMileClient(credentials)
    const body = {
      orderNo: data.reference,
      serviceType: data.serviceCode,
      senderAddress: data.originAddress
        ? {
            name: data.originAddress.name,
            companyName: data.originAddress.company,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      receiverAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      length: data.dimensions?.length,
      width: data.dimensions?.width,
      height: data.dimensions?.height,
    }
    const res = await client.post<IMileShipment>('shipment/create', body)
    return transformShipment(res.data ?? {})
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new IMileClient(credentials)
    await client.post<unknown>('shipment/cancel', { waybillNo: id })
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(
      'iMile cannot list orders: its Open API catalog (developer.imile.com) documents no order list endpoint; POST /client/order/queryTransferOrders is "used to query the orders that can be transferred", not all orders',
    )
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(
      'iMile cannot read an order record: its Open API catalog (developer.imile.com) documents no order lookup endpoint',
    )
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new IMileClient(credentials)
    const body = {
      orderNo: data.orderNumber,
      senderAddress: data.originAddress
        ? {
            name: data.originAddress.name,
            companyName: data.originAddress.company,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      receiverAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
    }
    const res = await client.post<IMileOrder>('order/create', body)
    return transformOrder(res.data ?? {})
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new IMileClient(credentials)
    await client.post<unknown>('order/cancel', { orderNo: id })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * "Order Track Query (Single)", POST /client/track/getOne
   * (https://developer.imile.com/apis/details/1826891449751908354): orderType
   * "1: Waybill number", language "2: English", orderNo "The order number you
   * want to query".
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new IMileClient(credentials)
    const res = await client.post<IMileTrackOne>(IMILE_TRACK_ONE_PATH, {
      orderType: IMILE_ORDER_TYPE_WAYBILL,
      language: IMILE_LANGUAGE_ENGLISH,
      orderNo: trackingNumber,
    })
    return res.data ? transformTracking(res.data) : []
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'iMile cannot list tracking events: POST /client/track/list ("Track Order(Batch)") requires an "orderNo" array of waybill numbers and has no page or pageSize parameter',
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new IMileClient(credentials)
    const res = await client.post<IMileRate[]>('rate/query', {
      senderCountryCode: params.originAddress.country,
      receiverCountryCode: params.destinationAddress.country,
      receiverCity: params.destinationAddress.city,
      weight: params.packages[0]?.weight?.value,
      length: params.packages[0]?.dimensions?.length,
      width: params.packages[0]?.dimensions?.width,
      height: params.packages[0]?.dimensions?.height,
    })
    return (res.data ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new IMileClient(credentials)
    const res = await client.post<IMileLabel>('label/query', { waybillNo: id })
    return transformLabel(res.data ?? { waybillNo: id })
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create an iMile label')
    const client = new IMileClient(credentials)
    const res = await client.post<IMileLabel>('label/create', {
      waybillNo: data.shipmentId,
      labelFormat: data.format ?? 'PDF',
    })
    return transformLabel(res.data ?? { waybillNo: data.shipmentId })
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new IMileClient(credentials)
    await client.post<unknown>('shipment/cancel', { waybillNo: id })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // iMile is itself the carrier — no listing endpoint exists. A static derived
  // record is returned representing the platform's own identity.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [getIMileCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    if (id !== 'imile') {
      throw new Error(`Carrier '${id}' not found — iMile adapter only exposes carrier 'imile'`)
    }
    return getIMileCarrier()
  }
}
