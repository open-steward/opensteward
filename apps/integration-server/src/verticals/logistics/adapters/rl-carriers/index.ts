// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — R+L Carriers has no manifest/SCAN-form concept; LTL BOLs serve as shipping documents
// Unavailable: order    — R+L Carriers is a pure LTL freight carrier with no order management; shipments are BOLs/Pickup Requests
// Unavailable: warehouse — R+L uses its own service center network; no customer warehouse endpoint exists
// Derived:     carrier   — R+L Carriers is itself the sole carrier; no /Carrier listing endpoint exists in the API

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import type { CredentialField } from '@opensteward/shared'
import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { RlCarriersClient } from './client'
import { TRACE_TYPE_PRO } from './constants'

import {
  transformRateQuote,
  type RlCarriersRateResponse,
} from './transform/rate'
import {
  transformTrackingEvents,
  type RlCarriersTracingResponse,
} from './transform/tracking'
import {
  transformPickupShipment,
  transformBolShipment,
  type RlCarriersPickupResponse,
  type RlCarriersBolResponse,
} from './transform/shipment'
import { transformCarrier } from './transform/carrier'
import {
  transformLabel,
  type RlCarriersLabelResponse,
} from './transform/label'

export interface RlCarriersAdapterConfig {
  /** API key from the MyRLC Account portal */
  apiKey?: string
  /** MyRLC account number for rated quotes and BOL creation */
  accountNumber?: string
}

export class RlCarriersAdapter implements LogisticsAdapter {
  readonly platform = 'rl-carriers'
  readonly version = '1'

  private config: RlCarriersAdapterConfig

  constructor(config: RlCarriersAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  /**
   * For API key adapters the "code" is the raw API key itself.
   * The Connect Link hosted form calls exchangeCredentials(); this method
   * is provided for interface compliance.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return Promise.resolve(doRefresh(credentials))
  }

  // ── Direct credential entry (Connect Link) ─────────────────────────────────

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password' as const,
        placeholder: 'Your R+L Carriers API key',
        helpText:
          'Log in to your MyRLC Account at rlcarriers.com and navigate to the API section to retrieve your key.',
        required: true,
      },
      {
        name: 'accountNumber',
        label: 'Account Number',
        type: 'text' as const,
        placeholder: 'Your R+L Carriers account number',
        helpText: 'Your R+L Carriers shipper account number (required for rated quotes and BOL creation).',
        required: false,
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = fields['apiKey']
    if (!apiKey) throw new Error('rl-carriers: apiKey is required')
    return exchangeApiKey(apiKey)
  }

  // ── Rates (LTL Rate Quotes) ───────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new RlCarriersClient(credentials)
    const firstPkg = params.packages[0]

    const body = {
      RateQuote: {
        AccountNumber: this.config.accountNumber ?? undefined,
        Origin: {
          City: params.originAddress.city ?? undefined,
          StateOrProvince: params.originAddress.state ?? undefined,
          ZipOrPostalCode: params.originAddress.postalCode ?? undefined,
          CountryCode: params.originAddress.country ?? 'USA',
        },
        Destination: {
          City: params.destinationAddress.city ?? undefined,
          StateOrProvince: params.destinationAddress.state ?? undefined,
          ZipOrPostalCode: params.destinationAddress.postalCode ?? undefined,
          CountryCode: params.destinationAddress.country ?? 'USA',
        },
        Items: [
          {
            Weight: firstPkg?.weight?.value ?? 0,
            Class: '70',
            Width: firstPkg?.dimensions?.width ?? 0,
            Height: firstPkg?.dimensions?.height ?? 0,
            Length: firstPkg?.dimensions?.length ?? 0,
          },
        ],
      },
    }

    const res = await client.post<RlCarriersRateResponse>('/RateQuote', body)
    const rateQuote = res.RateQuote
    if (!rateQuote) return []
    return transformRateQuote(rateQuote)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new RlCarriersClient(credentials)
    const res = await client.get<RlCarriersTracingResponse>('/ShipmentTracing', {
      'request.traceNumbers': trackingNumber,
      'request.traceType': TRACE_TYPE_PRO,
    })
    return transformTrackingEvents(res, trackingNumber)
  }

  // ── Pickup Request (creates a shipment record) ────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new RlCarriersClient(credentials)

    const body = {
      PickupRequest: {
        AccountNumber: this.config.accountNumber ?? undefined,
        PickupAddress: {
          CompanyName: data.originAddress?.company ?? data.originAddress?.name ?? undefined,
          Address1: data.originAddress?.street1 ?? undefined,
          Address2: data.originAddress?.street2 ?? undefined,
          City: data.originAddress?.city ?? undefined,
          State: data.originAddress?.state ?? undefined,
          Zip: data.originAddress?.postalCode ?? undefined,
          Country: data.originAddress?.country ?? 'USA',
          Phone: data.originAddress?.phone ?? undefined,
        },
        ConsigneeAddress: {
          CompanyName: data.destinationAddress?.company ?? data.destinationAddress?.name ?? undefined,
          City: data.destinationAddress?.city ?? undefined,
          State: data.destinationAddress?.state ?? undefined,
          Zip: data.destinationAddress?.postalCode ?? undefined,
          Country: data.destinationAddress?.country ?? 'USA',
        },
        Weight: data.totalWeight?.value ?? undefined,
        Reference: data.reference ?? undefined,
        SpecialInstructions: data.notes ?? undefined,
      },
    }

    const res = await client.post<{ PickupRequest?: RlCarriersPickupResponse }>(
      '/PickupRequest',
      body,
    )
    return transformPickupShipment(res.PickupRequest ?? (res as RlCarriersPickupResponse))
  }

  // ── Bill of Lading (get existing BOL as shipment) ─────────────────────────

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new RlCarriersClient(credentials)
    const res = await client.get<{ BillOfLading?: RlCarriersBolResponse }>('/BillOfLading', {
      BolNumber: id,
    })
    return transformBolShipment(res.BillOfLading ?? (res as RlCarriersBolResponse))
  }

  // ── Cancel Pickup ─────────────────────────────────────────────────────────

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new RlCarriersClient(credentials)
    await client.delete(`/PickupRequest?ConfirmationNumber=${encodeURIComponent(id)}`)
  }

  // ── Carriers (static — R+L is the sole carrier) ───────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels (GET /BillOfLading/PrintShippingLabels) ────────────────────────

  /**
   * Retrieve a shipping label PDF (base64-encoded) for a given PRO number.
   * The `id` parameter is the PRO number / BOL number.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new RlCarriersClient(credentials)
    const res = await client.get<RlCarriersLabelResponse>(
      '/BillOfLading/PrintShippingLabels',
      {
        ProNumber: id,
        Style: 1,
        NumberOfLabels: 1,
      },
    )
    return transformLabel(res, id)
  }
}
