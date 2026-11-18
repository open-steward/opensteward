import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Aggregator } from '../proxy/aggregator'
import { VerticalHealth, listEnvelope, errorBody } from './_openapi'

const TAG = 'verticals'

export function createVerticalsRoutes(aggregator: Aggregator) {
  return async function verticalsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get(
      '/api/verticals',
      {
        schema: {
          tags: [TAG],
          summary: 'List enabled verticals + per-vertical health',
          description:
            'List the configured verticals along with a live health check for each (e.g. whether its backing service is reachable). Any authenticated operator. Useful for a system-status dashboard.',
          operationId: 'verticals.list',
          response: {
            200: listEnvelope(VerticalHealth),
            401: errorBody,
          },
        },
      },
      async () => {
        const health = await aggregator.healthCheck()
        return { data: health, meta: { page: 1, limit: health.length, total: health.length } }
      },
    )
  }
}
