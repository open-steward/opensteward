import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { PaymentMethod } from '../schema/payment-method'

const RESOURCE = 'payment_methods'

export function createPaymentMethodsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/payment_methods', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPaymentMethods) {
        return reply.status(501).send({ error: 'listPaymentMethods not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<PaymentMethod>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listPaymentMethods!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/payment_methods/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPaymentMethod) {
        return reply.status(501).send({ error: 'getPaymentMethod not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<PaymentMethod>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getPaymentMethod!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/payment_methods/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.detachPaymentMethod) {
        return reply.status(501).send({ error: 'detachPaymentMethod not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      await adapter.detachPaymentMethod(credentials, request.params.id)
      return reply.status(204).send()
    })
  }
}
