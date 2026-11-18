/**
 * `UnifiedClient.getLicenseStatus` — the hop between admin-api's /api/license and
 * integration-server's GET /admin/license (admin guard). A real Fastify upstream,
 * like unified-client-sync-jobs.test.ts, so the header is exercised as a header.
 * integration-server's adminGuard answers 403 ADMIN_DISABLED (no ADMIN_SECRET on
 * it) or 403 FORBIDDEN (a different one), never 401.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { UnifiedClient } from '../../src/core/proxy/client'
import { describeFetchFailure } from '../../src/core/license/status-cache'
import { licenseStatusFixture } from '../journeys/license-fixtures'

describe('UnifiedClient.getLicenseStatus', () => {
  let server: FastifyInstance
  let client: UnifiedClient
  let seenSecret: unknown
  let answer: { status: number; body: unknown } = { status: 200, body: {} }

  beforeAll(async () => {
    server = Fastify({ logger: false })
    server.get('/admin/license', async (request, reply) => {
      seenSecret = request.headers['x-admin-secret']
      return reply.status(answer.status).send(answer.body)
    })
    const address = await server.listen({ port: 0, host: '127.0.0.1' })
    client = new UnifiedClient({ url: address, adminSecret: 'client-test-admin-secret' })
  })

  afterAll(async () => {
    await server.close()
  })

  it("returns the answer's data, sending X-Admin-Secret", async () => {
    answer = { status: 200, body: { data: licenseStatusFixture() } }
    expect(await client.getLicenseStatus()).toEqual(licenseStatusFixture())
    expect(seenSecret).toBe('client-test-admin-secret')
  })

  it.each(['ADMIN_DISABLED', 'FORBIDDEN'])(
    'rejects on 403 %s, keeping the code for the cache',
    async (code) => {
      answer = { status: 403, body: { error: { code, message: 'x' } } }
      const err = await client.getLicenseStatus().catch((e: unknown) => e)
      expect(err).toMatchObject({ response: { status: 403 } })
      expect(describeFetchFailure(err)).toMatchObject({ status: 403, code })
    },
  )

  it('rejects on 404: a missing route is no answer, never "no license"', async () => {
    answer = { status: 404, body: { error: 'Not found' } }
    await expect(client.getLicenseStatus()).rejects.toMatchObject({ response: { status: 404 } })
  })
})
