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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DHLClient } from './client'

import { transformRate, type DHLRateResponse } from './transform/rate'
import { transformTracking, type DHLTrackingResponse } from './transform/tracking'
import { transformShipment, type DHLShipmentResponse } from './transform/shipment'
import { transformLabels } from './transform/label'
import { getDHLCarrier } from './transform/carrier'
import {
  transformPickup,
  cancelledPickup,
  toDHLPartyDetails,
  toDHLPickupDateTime,
  toDHLCloseTime,
  toDHLShipmentDetails,
  type DHLPickupResponse,
} from './transform/pickup'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   pickup    — POST /pickups (book → dispatchConfirmationNumbers[0]) and
//              DELETE /pickups/{dispatchConfirmationNumber}?requestorName&reason (cancel).
//              No list/get: MyDHL API has no read endpoint for a booking. Not yet declared
//              in metadata.ts — the metadata PR owns that.
// Unavailable: manifest  — DHL Express does not require or support manifest submission (confirmed by ShipEngine/DHL docs)
// Unavailable: order     — DHL Express has no order management endpoint; it is a carrier-only API
// Unavailable: warehouse — DHL Express has no warehouse management endpoint; confirmed not supported

interface DHLAdapterConfig {
  testMode?: boolean
}

export class DHLAdapter implements LogisticsAdapter {
  readonly platform = 'dhl'
  readonly version = '1'

  private testMode: boolean

  constructor(config: DHLAdapterConfig = {}) {
    this.testMode = config.testMode ?? false
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For DHL the "code" is the apiKey:apiSecret pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = this.createClient(credentials)
    const pkg = params.packages[0]
    const res = await client.get<DHLRateResponse>('rates', {
      originCountryCode: params.originAddress.country,
      originCityName: params.originAddress.city,
      destinationCountryCode: params.destinationAddress.country,
      destinationCityName: params.destinationAddress.city,
      weight: pkg?.weight?.value ?? 1,
      length: pkg?.dimensions?.length,
      width: pkg?.dimensions?.width,
      height: pkg?.dimensions?.height,
      isCustomsDeclarable: false,
      plannedShippingDate: new Date().toISOString().slice(0, 10),
      unitOfMeasurement: 'metric',
    })
    return (res.products ?? []).map(transformRate)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = this.createClient(credentials)
    const raw = await client.post<DHLShipmentResponse>('shipments', {
      plannedShippingDateAndTime: new Date().toISOString(),
      pickup: { isRequested: false },
      productCode: data.serviceCode ?? 'P',
      accounts: [
        {
          typeCode: 'shipper',
          number: (data.metadata as Record<string, unknown> | undefined)?.accountNumber ?? '',
        },
      ],
      customerDetails: {
        shipperDetails: data.originAddress ? toDHLPartyDetails(data.originAddress) : undefined,
        receiverDetails: data.destinationAddress
          ? toDHLPartyDetails(data.destinationAddress)
          : undefined,
      },
      content: {
        packages: (data.packages ?? []).map((pkg) => ({
          weight: pkg.weight?.value ?? data.totalWeight?.value ?? 1,
          dimensions: pkg.dimensions
            ? {
                length: pkg.dimensions.length,
                width: pkg.dimensions.width,
                height: pkg.dimensions.height,
              }
            : undefined,
          customerReferences: pkg.reference ? [{ value: pkg.reference }] : undefined,
        })),
        isCustomsDeclarable: false,
        description: data.reference ?? 'Shipment',
        unitOfMeasurement: 'metric',
      },
      outputImageProperties: {
        imageOptions: [
          { typeCode: 'label', templateName: 'ECOM26_84_001' },
        ],
      },
    })
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = this.createClient(credentials)
    const raw = await client.get<DHLTrackingResponse>(
      `shipments/${trackingNumber}/tracking`,
    )
    const shipments = raw.shipments ?? []
    return shipments.flatMap((s) => transformTracking(s, trackingNumber))
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a DHL label')
    // DHL creates labels as part of the shipment creation. If the shipment
    // already exists, re-fetch its documents.
    const client = this.createClient(credentials)
    const raw = await client.get<DHLShipmentResponse>(
      `shipments/${data.shipmentId}/tracking`,
    )
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No label found for shipment ${data.shipmentId}`)
    }
    return labels[0]
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // DHL Express is itself a single carrier — no listing endpoint exists.
  // The carrier record is derived from the adapter's known identity.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [getDHLCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    const carrier = getDHLCarrier()
    if (id !== 'dhl') throw new Error(`Carrier '${id}' not found — DHL adapter only exposes carrier 'dhl'`)
    return carrier
  }

  // ── Pickups ────────────────────────────────────────────────────────────────
  // MyDHL API books and cancels a pickup but cannot read one back — there is
  // no GET on /pickups or /pickups/{n} — so listPickups / getPickup are absent.

  async createPickup(credentials: Credentials, params: PickupRequestParams): Promise<Pickup> {
    // The shipper account has no named slot on PickupRequestParams; DHL will
    // not book without one, so it is required up front rather than sent empty.
    const accountNumber = params.accountNumber
    if (typeof accountNumber !== 'string' || !accountNumber) {
      throw new Error('dhl: accountNumber (the shipper account) is required to book a pickup')
    }
    const shipmentDetails = toDHLShipmentDetails(params, accountNumber)
    const client = this.createClient(credentials)
    const raw = await client.post<DHLPickupResponse>('pickups', {
      plannedPickupDateAndTime: toDHLPickupDateTime(params.readyAt),
      closeTime: params.closeAt ? toDHLCloseTime(params.closeAt) : undefined,
      location: typeof params.location === 'string' ? params.location : undefined,
      locationType: typeof params.locationType === 'string' ? params.locationType : undefined,
      accounts: [{ typeCode: 'shipper', number: accountNumber }],
      specialInstructions: params.instructions ? [{ value: params.instructions }] : undefined,
      customerDetails: { shipperDetails: toDHLPartyDetails(params.address) },
      shipmentDetails,
    })
    return transformPickup(raw)
  }

  async cancelPickup(credentials: Credentials, id: string, data?: PickupCancelParams): Promise<Pickup> {
    // Both are mandatory query parameters on DHL's DELETE. Only `reason` has a
    // named slot on PickupCancelParams; `requestorName` rides the index signature.
    const requestorName = data?.requestorName
    const reason = data?.reason
    const missing: string[] = []
    if (typeof requestorName !== 'string' || !requestorName) missing.push('requestorName')
    if (typeof reason !== 'string' || !reason) missing.push('reason')
    if (missing.length > 0) {
      throw new Error(`dhl: cancelling a pickup requires ${missing.join(' and ')} on the request body`)
    }
    const client = this.createClient(credentials)
    await client.delete(`pickups/${id}`, { requestorName, reason })
    return cancelledPickup(id)
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private createClient(credentials: Credentials): DHLClient {
    const creds = this.testMode
      ? { ...credentials, extra: { ...credentials.extra, testMode: true } }
      : credentials
    return new DHLClient(creds)
  }
}
