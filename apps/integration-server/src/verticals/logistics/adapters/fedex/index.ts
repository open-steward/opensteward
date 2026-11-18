// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order     — the FedEx REST API (apis.fedex.com) has no order management
//                          endpoint; orders exist only in FedEx Supply Chain
//                          (connect.supplychain.fedex.com), a separate product with
//                          different auth not used by this adapter.
// Unavailable: warehouse — FedEx has no merchant-warehouse concept; the Locations
//                          Search API returns FedEx facility drop-off points, not
//                          customer warehouses.
// manifest — built: PUT /ship/v1/endofday/ (Ground End of Day Close, closeReqType
//            GCDR) per FedEx's published Close API spec. It closes every open
//            Ground shipment on the account for closeDate: the request takes no
//            tracking-number selector (the spec's `trackingNumber` is singular and
//            reprint-only), and the response is close reports (MANIFEST / OP_950),
//            not shipments — so shipmentIds and labelCount are never populated.
// Undeclared:  pickup    — implemented (createPickup + cancelPickup over the Pickup API,
//                          /pickup/v1/pickups) but not yet declared in metadata.ts; the
//                          metadata PR owns that. No list/get: FedEx has no endpoint that
//                          enumerates or reads a pickup — the confirmation code is the only
//                          handle, and cancelling needs carrierCode + scheduledDate (+ the
//                          Express `location`) alongside it.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
  PickupRequestParams,
  PickupCancelParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Pickup } from '../../schema/pickup'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { FedExClient } from './client'
import {
  ENDOFDAY_PATH,
  PICKUPS_PATH,
  PICKUP_CANCEL_PATH,
  RATES_PATH,
  SHIPMENTS_PATH,
  TRACKING_PATH,
} from './constants'

import { transformRate, type FedExRateResponse } from './transform/rate'
import { transformTrackResult, type FedExTrackResponse } from './transform/tracking'
import { transformShipment, type FedExShipmentResponse } from './transform/shipment'
import { transformLabel } from './transform/label'
import { getFedExCarrier } from './transform/carrier'
import {
  buildCreatePickupBody,
  buildCancelPickupBody,
  transformPickup,
  transformCancelledPickup,
  type FedExCreatePickupResponse,
  type FedExCancelPickupResponse,
} from './transform/pickup'
import { transformManifest, type FedExEndOfDayResponse } from './transform/manifest'

export interface FedExAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
  accountNumber?: string
}

export class FedExAdapter implements LogisticsAdapter {
  readonly platform = 'fedex'
  readonly version = '1'

  private config: FedExAdapterConfig

  constructor(config: FedExAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // FedEx uses client_credentials — the "code" is unused.
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('fedex: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      sandbox: this.config.sandbox,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new FedExClient(credentials)
    const firstPkg = params.packages[0]

    const body = {
      accountNumber: { value: this.config.accountNumber },
      requestedShipment: {
        shipper: {
          address: {
            postalCode: params.originAddress.postalCode,
            countryCode: params.originAddress.country,
            stateOrProvinceCode: params.originAddress.state,
            city: params.originAddress.city,
          },
        },
        recipient: {
          address: {
            postalCode: params.destinationAddress.postalCode,
            countryCode: params.destinationAddress.country,
            stateOrProvinceCode: params.destinationAddress.state,
            city: params.destinationAddress.city,
          },
        },
        requestedPackageLineItems: [
          {
            weight: firstPkg?.weight
              ? { value: firstPkg.weight.value, units: firstPkg.weight.unit === 'kg' ? 'KG' : 'LB' }
              : undefined,
            dimensions: firstPkg?.dimensions
              ? {
                  length: firstPkg.dimensions.length,
                  width: firstPkg.dimensions.width,
                  height: firstPkg.dimensions.height,
                  units: firstPkg.dimensions.unit === 'cm' ? 'CM' : 'IN',
                }
              : undefined,
          },
        ],
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      },
    }

    const res = await client.post<FedExRateResponse>(RATES_PATH, body)
    return (res.output?.rateReplyDetails ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new FedExClient(credentials)
    const body = {
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber,
          },
        },
      ],
    }

    const res = await client.post<FedExTrackResponse>(TRACKING_PATH, body)
    const results = res.output?.completeTrackResults ?? []
    return results.flatMap((ctr) => (ctr.trackResults ?? []).flatMap(transformTrackResult))
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FedExClient(credentials)

