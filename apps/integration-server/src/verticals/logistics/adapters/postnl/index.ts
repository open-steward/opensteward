import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PostNLClient } from './client'

import { transformTracking, type PostNLTrackingResponse } from './transform/tracking'
import { transformShipment, type PostNLLabelResponse } from './transform/shipment'
import { transformLabels } from './transform/label'
import { POSTNL_CARRIER } from './transform/carrier'
import { transformManifest, type PostNLConfirmingResponse } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: order     — PostNL is a pure carrier API (labels + tracking); no order-management endpoint exists.
// Unavailable: rate      — No programmatic rates API; rates are published as static PDFs only.
// Unavailable: warehouse — PostNL's Location webservice is for consumer pickup points, not sender warehouse management.

interface PostNLAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PostNLAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'postnl'
  readonly version = '1'

  constructor(_config: PostNLAdapterConfig = {}) {}

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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PostNLClient(credentials)
    const raw = await client.get<PostNLTrackingResponse>(`shipment/v2/status/barcode/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments (create shipment + label) ────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PostNLClient(credentials)
    const raw = await client.post<PostNLLabelResponse>('shipment/v2_2/label', {
      Customer: {
        CustomerCode: data.reference,
      },
      Message: {
        MessageID: Date.now().toString(),
        MessageTimeStamp: new Date().toISOString(),
        Printertype: 'GraphicFile|PDF',
      },
      Shipments: [
        {
          Addresses: [
            data.destinationAddress
              ? {
                  AddressType: '01',
                  FirstName: data.destinationAddress.name,
                  CompanyName: data.destinationAddress.company,
                  Street: data.destinationAddress.street1,
                  HouseNr: data.destinationAddress.street2,
                  Zipcode: data.destinationAddress.postalCode,
                  City: data.destinationAddress.city,
                  Countrycode: data.destinationAddress.country,
                }
              : undefined,
          ].filter(Boolean),
          Barcode: data.trackingNumber,
          Dimension: data.dimensions
            ? {
                Weight: data.totalWeight?.value,
              }
            : undefined,
          ProductCodeDelivery: data.serviceCode ?? '3085',
        },
      ],
    })
    const shipment = raw.ResponseShipments?.[0]
    if (!shipment) {
      throw new Error('No shipment returned from PostNL')
    }
    return transformShipment(shipment)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new PostNLClient(credentials)
    const raw = await client.get<PostNLLabelResponse>(`shipment/v2_2/label/${id}`)
    const shipment = raw.ResponseShipments?.[0]
    if (!shipment) {
      throw new Error(`No shipment found for barcode ${id}`)
    }
    const labels = transformLabels(shipment)
    if (labels.length === 0) {
      throw new Error(`No labels found on shipment ${id}`)
    }
    return labels[0]
  }

  // ── Carrier (static) ───────────────────────────────────────────────────────
  // PostNL has no carrier-listing endpoint; PostNL itself is the single carrier.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [POSTNL_CARRIER]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return POSTNL_CARRIER
  }

  // ── Manifests (via Confirming webservice) ──────────────────────────────────
  // PostNL Confirming endpoint: POST /shipment/v2/confirm
  // Submits barcodes into the PostNL distribution process.

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new PostNLClient(credentials)
    const messageId = Date.now().toString()
    const barcodes: string[] = (data.shipmentIds ?? []).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )
    const raw = await client.post<PostNLConfirmingResponse>('shipment/v2/confirm', {
      Customer: {
        CustomerCode: '',
        CustomerNumber: '',
        CollectionLocation: '',
      },
      Message: {
        MessageID: messageId,
        MessageTimeStamp: new Date().toISOString(),
      },
      Shipments: barcodes.map((barcode) => ({
        Barcode: barcode,
        Addresses: [],
      })),
    })
    return transformManifest(raw, messageId)
  }
}
