/**
 * Zip documents no way to list charges, and no payouts resource at all.
 *
 * - Charges (https://docs.us.zip.co/reference/charges.md) define only
 *   `"/charges": { "post": ... }` (create); the read is by id only,
 *   `"/charges/{chargeId}": { "get": ... }`
 *   (https://docs.us.zip.co/reference/chargeschargeid.md).
 * - Neither https://docs.us.zip.co/llms.txt nor
 *   https://developers.zip.co/v2/llms.txt lists a payouts, settlements or
 *   disbursements endpoint.
 *
 * - getCharge was fabricated: it called https://api.prod.au.edge.zip.co/v2 with
 *   an OAuth token, where Zip documents the host "Global platform:
 *   <https://global-api.prod.au.edge.zip.co/merchant>" and "The Zip web API
 *   uses a secure API key to identify and authorize the merchant."
 *   (https://docs.us.zip.co/reference/overview.md). The token came from an
 *   authorization-code flow at zip.co/login/connect that Zip does not document;
 *   Zip documents OAuth only as Client Credentials for Zip NZ
 *   (https://developers.zip.co/v4/reference/authentication-authorization.md).
 *
 * So all four reads refuse with 501 before any request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, type Credentials } from '@opensteward/shared'
import { ZipBnplAdapter } from '../../../../../../src/verticals/payments/adapters/zip-bnpl/index'

function adapter() {
  return new ZipBnplAdapter({
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'https://example.test/cb',
  })
}

const creds: Credentials = { accessToken: 'tok' } as Credentials

afterEach(() => {
  vi.restoreAllMocks()
})

// Each refusal names its own read, and getCharge names the undocumented auth.
const MESSAGES = {
  listCharges: /^Zip cannot list charges:/,
  getCharge:
    /^Zip cannot read a charge: .*authorization-code token from zip\.co\/login\/connect, an endpoint Zip does not document/,
  listPayouts: /^Zip cannot list payouts:/,
  getPayout: /^Zip cannot read payouts:/,
} as const

describe('zip-bnpl refusals', () => {
  const refused = ['listCharges', 'getCharge', 'listPayouts', 'getPayout'] as const
  for (const m of refused) {
    it(`${m} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const get = vi.fn(async () => {
        throw new Error('no request expected')
      })
      const create = vi
        .spyOn(axios, 'create')
        .mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
      const call = (adapter()[m] as (c: Credentials, p: unknown) => Promise<unknown>).call(
        adapter(),
        creds,
        m.startsWith('list') ? withPageSink({ page: 1, limit: 10 }) : 'id_1',
      )
      await expect(call).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(MESSAGES[m]),
      })
      expect(get).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  }
})
