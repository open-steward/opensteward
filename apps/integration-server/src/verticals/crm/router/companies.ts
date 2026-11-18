import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Company } from '../schema/company'

const RESOURCE = 'companies'

export function createCompaniesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/companies', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listCompanies) {
        return reply.status(501).send({ error: 'listCompanies not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Company>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listCompanies!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/companies/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getCompany) {
        return reply.status(501).send({ error: 'getCompany not implemented by this adapter' })
      }
      const data = await cachedGet<Company>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getCompany!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/companies', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createCompany) {
        return reply.status(501).send({ error: 'createCompany not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createCompany(credentials, parsed.data as Partial<Company>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/companies/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateCompany) {
        return reply.status(501).send({ error: 'updateCompany not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateCompany(
        credentials,
        request.params.id,
        parsed.data as Partial<Company>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/companies/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteCompany) {
        return reply.status(501).send({ error: 'deleteCompany not implemented by this adapter' })
      }
      await adapter.deleteCompany(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
