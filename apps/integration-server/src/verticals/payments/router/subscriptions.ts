import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Subscription } from '../schema/subscription'

const RESOURCE = 'subscriptions'

export function createSubscriptionsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/subscriptions', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listSubscriptions) {
        return reply.status(501).send({ error: 'listSubscriptions not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Subscription>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listSubscriptions!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/subscriptions/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getSubscription) {
        return reply.status(501).send({ error: 'getSubscription not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Subscription>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getSubscription!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/subscriptions', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createSubscription) {
        return reply.status(501).send({ error: 'createSubscription not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.createSubscription(credentials, parsed.data as Partial<Subscription>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/subscriptions/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateSubscription) {
        return reply.status(501).send({ error: 'updateSubscription not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.updateSubscription(credentials, request.params.id, parsed.data as Partial<Subscription>)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post<{ Params: { id: string }; Body: { atPeriodEnd?: boolean } }>(
      '/subscriptions/:id/cancel',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.cancelSubscription) {
          return reply.status(501).send({ error: 'cancelSubscription not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
        }
        const parsed = z.record(z.string(), z.unknown()).safeParse(request.body ?? {})
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
        const data = await adapter.cancelSubscription(credentials, request.params.id, parsed.data as { atPeriodEnd?: boolean })
        writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )
  }
}
