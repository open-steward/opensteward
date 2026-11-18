/**
 * IZBERG collections are refused, and every request carries the documented
 * Bearer token.
 *
 * Collections: the adapter read GET /v1/category/, a path that is in neither
 * first-party spec (https://docs-api.izberg-marketplace.com/swagger.json and
 * https://docs-api-merchant.izberg-marketplace.com/swagger-ui-init.js) and that
 * answers 404 live. The documented taxonomy list is GET /v1/application_category/
 * ("List all application categories"), but both specs give it only
 * `"responses": { "200": { "description": "" } }`: no field of a category row
 * is documented, so a row cannot be mapped to a Collection without guessing.
 * Neither spec has a GET on /v1/application_category/{id}/ either. Both
 * methods therefore refuse with 501 before sending anything.
 *
 * Auth: the public spec declares `"security": [{ "bearerAuth": [] }]` with
 * `bearerAuth: { type: "http", scheme: "bearer" }`, and its examples send
 * `Authorization: Bearer <your_token>` to https://api.iceberg.technology/v1/.
 * The merchant spec lists "Seller(s) authorization token (Bearer)" among its
 * integration prerequisites. The old `IcebergAccessToken {username}:{key}`
 * scheme appears in neither.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { withPageSink, type Credentials } from '@opensteward/shared'
import { IzbergAdapter } from '../../../../../../src/verticals/ecommerce/adapters/izberg'

const CREDS: Credentials = { accessToken: 'seller-token' }

interface Created {
  config: { baseURL?: string; headers?: Record<string, string> }
  get: ReturnType<typeof vi.fn>
}

function fakeAxios(): Created[] {
  const created: Created[] = []
  vi.spyOn(axios, 'create').mockImplementation(((config: Created['config']) => {
    const inst: Created = {
      config,
      get: vi.fn(async () => ({
        data: { objects: [], meta: { limit: 20, offset: 0, total_count: 0, next: null } },
      })),
    }
    created.push(inst)
    return inst
  }) as never)
  return created
}

afterEach(() => vi.restoreAllMocks())

describe('IzbergAdapter collections', () => {
  it('listCollections refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const created = fakeAxios()
    const adapter = new IzbergAdapter()
    await expect(
      adapter.listCollections(CREDS, withPageSink({ page: 1, limit: 20 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(created.flatMap((c) => c.get.mock.calls)).toEqual([])
    expect(created).toEqual([])
  })

  it('getCollection refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const created = fakeAxios()
    const adapter = new IzbergAdapter()
    await expect(adapter.getCollection(CREDS, '42')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(created).toEqual([])
  })

  it('names the documented endpoint and why it cannot be mapped', async () => {
    fakeAxios()
    await expect(
      new IzbergAdapter().listCollections(CREDS, withPageSink({ page: 1, limit: 20 })),
    ).rejects.toThrow('/v1/application_category/')
  })
})

describe('IzbergClient auth', () => {
  it('sends the seller token as a Bearer token to the production host', async () => {
    const created = fakeAxios()
    await new IzbergAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 2 }))
    expect(created).toHaveLength(1)
    expect(created[0]!.config.baseURL).toBe('https://api.iceberg.technology/v1/')
    expect(created[0]!.config.headers?.['Authorization']).toBe('Bearer seller-token')
  })

  it('uses the sandbox host when configured', async () => {
    const created = fakeAxios()
    await new IzbergAdapter({ sandbox: true }).getOrder(CREDS, '9')
    expect(created[0]!.config.baseURL).toBe('https://api.sandbox.iceberg.technology/v1/')
    expect(created[0]!.get).toHaveBeenCalledWith('merchant_order/9/', { params: undefined })
  })

  it('the credential form stores the seller token as the access token', async () => {
    const adapter = new IzbergAdapter()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['token'])
    const creds = await adapter.exchangeCredentials({ token: '  abc  ' })
    expect(creds).toEqual({ accessToken: 'abc' })
  })

  it('the credential form rejects an empty token', async () => {
    await expect(new IzbergAdapter().exchangeCredentials({ token: ' ' })).rejects.toThrow(
      /token is required/i,
    )
  })
})
