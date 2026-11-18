// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Aramex is the carrier itself; no list-carriers endpoint exists
// Unavailable: order    — Aramex is a carrier API with no order-management concept
// Unverified:  manifest — Shipment Preparation API documented but docs returned 403; Shipping WSDL has no manifest op
// Unverified:  warehouse — Location API has FetchOffices but response schema could not be verified (docs 403)

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AramexMeClient } from './client'

import { transformTracking, type AramexMeTrackingResponse } from './transform/tracking'
import { transformShipment, type AramexMeCreateShipmentResponse } from './transform/shipment'
import { transformTrackingEvent, type AramexMeTrackingResult } from './transform/trackingevent'
import { transformRate, type AramexMeRateCalculatorResponse } from './transform/rate'
import { transformLabel, type AramexMePrintLabelResponse } from './transform/label'

interface AramexMeAdapterConfig {
  sandbox?: boolean
}

export class AramexMeAdapter implements LogisticsAdapter {
  readonly platform = 'aramex-me'
  readonly version = '1'

  constructor(_config: AramexMeAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Aramex ME the "code" is the "accountNumber:accountPin" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new AramexMeClient(credentials)
    const raw = await client.post<AramexMeTrackingResponse>('Tracking/ShipmentTrack', {
      Shipments: [trackingNumber],
      GetLastTrackingUpdateOnly: false,
      ClientInfo: this.buildClientInfo(credentials),
    })
    return transformTracking(raw, trackingNumber)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new AramexMeClient(credentials)
    const raw = await client.post<AramexMeTrackingResponse>('Tracking/ShipmentTrack', {
      Shipments: [trackingNumber],
      GetLastTrackingUpdateOnly: false,
      ClientInfo: this.buildClientInfo(credentials),
    })
    const results: AramexMeTrackingResult[] = raw.TrackingResults ?? []
    return results.map((evt) => transformTrackingEvent(evt, trackingNumber))
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new AramexMeClient(credentials)
    const raw = await client.post<AramexMeCreateShipmentResponse>('Shipping/CreateShipments', {
      ClientInfo: this.buildClientInfo(credentials),
      Shipments: [
        {
          Reference1: data.reference,
          Shipper: data.originAddress
            ? {
                PartyAddress: {
                  Line1: data.originAddress.street1,
                  Line2: data.originAddress.street2,
                  City: data.originAddress.city,
                  StateOrProvinceCode: data.originAddress.state,
                  PostCode: data.originAddress.postalCode,
                  CountryCode: data.originAddress.country,
                },
                Contact: {
                  PersonName: data.originAddress.name,
                  CompanyName: data.originAddress.company,
                  PhoneNumber1: data.originAddress.phone,
                  EmailAddress: data.originAddress.email,
                },
              }
            : undefined,
          Consignee: data.destinationAddress
            ? {
                PartyAddress: {
                  Line1: data.destinationAddress.street1,
                  Line2: data.destinationAddress.street2,
                  City: data.destinationAddress.city,
                  StateOrProvinceCode: data.destinationAddress.state,
                  PostCode: data.destinationAddress.postalCode,
                  CountryCode: data.destinationAddress.country,
                },
                Contact: {
                  PersonName: data.destinationAddress.name,
                  CompanyName: data.destinationAddress.company,
                  PhoneNumber1: data.destinationAddress.phone,
                  EmailAddress: data.destinationAddress.email,
                },
              }
            : undefined,
          ShipmentDetails: {
            ActualWeight: data.totalWeight
              ? { Value: data.totalWeight.value, Unit: data.totalWeight.unit.toUpperCase() }
              : undefined,
            Dimensions: data.dimensions
              ? {
                  Length: data.dimensions.length,
                  Width: data.dimensions.width,
                  Height: data.dimensions.height,
                  Unit: data.dimensions.unit.toUpperCase(),
                }
              : undefined,
            DescriptionOfGoods: data.notes ?? data.reference ?? 'Shipment',
            NumberOfPieces: data.packages?.length ?? 1,
          },
        },
      ],
    })
    const shipment = raw.Shipments?.[0]
    if (!shipment) {
      throw new Error('Aramex ME returned no shipments in response')
    }
    return transformShipment(shipment)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new AramexMeClient(credentials)
    const origin = params.originAddress
    const destination = params.destinationAddress
    const pkg = params.packages?.[0]
    const raw = await client.post<AramexMeRateCalculatorResponse>('RateCalculator/CalculateRate', {
      ClientInfo: this.buildClientInfo(credentials),
      OriginAddress: {
        Line1: origin.street1,
        City: origin.city,
        StateOrProvinceCode: origin.state,
        PostCode: origin.postalCode,
        CountryCode: origin.country,
      },
      DestinationAddress: {
        Line1: destination.street1,
        City: destination.city,
        StateOrProvinceCode: destination.state,
        PostCode: destination.postalCode,
        CountryCode: destination.country,
      },
      ShipmentDetails: {
        ActualWeight: pkg?.weight
          ? { Value: pkg.weight.value, Unit: pkg.weight.unit.toUpperCase() }
          : undefined,
        NumberOfPieces: params.packages?.length ?? 1,
        ProductGroup: 'EXP',
        ProductType: 'PPX',
        PaymentType: 'P',
      },
    })
    return [transformRate(raw)]
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new AramexMeClient(credentials)
    const raw = await client.post<AramexMePrintLabelResponse>('Shipping/PrintLabel', {
      ClientInfo: this.buildClientInfo(credentials),
      ShipmentNumber: data.trackingNumber ?? data.shipmentId ?? data.id,
      LabelInfo: { ReportID: 9729, ReportType: 'URL' },
    })
    return transformLabel(raw, data.shipmentId, data.trackingNumber)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new AramexMeClient(credentials)
    const raw = await client.post<AramexMePrintLabelResponse>('Shipping/PrintLabel', {
      ClientInfo: this.buildClientInfo(credentials),
      ShipmentNumber: id,
      LabelInfo: { ReportID: 9729, ReportType: 'URL' },
    })
    return transformLabel(raw, undefined, id)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildClientInfo(credentials: Credentials): Record<string, unknown> {
    const extra = credentials.extra ?? {}
    return {
      AccountEntity: extra.accountEntity ?? '',
      AccountNumber: extra.accountNumber ?? '',
      AccountPin: extra.accountPin ?? '',
      AccountCountryCode: extra.countryCode ?? '',
      UserName: extra.userName ?? '',
      Password: extra.password ?? '',
      Version: 'v2',
    }
  }
}
