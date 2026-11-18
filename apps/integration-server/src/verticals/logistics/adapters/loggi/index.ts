import { simpleApiKey } from '@opensteward/shared'
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
import { LoggiClient } from './client'

import { transformShipment, type LoggiPackage } from './transform/shipment'
import { transformPackage, type LoggiPackageDetailsResponse } from './transform/package'
import { transformTracking, type LoggiTrackingResponse } from './transform/tracking'
import { transformRate, type LoggiQuoteResponse } from './transform/rate'
import { transformLabel, type LoggiLabelResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Loggi is a single-carrier platform; no carrier management endpoint exists in the API
// Unavailable: manifest  — Loggi API has no manifest endpoint; manifests are not part of its documented surface
// Unavailable: order     — Loggi API has no order management endpoint; scope is limited to shipments and tracking
// Unavailable: warehouse — Loggi API has no warehouse endpoint; the platform does not expose warehouse or depot management

interface LoggiAdapterConfig {
  companyId?: string
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// The package routes Loggi documents (https://docs.api.loggi.com/llms.txt, one
// OpenAPI definition per reference page) are, for /v1/companies/{company_id}/packages:
//   PATCH  /packages                        (PackageUpdate, by loggi_key or tracking_code)
//   POST   /packages/cancel                 (PackageCancel)
//   GET    /packages/{tracking_code}        (PackageDetailsTrackingCode)
//   GET    /packages/{tracking_code}/tracking (TrackPackageTrackingCode)
// and labels only as POST /labels, which generates labels for named loggiKeys.
// No route lists packages or labels, and none takes a page, offset or cursor.
const NO_PACKAGE_LIST =
  'Loggi documents no package list: /v1/companies/{company_id}/packages is PATCH-only ' +
  '("Atualizar dados de um pacote"), and its only GETs take a {tracking_code}'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class LoggiAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'loggi'
  readonly version = '1'

  private companyId: string
  private readonly configuredCompanyId?: string

  constructor(config: LoggiAdapterConfig = {}) {
    // companyId is the {company_id} path parameter of every Loggi route.
    // Write methods still fall back to 'default' (out of this rebuild's scope);
    // the read methods refuse without it.
    this.configuredCompanyId = config.companyId || undefined
    this.companyId = config.companyId ?? 'default'
  }

  /** {company_id} for read routes; refuses before any request when unset. */
  private readCompanyId(): string {
    if (!this.configuredCompanyId) {
      throw notSupported(
        'Loggi reads need the company id: every documented route is /v1/companies/{company_id}/..., ' +
          'and this adapter has no companyId configured',
      )
    }
    return this.configuredCompanyId
  }

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

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(`Loggi cannot list shipments: ${NO_PACKAGE_LIST}`)
  }

  /**
   * GET /v1/companies/{company_id}/packages/{tracking_code}: "Recupera
   * detalhes de um pacote a partir das informações de CompanyID e
   * TrackingCode." The id is the tracking code, which is also the id
   * transformPackage returns. The body is `{ packages: [...] }`.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const companyId = this.readCompanyId()
    const client = new LoggiClient(credentials)
    const res = await client.get<LoggiPackageDetailsResponse>(
      `v1/companies/${encodeURIComponent(companyId)}/packages/${encodeURIComponent(id)}`,
    )
    const pkg = (res.packages ?? []).find((p) => p.trackingCode === id)
    if (!pkg) {
      throw Object.assign(new Error(`Loggi package ${id} not found`), { statusCode: 404 })
    }
    return transformPackage(pkg)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LoggiClient(credentials)
    // Loggi async-shipments body uses shipFrom/shipTo with correiosAddress or
    // addressLines, plus a packages array for dimensions.
    const toLoggiAddress = (addr: typeof data.originAddress) =>
      addr
        ? {
            name: addr.name ?? undefined,
            phoneNumber: addr.phone ?? undefined,
            email: addr.email ?? undefined,
            correiosAddress: {
              logradouro: addr.street1 ?? undefined,
              complemento: addr.street2 ?? undefined,
              cidade: addr.city ?? undefined,
              uf: addr.state ?? undefined,
              cep: addr.postalCode ?? undefined,
            },
          }
        : undefined

    const weightGrams = data.totalWeight
      ? data.totalWeight.unit === 'g'
        ? data.totalWeight.value
        : data.totalWeight.value * (data.totalWeight.unit === 'kg' ? 1000 : 28.35)
      : undefined

    const body: Record<string, unknown> = {
      externalServiceId: data.serviceCode ?? undefined,
      shipFrom: toLoggiAddress(data.originAddress),
      shipTo: toLoggiAddress(data.destinationAddress),
      packages: weightGrams != null
        ? [{ weightG: weightGrams }]
        : undefined,
    }
    const raw = await client.post<LoggiPackage>(
      `v1/companies/${this.companyId}/async-shipments`,
      body,
    )
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new LoggiClient(credentials)
    // The cancel endpoint is POST /packages/cancel with loggi_key as a query
    // param (not a path segment).  tracking_code may also be supplied; if both
    // are provided Loggi prefers loggi_key.
    await client.post<unknown>(
      `v1/companies/${this.companyId}/packages/cancel?loggi_key=${encodeURIComponent(id)}`,
      {},
    )
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const companyId = this.readCompanyId()
    const client = new LoggiClient(credentials)
    const raw = await client.get<LoggiTrackingResponse>(
      `v1/companies/${encodeURIComponent(companyId)}/packages/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new LoggiClient(credentials)
    const pkg = params.packages[0]
    const body: Record<string, unknown> = {
      originPostalCode: params.originAddress.postalCode,
      destinationPostalCode: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value,
      length: pkg?.dimensions?.length,
      width: pkg?.dimensions?.width,
      height: pkg?.dimensions?.height,
      serviceCodes: params.serviceCodes,
    }
    const res = await client.post<LoggiQuoteResponse>(
      `v1/companies/${this.companyId}/quotes`,
      body,
    )
    return (res.options ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * POST /v1/companies/{company_id}/labels for one loggiKey. Loggi has no
   * label read; this is the documented way to fetch a package's label, and
   * responseType LABEL_RESPONSE_TYPE_URL returns `success.url`.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const companyId = this.readCompanyId()
    const client = new LoggiClient(credentials)
    const raw = await client.post<LoggiLabelResponse>(
      `v1/companies/${encodeURIComponent(companyId)}/labels`,
      {
        loggiKeys: [id],
        responseType: 'LABEL_RESPONSE_TYPE_URL',
      },
    )
    return transformLabel(raw, id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a Loggi label')
    const client = new LoggiClient(credentials)
    const raw = await client.post<LoggiLabelResponse>(
      `v1/companies/${this.companyId}/labels`,
      {
        loggiKeys: [data.shipmentId],
        responseType: 'LABEL_RESPONSE_TYPE_URL',
      },
    )
    return transformLabel(raw, data.shipmentId, data.trackingNumber)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Loggi label cancellation goes through the package cancel endpoint.
    const client = new LoggiClient(credentials)
    await client.post<unknown>(
      `v1/companies/${this.companyId}/packages/cancel?loggi_key=${encodeURIComponent(id)}`,
      {},
    )
  }

  // ── List Labels ────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      'Loggi cannot list labels: its only label route is POST /v1/companies/{company_id}/labels, ' +
        'which generates labels for the loggiKeys named in the request ' +
        '("Para referenciar este(s) envio(s), será necessário informar o(s) loggiKey(s) associado(s)"), ' +
        `and ${NO_PACKAGE_LIST}`,
    )
  }
}
