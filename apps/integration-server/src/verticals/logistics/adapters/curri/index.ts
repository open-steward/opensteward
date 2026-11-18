import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { QueryParams } from '@opensteward/shared'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { CurriClient } from './client'
import { transformShipment, type CurriDelivery } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformRate, type CurriQuote } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Curri is the sole carrier; no carrier management queries or types in the GraphQL API.
// Unavailable: label     — No Label type or list/get query exists; "Refund a Shipping Label" is marked Coming Soon.
// Unavailable: manifest  — ManifestItem is an input-only type for delivery items; no standalone manifest resource.
// Unavailable: order     — No order concept exists; deliveries are the only bookable entity (covered under shipment).
// Unavailable: warehouse — No warehouse or facility management queries; API is purely delivery-dispatch focused.

const DELIVERY_FIELDS = `
  id
  createdAt
  distance
  price
  estimatedTravelTime
  deliveryMethod
  deliveredAt
  trackingUrl
  cancellationReason
  deliveryMeta {
    dropoffNote
    pickupNote
    poNumber
    orderNumber
  }
  deliveryStatus {
    name
    code
  }
  origin {
    name
    addressLine1
    addressLine2
    city
    state
    postalCode
  }
  destination {
    name
    addressLine1
    addressLine2
    city
    state
    postalCode
  }
`

const GET_DELIVERY_QUERY = `
  query GetDelivery($id: String!) {
    delivery(id: $id) {
      ${DELIVERY_FIELDS}
    }
  }
`

const LIST_DELIVERIES_QUERY = `
  query ListDeliveries {
    deliveries {
      ${DELIVERY_FIELDS}
    }
  }
`

const BOOK_DELIVERY_MUTATION = `
  mutation BookDelivery($data: BookDeliveryInput!) {
    bookDelivery(data: $data) {
      ${DELIVERY_FIELDS}
    }
  }
`

const CANCEL_DELIVERY_MUTATION = `
  mutation CancelDelivery($id: String!, $reason: String) {
    cancelDelivery(id: $id, reason: $reason) {
      id
    }
  }
`

const DELIVERY_QUOTES_QUERY = `
  query DeliveryQuotes($data: DeliveryQuotesInput!) {
    deliveryQuotes(data: $data) {
      id
      fee
      deliveryMethod
      duration
      distance
      priority
    }
  }
`

export class CurriAdapter implements LogisticsAdapter {
  readonly platform = 'curri'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [userId, apiKey] = code.split(':')
    return exchangeCredentials({ userId: userId ?? '', apiKey: apiKey ?? '' })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async listShipments(credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    const client = new CurriClient(credentials)
    const resp = await client.query<{ deliveries: CurriDelivery[] }>(LIST_DELIVERIES_QUERY)
    return (resp.deliveries ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CurriClient(credentials)
    const resp = await client.query<{ delivery: CurriDelivery }>(GET_DELIVERY_QUERY, { id })
    return transformShipment(resp.delivery)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CurriClient(credentials)
    const resp = await client.mutate<{ bookDelivery: CurriDelivery }>(BOOK_DELIVERY_MUTATION, {
      data: {
        deliveryMethod: data.serviceCode ?? 'car',
        origin: data.originAddress
          ? {
              name: data.originAddress.name ?? '',
              addressLine1: data.originAddress.street1 ?? '',
              addressLine2: data.originAddress.street2,
              city: data.originAddress.city ?? '',
              state: data.originAddress.state ?? '',
              postalCode: data.originAddress.postalCode ?? '',
            }
          : undefined,
        destination: data.destinationAddress
          ? {
              name: data.destinationAddress.name ?? '',
              addressLine1: data.destinationAddress.street1 ?? '',
              addressLine2: data.destinationAddress.street2,
              city: data.destinationAddress.city ?? '',
              state: data.destinationAddress.state ?? '',
              postalCode: data.destinationAddress.postalCode ?? '',
            }
          : undefined,
        manifestItems: (data.packages ?? []).map((pkg) => ({
          description: pkg.reference ?? 'Package',
          weight: pkg.weight?.value ?? 1,
          height: pkg.dimensions?.height ?? 1,
          width: pkg.dimensions?.width ?? 1,
          length: pkg.dimensions?.length ?? 1,
          quantity: 1,
        })),
      },
    })
    return transformShipment(resp.bookDelivery)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CurriClient(credentials)
    await client.mutate<{ cancelDelivery: { id: string } }>(CANCEL_DELIVERY_MUTATION, {
      id,
      reason: 'User Requested',
    })
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CurriClient(credentials)
    const resp = await client.query<{ delivery: CurriDelivery }>(GET_DELIVERY_QUERY, {
      id: trackingNumber,
    })
    return transformTracking(resp.delivery)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CurriClient(credentials)
    const resp = await client.query<{ deliveryQuotes: CurriQuote[] }>(DELIVERY_QUOTES_QUERY, {
      data: {
        origin: {
          name: params.originAddress.name ?? '',
          addressLine1: params.originAddress.street1 ?? '',
          addressLine2: params.originAddress.street2,
          city: params.originAddress.city ?? '',
          state: params.originAddress.state ?? '',
          postalCode: params.originAddress.postalCode ?? '',
        },
        destination: {
          name: params.destinationAddress.name ?? '',
          addressLine1: params.destinationAddress.street1 ?? '',
          addressLine2: params.destinationAddress.street2,
          city: params.destinationAddress.city ?? '',
          state: params.destinationAddress.state ?? '',
          postalCode: params.destinationAddress.postalCode ?? '',
        },
        manifestItems: (params.packages ?? []).map((pkg) => ({
          description: pkg.reference ?? 'Package',
          weight: pkg.weight?.value ?? 1,
          height: pkg.dimensions?.height ?? 1,
          width: pkg.dimensions?.width ?? 1,
          length: pkg.dimensions?.length ?? 1,
          quantity: 1,
        })),
        priority: 'sameday',
      },
    })
    return (resp.deliveryQuotes ?? []).map(transformRate)
  }
}
