import type { LogisticsAdapter, Credentials, QueryParams, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import { pageLocally } from '@opensteward/shared'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available: label, rate, shipment, trackingevent, carrier, manifest
// Unavailable: order  — Amazon Shipping v2 has no order management endpoints; orders live in the separate SP-API Orders API
// Unavailable: warehouse — Amazon Shipping v2 has no warehouse/address-book concept; ship-from addresses are per-request parameters

import {
  buildAuthUrl,
  exchangeCode as doExchange,
  refreshCredentials as doRefresh,
  ensureAuth,
  type AmazonShippingAuthConfig,
} from './auth'
import { AmazonShippingClient } from './client'
import { transformTracking, type AmazonTrackingResponse } from './transform/tracking'
import { transformShipment, type AmazonShippingShipment } from './transform/shipment'
import { transformRate, extractRates, type AmazonRatesResponse } from './transform/rate'
import {
  transformCarrier,
  extractCarriers,
  type AmazonGetCarrierAccountsResponse,
} from './transform/carrier'
import {
  transformManifestFromDocument,
  transformManifestFromHistory,
  extractManifestHistory,
  type AmazonCollectionFormResponse,
  type AmazonGetCollectionFormHistoryResponse,
} from './transform/manifest'

interface AmazonShippingAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class AmazonShippingAdapter implements LogisticsAdapter {
  readonly platform = 'amazon-shipping'
  readonly version = '2'

  constructor(private config: AmazonShippingAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const cfg: AmazonShippingAuthConfig = {
      clientId: this.config.clientId ?? '',
      clientSecret: this.config.clientSecret ?? '',
      sandbox: this.config.sandbox,
    }
    return doExchange(code, redirectUri, cfg)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const raw = await client.get<AmazonTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const raw = await client.post<AmazonShippingShipment>('shipments', {
      shipFrom: data.originAddress
        ? {
            name: data.originAddress.name,
            companyName: data.originAddress.company,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            stateOrRegion: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
            phoneNumber: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      shipTo: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            stateOrRegion: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phoneNumber: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      serviceType: data.serviceCode,
      clientReferenceId: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  /**
   * Request shipping rates. Amazon Shipping v2 `getRates` accepts origin,
   * destination, packages and an optional list of `serviceTypes`. Returns
   * service-level rate quotes.
   */
  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const body: Record<string, unknown> = {
      shipFrom: params.originAddress
        ? {
            name: params.originAddress.name,
            companyName: params.originAddress.company,
            addressLine1: params.originAddress.street1,
            addressLine2: params.originAddress.street2,
            city: params.originAddress.city,
            stateOrRegion: params.originAddress.state,
            postalCode: params.originAddress.postalCode,
            countryCode: params.originAddress.country,
          }
        : undefined,
      shipTo: params.destinationAddress
        ? {
            name: params.destinationAddress.name,
            addressLine1: params.destinationAddress.street1,
            city: params.destinationAddress.city,
            stateOrRegion: params.destinationAddress.state,
            postalCode: params.destinationAddress.postalCode,
            countryCode: params.destinationAddress.country,
          }
        : undefined,
      packages: (params.packages ?? []).map((pkg) => ({
        dimensions: pkg.dimensions
          ? {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              unit: pkg.dimensions.unit === 'cm' ? 'CENTIMETER' : 'INCH',
            }
          : undefined,
        weight: pkg.weight
          ? {
              value: pkg.weight.value,
              unit: pkg.weight.unit === 'kg' ? 'KILOGRAM' : 'POUND',
            }
          : undefined,
      })),
    }
    if (params.serviceCodes && params.serviceCodes.length > 0) {
      body['serviceTypes'] = params.serviceCodes
    }
    const raw = await client.post<AmazonRatesResponse>('rates', body)
    return extractRates(raw).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * Refused before any request. The model's only label read is
   * getShipmentDocuments (`GET /shipping/v2/shipments/{shipmentId}/documents`),
   * whose `packageClientReferenceId` query parameter is required, so a
   * shipment id alone cannot address a label. The path this method used to
   * call, `shipments/{id}/label`, is not in the model.
   * https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    void credentials
    void id
    throw Object.assign(
      new Error(
        'Amazon Shipping cannot read a label by shipment id alone: getShipmentDocuments ' +
          '(GET /shipping/v2/shipments/{shipmentId}/documents) requires the query parameter ' +
          'packageClientReferenceId, "The package client reference identifier originally ' +
          'provided in the request body parameter for the getRates operation."',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  /**
   * Refused before any request: no operation in the Shipping v2 model lists
   * labels or shipments. Labels come back from the purchase operations and are
   * read per package through getShipmentDocuments.
   */
  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    void credentials
    void params
    throw Object.assign(
      new Error(
        'Amazon Shipping cannot list labels: the Shipping API v2 has no label or shipment ' +
          'list operation; its only label read is getShipmentDocuments, which "Returns the ' +
          'shipping documents associated with a package in a shipment."',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * List carrier accounts linked to the merchant.
   * Amazon Shipping v2 `getCarrierAccounts` (`PUT /shipping/v2/carrierAccounts`)
   * returns all active carrier accounts for the seller. The request has no
   * page, offset or token parameter, so the whole list is sliced locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const raw = await client.put<AmazonGetCarrierAccountsResponse>('carrierAccounts', {})
    return pageLocally(extractCarriers(raw).map(transformCarrier), params)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  /**
   * List previously generated collection forms (manifests).
   * Uses `getCollectionFormHistory` (`PUT /shipping/v2/collectionForms/history`).
   * The response has no page token or offset (only an optional `maxResults`
   * cap), so the one response is sliced locally.
   */
  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const raw = await client.put<AmazonGetCollectionFormHistoryResponse>(
      'collectionForms/history',
      {},
    )
    return pageLocally(extractManifestHistory(raw).map(transformManifestFromHistory), params)
  }

  /**
   * Retrieve a collection form (manifest) by id.
   * Uses `getCollectionForm` (`GET /shipping/v2/collectionForms/{collectionFormId}`).
   */
  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const raw = await client.get<AmazonCollectionFormResponse>(
      `collectionForms/${encodeURIComponent(id)}`,
    )
    return transformManifestFromDocument(raw, id)
  }

  /**
   * Generate a new collection form (manifest).
   * Uses `generateCollectionForm` (`POST /shipping/v2/collectionForms`).
   * The `data.carrierId` field (via metadata or carrierId) is required by the API.
   */
  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonShippingClient(creds)
    const body: Record<string, unknown> = {
      carrierId: data.carrierId,
    }
    const raw = await client.post<AmazonCollectionFormResponse>('collectionForms', body)
    return transformManifestFromDocument(raw)
  }
}
