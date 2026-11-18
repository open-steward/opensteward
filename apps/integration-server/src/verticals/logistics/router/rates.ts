import { sharedSingleResponse } from '@opensteward/shared'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { RateRequestParams } from '../adapter/interface'

export function createRatesRouter() {
  return async function ratesRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/rates', async (request, reply) => {
    const { adapter, credentials } = request
    if (!adapter.getRates) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
    const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body' })
    }
    const data = await adapter.getRates(credentials, parsed.data as RateRequestParams)
    return reply.send(sharedSingleResponse(data, adapter.platform))
  })
}
}
