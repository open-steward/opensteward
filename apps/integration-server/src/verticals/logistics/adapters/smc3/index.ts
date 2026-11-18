import { customForm, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { Smc3CcxlClient, Smc3RwxlClient } from './client'

import {
  transformCarrierServices,
  transformSingleCarrier,
  type Smc3CarrierServicesResponse,
} from './transform/carrier'
import { transformRateResponse, type Smc3RateResponse } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   carrier, rate
// Refused:     shipment, trackingevent — CCXL documents no shipment or tracking endpoint (see below)
// Unavailable: label    — SMC3 exposes no label generation or retrieval endpoints (CCXL/RWXL are rating/transit only)
// Unavailable: manifest — no manifest management endpoints in CCXL or RWXL
// Unavailable: order    — SMC3 is not an order management system; no order endpoints exist
// Unavailable: warehouse — SMC3 models carrier service terminals, not shipper warehouses

const NO_SHIPMENT_API =
  'CarrierConnect XL documents no shipment or tracking endpoint. POST /transit is a per-lane ' +
  'transit-time lookup (TransitRequest: carriers, destination, origin, pickupDate, shipmentId), ' +
  'not a shipment record or event history.'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Your SMC3 account username (email address).',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
    {
      name: 'licenseKey',
      label: 'License Key',
      type: 'password',
      required: true,
      helpText: 'The SMC3 license key issued with your API subscription.',
    },
  ],
  async exchange(fields) {
    return exchangeCredentials(
      (fields['username'] ?? '').trim(),
      fields['password'] ?? '',
      (fields['licenseKey'] ?? '').trim(),
    )
  },
})

// ── Adapter ───────────────────────────────────────────────────────────────────

interface Smc3AdapterConfig {
  sandbox?: boolean
}

export class Smc3Adapter implements LogisticsAdapter {
  // Connect Link credential form (username + password + licenseKey).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'smc3'
  readonly version = '1'

  constructor(_config: Smc3AdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected to be "username|password|licenseKey"
    const parts = code.split('|')
    return exchangeCredentials(parts[0] ?? '', parts[1] ?? '', parts[2] ?? '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    // CCXL 3.2 swagger: CarrierServicesRequest has only `shipmentDate` and
    // `service`, and CarrierServicesResponse is a bare `carrierServices` array
    // with no page, offset or cursor. One request returns every carrier, so
    // the caller's page is sliced locally.
    const client = new Smc3CcxlClient(credentials)
    const res = await client.post<Smc3CarrierServicesResponse>('carrierservices', {
      shipmentDate: new Date().toISOString().slice(0, 10),
    })
    return pageLocally(transformCarrierServices(res), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    // id is a SCAC code
    const client = new Smc3CcxlClient(credentials)
    const res = await client.post<Smc3CarrierServicesResponse>('carrierservices', {
      shipmentDate: new Date().toISOString().slice(0, 10),
      scacList: [id],
    })
    const rows = (res.carrierServices ?? []).filter(
      (r) => (r.scac ?? '').toUpperCase() === id.toUpperCase(),
    )
    return transformSingleCarrier(id, rows)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new Smc3RwxlClient(credentials)
    const firstPkg = params.packages[0]
    const res = await client.post<Smc3RateResponse>('ratequote', {
      originZip: params.originAddress.postalCode ?? '',
      destinationZip: params.destinationAddress.postalCode ?? '',
      originCity: params.originAddress.city ?? undefined,
      originState: params.originAddress.state ?? undefined,
      destinationCity: params.destinationAddress.city ?? undefined,
      destinationState: params.destinationAddress.state ?? undefined,
      weight: firstPkg?.weight?.value ?? 0,
      weightUnit: firstPkg?.weight?.unit ?? 'lb',
      shipmentDate: new Date().toISOString().slice(0, 10),
      serviceCodes: params.serviceCodes ?? undefined,
    })
    return transformRateResponse(res)
  }

  // ── Tracking Events and Shipments ──────────────────────────────────────────
  //
  // CarrierConnect XL 3.2 is an LTL transit-time and carrier-service directory:
  // https://ccxl.smc3.com/CarrierConnectXL/services/rest/v3_2/swagger.yaml
  // Its operations are isready, transitPlanning, transit, terminalsbypostalcode,
  // terminalbyterminalcode, carrierservices and terminalsbycarrier. None returns
  // a shipment or a tracking event. POST /transit ("Get Transit") takes a lane
  // (TransitRequest: carriers, destination, origin, pickupDate, shipmentId) and
  // returns per-carrier TransitResult estimates, echoing shipmentId back in
  // TransitResponse; no operation reads a shipment by that id. The previous
  // methods sent /transit with no origin or destination and mapped carrier
  // transit estimates to shipments and tracking events. They now refuse before
  // any request.

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported('SMC3 cannot read tracking events: ' + NO_SHIPMENT_API)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported('SMC3 cannot list tracking events: ' + NO_SHIPMENT_API)
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported('SMC3 cannot read shipments: ' + NO_SHIPMENT_API)
  }

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported('SMC3 cannot list shipments: ' + NO_SHIPMENT_API)
  }
}
