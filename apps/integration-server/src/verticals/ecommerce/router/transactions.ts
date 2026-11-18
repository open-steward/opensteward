import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Transaction } from '../schema/transaction'

const RESOURCE = 'transactions'

export function createTransactionsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/transactions', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTransactions) {
        return reply.status(501).send({ error: 'listTransactions not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Transaction>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listTransactions!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTransaction) {
        return reply.status(501).send({ error: 'getTransaction not implemented by this adapter' })
      }
      const data = await cachedGet<Transaction>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTransaction!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/transactions', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createTransaction) {
        return reply
          .status(501)
          .send({ error: 'createTransaction not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createTransaction(
        credentials,
        parsed.data as Partial<Transaction>,
      )
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })
  }
}
