/**
 * Loggi reads against the routes the vendor documents at
 * https://docs.api.loggi.com/reference (one OpenAPI definition per page, index
 * at https://docs.api.loggi.com/llms.txt):
 *
 *   GET  /v1/companies/{company_id}/packages/{tracking_code}           PackageDetailsTrackingCode
 *   GET  /v1/companies/{company_id}/packages/{tracking_code}/tracking  TrackPackageTrackingCode
 *   POST /v1/companies/{company_id}/labels                             (Criar Etiqueta)
 *   PATCH /v1/companies/{company_id}/packages                          PackageUpdate
 *
 * Every definition lists `"servers": [{"url":"https://stg.api.loggi.com"},{"url":"https://api.loggi.com"}]`;
 * the adapter uses the production host. Nothing lists packages or labels, so
 * listShipments and listLabels refuse with 501 before any request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { LoggiAdapter } from '../../../../../../src/verticals/logistics/adapters/loggi/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'

const CREDS = { accessToken: 'id-token' }
const COMPANY = '123456'
const TRACKING = 'AM1007503594LG'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const create = vi.fn()

beforeEach(() => {
  create.mockReturnValue({ get, post, patch } as unknown as ReturnType<typeof axios.create>)
  vi.spyOn(axios, 'create').mockImplementation(create)
})

afterEach(() => {
  vi.restoreAllMocks()
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  create.mockReset()
})

function expectNoRequest() {
  expect(get).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(patch).not.toHaveBeenCalled()
}

async function rejection(p: Promise<unknown>) {
  return p.then(
    () => {
      throw new Error('resolved')
    },
    (e: unknown) => e as Error & { statusCode?: number; code?: string },
  )
}

function documentedPackage(trackingCode = TRACKING) {
  return {
    loggiKey: 'KIF511LG3LGGA3U8G28B4200NA',
    trackingCode,
    status: {
      code: 17,
      highLevelStatus: 'Chegou em uma base',
      updatedTime: '2024-03-02T12:00:00Z',
    },
    promisedDate: '2024-03-05',
    dimension: { weightG: 100, lengthCm: 10, widthCm: 10, heightCm: 10 },
    pricing: { amount: { currencyCode: 'BRL', units: '7', nanos: 520000000 } },
  }
}

describe('loggi list methods refuse before any request', () => {
  const cases: Array<[string, (a: LoggiAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 5 })),
      /^Loggi cannot list shipments: .*PATCH-only/,
    ],
    [
      'listLabels',
      (a) => a.listLabels(CREDS, withPageSink({ page: 1, limit: 5 })),
      /^Loggi cannot list labels: .*POST \/v1\/companies\/\{company_id\}\/labels/,
    ],
  ]
  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends nothing`, async () => {
      const err = await rejection(call(new LoggiAdapter({ companyId: COMPANY })))
      expect(err.message).toMatch(message)
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
      expectNoRequest()
    })
  }
})

describe('loggi reads without a companyId refuse before any request', () => {
  const cases: Array<[string, (a: LoggiAdapter) => Promise<unknown>]> = [
    ['getShipment', (a) => a.getShipment(CREDS, TRACKING)],
    ['getTrackingEvents', (a) => a.getTrackingEvents(CREDS, TRACKING)],
    ['getLabel', (a) => a.getLabel(CREDS, 'KIF511LG3TBNA3U8G2INVEWO32')],
  ]
  for (const [name, call] of cases) {
    it(`${name} throws 501 naming the company id instead of calling /companies/default`, async () => {
      const err = await rejection(call(new LoggiAdapter()))
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
      expect(err.message).toMatch(/company id/)
      expectNoRequest()
    })
  }
})

describe('loggi client host', () => {
  it('talks to the production host, not stg.api.loggi.com', async () => {
    get.mockResolvedValue({ data: { packages: [documentedPackage()] } })
    await new LoggiAdapter({ companyId: COMPANY }).getShipment(CREDS, TRACKING)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.loggi.com/' }),
    )
  })
})

describe('loggi getShipment', () => {
  it('GETs the documented package-details path and reads packages[]', async () => {
    get.mockResolvedValue({ data: { packages: [documentedPackage()] } })
    const out = await new LoggiAdapter({ companyId: COMPANY }).getShipment(CREDS, TRACKING)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toBe(`v1/companies/${COMPANY}/packages/${TRACKING}`)
    const parsed = ShipmentSchema.parse(out)
    expect(parsed).toMatchObject({ id: TRACKING, trackingNumber: TRACKING, status: 'IN_TRANSIT' })
    expect(parsed.cost).toEqual({ amount: 752, currency: 'BRL' })
  })

  it('returns the package whose trackingCode matches the id', async () => {
    get.mockResolvedValue({
      data: { packages: [documentedPackage('OTHER1'), documentedPackage(TRACKING)] },
    })
    const out = await new LoggiAdapter({ companyId: COMPANY }).getShipment(CREDS, TRACKING)
    expect(out.id).toBe(TRACKING)
  })

  it('throws 404 when no returned package carries the tracking code', async () => {
    get.mockResolvedValue({ data: { packages: [] } })
    const err = await rejection(
      new LoggiAdapter({ companyId: COMPANY }).getShipment(CREDS, TRACKING),
    )
    expect(err.statusCode).toBe(404)
  })
})

describe('loggi getTrackingEvents', () => {
  it('GETs the documented tracking path and flattens trackingHistory', async () => {
    get.mockResolvedValue({
      data: {
        packages: [
          {
            trackingCode: TRACKING,
            trackingHistory: [
              {
                status: {
                  code: 14,
                  highLevelStatus: 'Coletado',
                  updatedTime: '2024-03-01T10:00:00Z',
                },
                location: { city: 'São Paulo', state: 'SP' },
              },
              {
                status: {
                  code: 5,
                  highLevelStatus: 'Entregue',
                  updatedTime: '2024-03-03T10:00:00Z',
                },
              },
            ],
          },
        ],
      },
    })
    const events = await new LoggiAdapter({ companyId: COMPANY }).getTrackingEvents(CREDS, TRACKING)
    expect(get.mock.calls[0][0]).toBe(`v1/companies/${COMPANY}/packages/${TRACKING}/tracking`)
    expect(events.map((e) => TrackingEventSchema.parse(e).status)).toEqual([
      'IN_TRANSIT',
      'DELIVERED',
    ])
  })
})

describe('loggi getLabel', () => {
  it('POSTs the documented label request for the one loggiKey and reads success.url', async () => {
    post.mockResolvedValue({
      data: {
        success: {
          url: 'http://api.loggi.com.br/labels/label_para_download.pdf',
          createdTime: '2021-01-13T10:43:17Z',
        },
        failure: [],
      },
    })
    const key = 'KIF511LG3TBNA3U8G2INVEWO32'
    const out = await new LoggiAdapter({ companyId: COMPANY }).getLabel(CREDS, key)
    expect(post).toHaveBeenCalledWith(`v1/companies/${COMPANY}/labels`, {
      loggiKeys: [key],
      responseType: 'LABEL_RESPONSE_TYPE_URL',
    })
    expect(LabelSchema.parse(out)).toMatchObject({
      id: key,
      url: 'http://api.loggi.com.br/labels/label_para_download.pdf',
    })
  })
})
