/**
 * EnviaYa documents no REST shipment list.
 *
 * First-party docs: the Postman collection behind https://docs.enviaya.com.mx/
 * (https://docs.enviaya.com.mx/api/collections/97219/Szf8285x?environment=97219-931f3b56-b494-4228-903e-e0157d67264c&segregateAuth=true&versionTag=latest).
 * Its Shipment folder holds only
 *
 *   "Label (MX)"                 POST https://enviaya.com.mx/api/v1/shipments?enviaya_account=
 *   "Label (MX) (With Account)"  POST https://enviaya.com.mx/api/v1/shipments
 *
 * i.e. label booking. GET /api/v1/shipments, which listShipments used to call,
 * is not documented and answers 404. The only shipment listing in the
 * collection is the GraphQL "Shipments" request, POST {{base_url}}/graphql, in a
 * folder the docs describe as "mainly to be used by the frontend requests",
 * authorised by a Bearer "<token>", with {{base_url}} defined in no published
 * environment and no saved response. So listShipments refuses before sending
 * anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { EnviaYaAdapter } from '../../../../../../src/verticals/logistics/adapters/enviaya/index'

const CREDS = { accessToken: 'API_KEY' }

function spyHttp() {
  const post = vi.fn(async () => ({ data: {} }))
  const get = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { post, get, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

describe('enviaya listShipments refuses without a request', () => {
  const cases: Array<[string, Parameters<EnviaYaAdapter['listShipments']>[1]]> = [
    ['page 1', withPageSink({ page: 1, limit: 10 })],
    [
      'page 2 with updatedAfter',
      withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    ],
  ]

  for (const [name, params] of cases) {
    it(`${name}: throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { post, get, create } = spyHttp()
      const err = await new EnviaYaAdapter().listShipments(CREDS, params).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).toEqual(NOT_SUPPORTED)
      expect((err as Error).message).toMatch(/EnviaYa cannot list shipments/)
      expect((err as Error).message).toMatch(/mainly to be used by the frontend requests/)
      expect(post).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  }
})
