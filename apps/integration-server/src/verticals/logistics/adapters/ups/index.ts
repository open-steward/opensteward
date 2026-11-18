// ── Resource coverage ──────────────────────────────────────────────
// Available:   pickup    — on-call pickups via the Pickup API: createPickup
//                          (POST /pickupcreation/v2409/pickup → PRN) and
//                          cancelPickup (DELETE /shipments/v2409/pickup/02 with
//                          the PRN in the `Prn` header). No listPickups /
//                          getPickup: the only read, GET /shipments/v2409/pickup/
//                          {pickuptype}, is account-scoped (AccountNumber header),
//                          unpaginated and limited to today's and tomorrow's
//                          pickups — it cannot answer for a single PRN. Not yet
//                          declared in metadata.ts; the metadata PR owns that.
// Unavailable: manifest  — UPS shipments are automatically manifested upon
//                          creation; no dedicated Manifest REST API exists in
//                          the UPS developer portal (confirmed via github.com/UPS-API/api-documentation).
// Unavailable: order     — UPS has no Order Management REST API; UPS is a
//                          carrier, not an order management platform.
// Unavailable: warehouse — UPS has no merchant-warehouse REST API; the Pickup
//                          API service-center-locations endpoint returns UPS
//                          facility drop-off/pickup points, not customer warehouses.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
  PickupRequestParams,
  PickupCancelParams,
} from '../../adapter/interface'
import type { Rate } from '../../schema/rate'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Shipment } from '../../schema/shipment'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Pickup } from '../../schema/pickup'

import { buildAuthUrl, exchangeClientCredentials, refreshCredentials as doRefresh } from './auth'
import { UPSClient } from './client'
import {
  UPS_API_BASE,
  UPS_PICKUP_CANCEL_PATH,
  UPS_PICKUP_CREATE_PATH,
  UPS_RATE_PATH,
  UPS_SHIP_PATH,
  UPS_TRACK_PATH,
} from './constants'

import { transformRate, type UPSRateResponse } from './transform/rate'
import { transformTrackingPackage, type UPSTrackResponse } from './transform/tracking'
import { transformShipment, type UPSShipResponse } from './transform/shipment'
import { transformLabel } from './transform/label'
import { transformTrackingEvent } from './transform/trackingevent'
import { getUPSCarrier } from './transform/carrier'
import {
  toPickupCreationRequest,
  transformPickupCancel,
  transformPickupCreation,
  type UPSPickupCancelResponseWrapper,
  type UPSPickupCreationResponseWrapper,
} from './transform/pickup'

export interface UPSAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
  transactionSrc?: string
  /**
   * Shipper (UPS account) number that on-call pickups are billed to. A
   * `createPickup` call can override it with `accountNumber` in its params.
   */
  accountNumber?: string
}

export class UPSAdapter implements LogisticsAdapter {
  readonly platform = 'ups'
  readonly version = '1'

  private config: UPSAdapterConfig

  constructor(config: UPSAdapterConfig = {}) {
    this.config = config
  }

  // -- Auth -------------------------------------------------------------------

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For UPS, "code" is expected as "clientId:clientSecret"
    const [clientId, clientSecret] = code.includes(':')
      ? code.split(':', 2)
      : [this.config.clientId ?? '', code]

