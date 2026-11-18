// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — bpost Shipping Manager API has no manifest/end-of-day closeout endpoint
// Unavailable: warehouse — bpost API has no warehouse/depot management endpoint
//
// Documentation: "bpack integration manual v 3.3.35" (26/05/2026),
// https://bpost.freshdesk.com/helpdesk/attachments/4176380323, with the SHM API
// examples (https://bpost.freshdesk.com/helpdesk/attachments/4122899940) and
// XSDs (https://bpost.freshdesk.com/helpdesk/attachments/4139726880), all linked
// from https://bpost.freshdesk.com/support/solutions/articles/4000037653.
//
// Read methods follow those documents: Basic auth with account id and
// passphrase, account-scoped Shipping Manager paths, versioned XML media
// types. The write methods (createShipment, cancelShipment, createOrder,
// createLabel) still send the JSON bodies and /shipments paths they were
// written with, which the manual does not document; they are unchanged here.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Rate } from '../../schema/rate'
import { pageLocally, type CredentialField } from '@opensteward/shared'

import {
  credentialFields as bpostCredentialFields,
  exchangeCredentials as bpostExchangeCredentials,
} from './auth'
import { BpostClient, BpostTrackingClient } from './client'
import { BPOST_CARRIER_ID, ORDER_MEDIA_TYPE, PRODUCT_CONFIGURATION_MEDIA_TYPE } from './constants'

import { parseItemTracking, transformTrackingEvents } from './transform/tracking'
import { transformShipment, type BpostShipmentResponse } from './transform/shipment'
import { transformLabel } from './transform/label'
import { parseOrderInfo, transformOrder, type BpostOrderInfo } from './transform/order'
import {
  parseProductConfiguration,
  transformCarrier,
  type BpostProductConfigResponse,
} from './transform/carrier'
import { transformRates } from './transform/rate'

export class BpostAdapter implements LogisticsAdapter {
  readonly platform = 'bpost'
  readonly version = '1'

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Static Basic auth (account id + Shipping Manager passphrase): there is no
  // OAuth redirect, token endpoint or refresh (see auth.ts).

  credentialFields(): CredentialField[] {
    return bpostCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return bpostExchangeCredentials(fields)
  }

  getAuthUrl(_state: string): string {
    throw new Error(
      'bpost uses Basic auth with an account ID and passphrase; use credentialFields() instead.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'bpost uses Basic auth with an account ID and passphrase; use exchangeCredentials() instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Tracking Events ────────────────────────────────────────────────────────
  // GET https://api.parcel.bpost.cloud/services/trackedmail/item/{item_nb}/trackingInfo (manual §E.3.4).

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new BpostTrackingClient(credentials)
    const xml = await client.getXml(`/item/${encodeURIComponent(trackingNumber)}/trackingInfo`)
    return transformTrackingEvents(parseItemTracking(xml))
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BpostClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      sender: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        addressLine1: data.originAddress?.street1,
        addressLine2: data.originAddress?.street2,
        city: data.originAddress?.city,
        postalCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      receiver: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        addressLine1: data.destinationAddress?.street1,
        addressLine2: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        postalCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<BpostShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new BpostClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // GET {serviceEndPoint}/{accountId}/orders/{reference} (manual §C.3.5). There
  // is no order collection: "The Retrieve Order web service retrieves an order
  // by its reference."

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BpostClient(credentials)
    const xml = await client.getXml(`/orders/${encodeURIComponent(id)}`, ORDER_MEDIA_TYPE)
    return transformOrder(parseOrderInfo(xml))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new BpostClient(credentials)
    const body = {
      reference: data.orderNumber ?? data.id,
      costCenter: (data.metadata as Record<string, unknown> | undefined)?.costCenter,
    }
    const res = await client.post<BpostOrderInfo>('/orders', body)
    return transformOrder(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // bpost is one carrier. GET {serviceEndPoint}/{accountId}/productconfig
  // (manual §C.3.6, "This service will return all information about the
  // configuration of this shop") fills its services. The endpoint takes no
  // paging parameters, and the collection is that one row, paged locally.

  private async fetchProductConfiguration(
    credentials: Credentials,
  ): Promise<BpostProductConfigResponse> {
    const client = new BpostClient(credentials)
    return parseProductConfiguration(
      await client.getXml('/productconfig', PRODUCT_CONFIGURATION_MEDIA_TYPE),
    )
  }

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    return pageLocally(
      [transformCarrier(await this.fetchProductConfiguration(credentials))],
      params,
    )
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    if (id !== BPOST_CARRIER_ID) {
      throw Object.assign(new Error(`bpost carrier '${id}' not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformCarrier(await this.fetchProductConfiguration(credentials))
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const res = await this.fetchProductConfiguration(credentials)
    const weightGrams = params.packages.reduce((sum, pkg) => {
      if (!pkg.weight) return sum
      const { value, unit } = pkg.weight
      if (unit === 'g') return sum + value
      if (unit === 'kg') return sum + value * 1000
      if (unit === 'lb') return sum + value * 453.592
      if (unit === 'oz') return sum + value * 28.3495
      return sum
    }, 0)
    return transformRates(res, weightGrams)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new BpostClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      sender: {
        postalCode: (data.metadata as Record<string, unknown> | undefined)?.originPostalCode,
        countryCode: (data.metadata as Record<string, unknown> | undefined)?.originCountry,
      },
      receiver: {
        postalCode: (data.metadata as Record<string, unknown> | undefined)?.destinationPostalCode,
        countryCode: (data.metadata as Record<string, unknown> | undefined)?.destinationCountry,
      },
    }

    const res = await client.post<BpostShipmentResponse>('/shipments', body)
    return transformLabel(res)
  }
}
