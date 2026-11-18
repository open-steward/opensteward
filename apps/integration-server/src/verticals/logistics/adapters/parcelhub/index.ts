import { customForm } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangePassword, refreshCredentials as doRefresh } from './auth'
import { ParcelHubClient, postTrackingXml } from './client'
import { escapeXml } from './xml'

import { assertServiceResult, transformTrackingHistory } from './transform/tracking'
import { transformShipment, type ParcelHubShipment } from './transform/shipment'
import { transformRate, type ParcelHubRate } from './transform/rate'
import { transformLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────
// First-party docs: https://api.parcelhub.net/docs/ (Shipping API and Tracking API).
// Unavailable: manifest — no manifest endpoint in the Parcelhub Shipping API
// Unavailable: order    — Parcelhub is a carrier/label platform with no order management API
// Unavailable: warehouse — no warehouse endpoint in the Parcelhub API
// Unverified:  carrier  — GET /1.0/ServiceProviders exists but is not wired up

interface ParcelHubAdapterConfig {
  sandbox?: boolean
}

// ── Connect Link credential form ─────────────────────────────────────────────
// Shipping API: "call the TokenV2 endpoint with your username and password"
// (https://api.parcelhub.net/docs/shippingAPI/get-bearer-token/).
// Tracking API: "a Parcelhub Account ID and an Access Code is required to access
// the API. This is a seperate credential to the one used in the shipping API"
// (https://api.parcelhub.net/docs/trackingAPI/tracking-api/).
const CREDENTIAL_FORM = customForm({
  fields: [
    { name: 'username', label: 'Shipping API username', type: 'text', required: true },
    { name: 'password', label: 'Shipping API password', type: 'password', required: true },
    {
      name: 'trackingAccountId',
      label: 'Tracking API account ID',
      type: 'text',
      required: false,
      helpText:
        'Needed for tracking events only. A separate credential from the Shipping API login, issued by your Parcelhub account manager.',
    },
    {
      name: 'trackingAccessCode',
      label: 'Tracking API access code',
      type: 'password',
      required: false,
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const username = (fields['username'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!username) throw new Error('Shipping API username is required.')
    if (!password) throw new Error('Shipping API password is required.')
    const trackingAccountId = (fields['trackingAccountId'] ?? '').trim()
    const trackingAccessCode = (fields['trackingAccessCode'] ?? '').trim()
    return exchangePassword({ username, password, trackingAccountId, trackingAccessCode })
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class ParcelHubAdapter implements LogisticsAdapter {
  // Connect Link support — Shipping API login plus optional Tracking API credentials.

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'parcelhub'
  readonly version = '1'

  constructor(_config: ParcelHubAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected as "username:password" (the Shipping API login)
    const i = code.indexOf(':')
    if (i <= 0 || i === code.length - 1) {
      throw new Error('Parcelhub exchangeCode expects code in the format "username:password"')
    }
    return exchangePassword({ username: code.slice(0, i), password: code.slice(i + 1) })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  // POST /v1/trackingservice/gettrackinghistory on the Tracking API
  // (https://api.parcelhub.net/docs/trackingAPI/get-tracking-history/). Request:
  // Authentication/AccountID, Authentication/AccessCode, TransactionMessageID,
  // SearchType ('Set to "ByTrackingNumber" or "ByShipmentKey"'), SearchTerm.
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const accountId = extra.trackingAccountId
    const accessCode = extra.trackingAccessCode
    if (
      typeof accountId !== 'string' ||
      !accountId ||
      typeof accessCode !== 'string' ||
      !accessCode
    ) {
      throw notSupported(
        'Parcelhub tracking needs the Tracking API account ID and access code ("This is a seperate credential to the one used in the shipping API"). Reconnect with both to read tracking events.',
      )
    }
    const body =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<GetTrackingHistoryRequest>' +
      '<Authentication>' +
      `<AccountID>${escapeXml(accountId)}</AccountID>` +
      `<AccessCode>${escapeXml(accessCode)}</AccessCode>` +
      '</Authentication>' +
      '<TransactionMessageID></TransactionMessageID>' +
      '<SearchType>ByTrackingNumber</SearchType>' +
      `<SearchTerm>${escapeXml(trackingNumber)}</SearchTerm>` +
      '</GetTrackingHistoryRequest>'
    const response = await postTrackingXml('gettrackinghistory', body)
    assertServiceResult(response)
    return transformTrackingHistory(response)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ParcelHubClient(credentials)
    const raw = await client.post<ParcelHubShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ParcelHubClient(credentials)
    const raw = await client.post<{ quotes: ParcelHubRate[] }>('quotes', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.quotes ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    // https://api.parcelhub.net/docs/shippingAPI/list-shipments/ : GET /Shipment
    // takes only `AccountId` and returns a <ShipmentSummaryList> whose
    // ShipmentSummary fields are account, parcelhubShipmentId, serviceInfo,
    // deliveryCompanyName, deliveryContactName, deliveryPostcode, deliveryCountry,
    // collectionDate, packageCount, courierTrackingNumber, reference1, reference2,
    // contentsDescription, specialInstructions, serviceProviderName, serviceName,
    // serviceDesc and shipmentTags. No label field: labels exist only on
    // GET /1.0/Shipment/{id}.
    throw notSupported(
      'Parcelhub cannot list labels: its only shipment collection, GET /Shipment (List Shipments), returns ShipmentSummary rows with no label fields; labels are only on GET /1.0/Shipment/{id}.',
    )
  }

  // GET /1.0/Shipment/{id} (https://api.parcelhub.net/docs/shippingAPI/get-shipment/):
  // "Get details on a shipment by providing the Shipment ID in the URL".
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ParcelHubClient(credentials)
    const shipment = await client.getXml(`Shipment/${encodeURIComponent(id)}`)
    return transformLabel(shipment)
  }
}