    return exchangeClientCredentials(
      clientId || this.config.clientId || '',
      clientSecret || this.config.clientSecret || '',
      this.config.sandbox ? 'https://wwwcie.ups.com' : UPS_API_BASE,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // -- Rates ------------------------------------------------------------------

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new UPSClient(credentials, this.config.transactionSrc)

    const body = {
      RateRequest: {
        Request: {
          SubVersion: '2403',
        },
        Shipment: {
          Shipper: {
            Address: {
              City: params.originAddress.city,
              StateProvinceCode: params.originAddress.state,
              PostalCode: params.originAddress.postalCode,
              CountryCode: params.originAddress.country,
            },
          },
          ShipTo: {
            Address: {
              City: params.destinationAddress.city,
              StateProvinceCode: params.destinationAddress.state,
              PostalCode: params.destinationAddress.postalCode,
              CountryCode: params.destinationAddress.country,
            },
          },
          ShipFrom: {
            Address: {
              City: params.originAddress.city,
              StateProvinceCode: params.originAddress.state,
              PostalCode: params.originAddress.postalCode,
              CountryCode: params.originAddress.country,
            },
          },
          Package: params.packages.map((pkg) => ({
            PackagingType: { Code: '02', Description: 'Package' },
            PackageWeight: {
              UnitOfMeasurement: { Code: pkg.weight?.unit === 'kg' ? 'KGS' : 'LBS' },
              Weight: String(pkg.weight?.value ?? 1),
            },
            ...(pkg.dimensions
              ? {
                  Dimensions: {
                    UnitOfMeasurement: { Code: pkg.dimensions.unit === 'cm' ? 'CM' : 'IN' },
                    Length: String(pkg.dimensions.length),
                    Width: String(pkg.dimensions.width),
                    Height: String(pkg.dimensions.height),
                  },
                }
              : {}),
          })),
        },
      },
    }

    const res = await client.post<UPSRateResponse>(UPS_RATE_PATH, body)
    const ratedShipments = res.RateResponse?.RatedShipment ?? []
    return ratedShipments.map(transformRate)
  }

  // -- Tracking ---------------------------------------------------------------

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new UPSClient(credentials, this.config.transactionSrc)
    const res = await client.get<UPSTrackResponse>(`${UPS_TRACK_PATH}/${trackingNumber}`)