    const body = {
      accountNumber: { value: this.config.accountNumber },
      requestedShipment: {
        shipper: {
          address: {
            postalCode: data.originAddress?.postalCode,
            countryCode: data.originAddress?.country,
            stateOrProvinceCode: data.originAddress?.state,
            city: data.originAddress?.city,
            streetLines: [data.originAddress?.street1, data.originAddress?.street2].filter(Boolean),
          },
          contact: {
            personName: data.originAddress?.name,
            phoneNumber: data.originAddress?.phone,
            emailAddress: data.originAddress?.email,
            companyName: data.originAddress?.company,
          },
        },
        recipients: [
          {
            address: {
              postalCode: data.destinationAddress?.postalCode,
              countryCode: data.destinationAddress?.country,
              stateOrProvinceCode: data.destinationAddress?.state,
              city: data.destinationAddress?.city,
              streetLines: [data.destinationAddress?.street1, data.destinationAddress?.street2].filter(Boolean),
            },
            contact: {
              personName: data.destinationAddress?.name,
              phoneNumber: data.destinationAddress?.phone,
              emailAddress: data.destinationAddress?.email,
              companyName: data.destinationAddress?.company,
            },
          },
        ],
        serviceType: data.serviceCode ?? 'FEDEX_GROUND',
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        requestedPackageLineItems: [
          {
            weight: data.totalWeight
              ? { value: data.totalWeight.value, units: data.totalWeight.unit === 'kg' ? 'KG' : 'LB' }
              : undefined,
          },
        ],
        shippingChargesPayment: {
          paymentType: 'SENDER',
        },
        labelSpecification: {
          labelStockType: 'PAPER_4X6',
          imageType: 'PDF',
        },
      },
    }

    const res = await client.post<FedExShipmentResponse>(SHIPMENTS_PATH, body)
    const txnShipment = res.output?.transactionShipments?.[0]
    if (!txnShipment) {
      throw new Error('FedEx createShipment returned no transactionShipments')
    }
    return transformShipment(txnShipment)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new FedExClient(credentials)
    await client.delete(`${SHIPMENTS_PATH}/${id}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    // FedEx is itself the carrier — return a single static record.
    return [getFedExCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    if (id !== 'fedex') {
      throw new Error(`fedex: unknown carrier id "${id}"`)
    }
    return getFedExCarrier()
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    // FedEx creates labels as part of shipment creation.
    // Here we create a shipment to get the label.
    const client = new FedExClient(credentials)

    const body = {
      accountNumber: { value: this.config.accountNumber },
      requestedShipment: {
        shipper: {
          address: {
            postalCode: (data.metadata as Record<string, unknown> | undefined)?.originPostalCode,
            countryCode: (data.metadata as Record<string, unknown> | undefined)?.originCountry,
          },
        },
        recipients: [
          {
            address: {
              postalCode: (data.metadata as Record<string, unknown> | undefined)?.destinationPostalCode,
              countryCode: (data.metadata as Record<string, unknown> | undefined)?.destinationCountry,
            },
          },
        ],
        serviceType: data.serviceCode ?? 'FEDEX_GROUND',
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        requestedPackageLineItems: [{}],
        shippingChargesPayment: {
          paymentType: 'SENDER',
        },
        labelSpecification: {
          labelStockType: 'PAPER_4X6',
          imageType: data.format ?? 'PDF',
        },
      },
    }

    const res = await client.post<FedExShipmentResponse>(SHIPMENTS_PATH, body)
    const txnShipment = res.output?.transactionShipments?.[0]
    if (!txnShipment) {
      throw new Error('FedEx createLabel returned no transactionShipments')
    }
    return transformLabel(txnShipment)
  }

  // ── Pickups ────────────────────────────────────────────────────────────────

  async createPickup(credentials: Credentials, data: PickupRequestParams): Promise<Pickup> {
    const client = new FedExClient(credentials)
    // Throws naming carrierCode / timeZone / packageLocation … when absent —
    // FedEx needs them and PickupRequestParams only carries them on its
    // index signature.
    const body = buildCreatePickupBody(data, this.config.accountNumber)

    const res = await client.post<FedExCreatePickupResponse>(PICKUPS_PATH, body)
    const output = res.output
    if (!output?.pickupConfirmationCode) {
      throw new Error('FedEx createPickup returned no pickupConfirmationCode')
    }
    return transformPickup(output, data)
  }

  async cancelPickup(
    credentials: Credentials,
    id: string,
    data?: PickupCancelParams,
  ): Promise<Pickup> {
    const client = new FedExClient(credentials)
    const body = buildCancelPickupBody(id, data, this.config.accountNumber)

    // Cancel is a PUT to a fixed path; the confirmation code rides in the body.
    const res = await client.put<FedExCancelPickupResponse>(PICKUP_CANCEL_PATH, body)
    const output = res.output
    if (!output) {
      throw new Error('FedEx cancelPickup returned no output')
    }
    return transformCancelledPickup(output, id)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new FedExClient(credentials)
    // Ground End of Day Close closes every open Ground shipment on the account
    // for closeDate — there is no per-shipment selector, so data.shipmentIds is
    // not sent. Defaults to today, as the GLS-DE end-of-day does.
    const closeAt = data.submittedAt ?? data.createdAt
    const closeDate = (closeAt ? new Date(closeAt) : new Date()).toISOString().slice(0, 10)

    const body = {
      accountNumber: { value: this.config.accountNumber },
      closeReqType: 'GCDR',
      groundServiceCategory: 'GROUND',
      closeDate,
    }

    const res = await client.put<FedExEndOfDayResponse>(ENDOFDAY_PATH, body)
    const output = res.output
    if (!output?.closeDocuments?.length) {
      throw new Error('FedEx createManifest returned no closeDocuments')
    }
    return transformManifest(output, closeDate)
  }
}
