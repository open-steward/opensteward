// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Aramex is itself a single carrier; no API endpoint lists carriers
// Unavailable: manifest  — No CreateManifest or closeout endpoint exists in Aramex's public API
// Unavailable: order     — Aramex has no order management API (shipping/tracking/rates only)
// Unavailable: warehouse — Aramex has no warehouse management API despite offering the physical service

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AramexClient } from './client'

import { transformShipment, type AramexCreateShipmentResponse } from './transform/shipment'
import { transformTracking, type AramexTrackingResponse } from './transform/tracking'
import { transformRate, type AramexRateResponse } from './transform/rate'
import { transformLabel, type AramexPrintLabelResponse } from './transform/label'

interface AramexAdapterConfig {
  sandbox?: boolean
}

export class AramexAdapter implements LogisticsAdapter {
  readonly platform = 'aramex'
  readonly version = '1'

  constructor(_config: AramexAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Aramex the "code" is the "accountNumber:accountPin" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new AramexClient(credentials)
    const raw = await client.post<AramexTrackingResponse>('Tracking/ShipmentTrack', {
      Shipments: [trackingNumber],
      GetLastTrackingUpdateOnly: false,
      ClientInfo: this.buildClientInfo(credentials),
    })
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new AramexClient(credentials)
    const raw = await client.post<AramexCreateShipmentResponse>('Shipping/CreateShipments', {
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
      throw new Error('Aramex returned no shipments in response')
    }
    return transformShipment(shipment)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new AramexClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<AramexRateResponse>('RateCalculator/CalculateRate', {
      ClientInfo: this.buildClientInfo(credentials),
      OriginAddress: {
        City: params.originAddress.city,
        StateOrProvinceCode: params.originAddress.state,
        PostCode: params.originAddress.postalCode,
        CountryCode: params.originAddress.country,
      },
      DestinationAddress: {
        City: params.destinationAddress.city,
        StateOrProvinceCode: params.destinationAddress.state,
        PostCode: params.destinationAddress.postalCode,
        CountryCode: params.destinationAddress.country,
      },
      ShipmentDetails: {
        ActualWeight: pkg?.weight
          ? { Value: pkg.weight.value, Unit: pkg.weight.unit.toUpperCase() }
          : undefined,
        NumberOfPieces: params.packages.length,
      },
    })
    return [transformRate(raw)]
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new AramexClient(credentials)
    const raw = await client.post<AramexPrintLabelResponse>('Shipping/Service_1_0.svc/json/PrintLabel', {
      ClientInfo: this.buildClientInfo(credentials),
      ShipmentNumber: data.shipmentId ?? data.trackingNumber ?? data.id,
      LabelInfo: {
        ReportID: 9729,
        ReportType: 'URL',
      },
    })
    return transformLabel(raw, new Date())
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