    const packages = res.trackResponse?.shipment?.flatMap((s) => s.package ?? []) ?? []
    return packages.flatMap(transformTrackingPackage)
  }

  /**
   * List tracking events for a parcel identified by tracking number.
   *
   * GET /track/v1/details/{trackingNumber}
   * Callers pass `params.trackingNumber` (or `params.id`) to identify the package.
   * Returns individual per-activity events rather than a flattened per-package view.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new UPSClient(credentials, this.config.transactionSrc)
    const res = await client.get<UPSTrackResponse>(`${UPS_TRACK_PATH}/${trackingNumber}`)
    const packages = res.trackResponse?.shipment?.flatMap((s) => s.package ?? []) ?? []
    return packages.flatMap((pkg) =>
      (pkg.activity ?? []).map((activity) =>
        transformTrackingEvent(activity, pkg.trackingNumber),
      ),
    )
  }

  // -- Shipments (create via Ship API) ----------------------------------------

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new UPSClient(credentials, this.config.transactionSrc)

    const body = {
      ShipmentRequest: {
        Shipment: {
          Description: data.reference ?? 'Shipment',
          Shipper: {
            Name: data.originAddress?.name ?? data.originAddress?.company ?? '',
            AttentionName: data.originAddress?.name ?? '',
            Phone: data.originAddress?.phone ? { Number: data.originAddress.phone } : undefined,
            Address: {
              AddressLine: [data.originAddress?.street1, data.originAddress?.street2].filter(Boolean),
              City: data.originAddress?.city ?? '',
              StateProvinceCode: data.originAddress?.state ?? '',
              PostalCode: data.originAddress?.postalCode ?? '',
              CountryCode: data.originAddress?.country ?? 'US',
            },
          },
          ShipTo: {
            Name: data.destinationAddress?.name ?? data.destinationAddress?.company ?? '',
            AttentionName: data.destinationAddress?.name ?? '',
            Phone: data.destinationAddress?.phone ? { Number: data.destinationAddress.phone } : undefined,
            Address: {
              AddressLine: [data.destinationAddress?.street1, data.destinationAddress?.street2].filter(Boolean),
              City: data.destinationAddress?.city ?? '',
              StateProvinceCode: data.destinationAddress?.state ?? '',
              PostalCode: data.destinationAddress?.postalCode ?? '',
              CountryCode: data.destinationAddress?.country ?? 'US',
            },
          },
          Service: {
            Code: data.serviceCode ?? '03',
            Description: 'UPS Service',
          },
          Package: [
            {
              PackagingType: { Code: '02', Description: 'Package' },
              PackageWeight: {
                UnitOfMeasurement: { Code: data.totalWeight?.unit === 'kg' ? 'KGS' : 'LBS' },
                Weight: String(data.totalWeight?.value ?? 1),
              },
            },
          ],
        },
        LabelSpecification: {
          LabelImageFormat: { Code: 'PNG' },
          LabelStockSize: { Height: '6', Width: '4' },
        },
      },
    }

    const res = await client.post<UPSShipResponse>(UPS_SHIP_PATH, body)
    return transformShipment(res.ShipmentResponse.ShipmentResults)
  }

  // -- Labels -----------------------------------------------------------------

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    // UPS creates labels as part of the Ship API call. We wrap createShipment
    // and extract the label from the response.
    const client = new UPSClient(credentials, this.config.transactionSrc)

    const shipmentData = data.metadata as Record<string, unknown> | undefined

    const body = shipmentData?.ShipmentRequest ?? {
      ShipmentRequest: {
        Shipment: {
          Description: 'Label',
          Shipper: {},
          ShipTo: {},
          Service: { Code: data.serviceCode ?? '03' },
          Package: [
            {
              PackagingType: { Code: '02' },
              PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: '1' },
            },
          ],
        },
        LabelSpecification: {
          LabelImageFormat: { Code: 'PNG' },
          LabelStockSize: { Height: '6', Width: '4' },
        },
      },
    }

    const res = await client.post<UPSShipResponse>(UPS_SHIP_PATH, body)
    return transformLabel(res.ShipmentResponse.ShipmentResults)
  }

  // -- Carriers ---------------------------------------------------------------

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    // UPS is the carrier itself — return a single static record.
    return [getUPSCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    if (id !== 'ups') {
      throw new Error(`ups: unknown carrier id "${id}"`)
    }
    return getUPSCarrier()
  }

  // -- Pickups (Pickup API) ---------------------------------------------------

  /**
   * Schedule an on-call pickup.
   *
   * POST /api/pickupcreation/v2409/pickup — the Pickup API, not the Shipping
   * API's /shipments/{v}/pickup/{type}, which only rates one. UPS answers with
   * a PRN and nothing else about the pickup, so the record is the PRN plus a
   * status; the request is not echoed back. See `toPickupCreationRequest` for
   * what UPS needs beyond the canonical params.
   */
  async createPickup(credentials: Credentials, data: PickupRequestParams): Promise<Pickup> {
    const client = new UPSClient(credentials, this.config.transactionSrc)
    const body = {
      PickupCreationRequest: toPickupCreationRequest(data, {
        accountNumber: this.config.accountNumber,
      }),
    }
    const res = await client.post<UPSPickupCreationResponseWrapper>(UPS_PICKUP_CREATE_PATH, body)
    return transformPickupCreation(res.PickupCreationResponse)
  }

  /**
   * Cancel an on-call pickup by PRN.
   *
   * DELETE /api/shipments/v2409/pickup/02 with the PRN in the `Prn` header —
   * CancelBy 02 is "by PRN"; 01 would cancel every pending pickup on the
   * account. UPS takes no reason, so `data.reason` is accepted and ignored.
   */
  async cancelPickup(
    credentials: Credentials,
    id: string,
    _data?: PickupCancelParams,
  ): Promise<Pickup> {
    const client = new UPSClient(credentials, this.config.transactionSrc)
    const res = await client.delete<UPSPickupCancelResponseWrapper>(UPS_PICKUP_CANCEL_PATH, {
      Prn: id,
    })
    return transformPickupCancel(res.PickupCancelResponse, id)
  }
}
