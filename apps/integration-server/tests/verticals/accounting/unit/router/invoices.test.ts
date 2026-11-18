import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AccountingAdapter, Credentials } from '../../../../../src/verticals/accounting/adapter/interface'
import { createInvoicesRouter } from '../../../../../src/verticals/accounting/router/invoices'
import type { Invoice } from '../../../../../src/verticals/accounting/schema/invoice'

const STUB_CREDENTIALS: Credentials = { accessToken: 'test-token' }

const STUB_INVOICE: Invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-001',
  status: 'DRAFT',
  metadata: {},
}

function makeAdapter(overrides: Partial<AccountingAdapter> = {}): AccountingAdapter {
  return {
    platform: 'stub',
    version: '0.1.0',
    listInvoices: async () => [STUB_INVOICE],
    getInvoice: async () => STUB_INVOICE,
    createInvoice: async () => STUB_INVOICE,
    updateInvoice: async () => STUB_INVOICE,
    deleteInvoice: async () => undefined,
    ...overrides,
  } as unknown as AccountingAdapter
}

function buildFastify(adapter: AccountingAdapter): FastifyInstance {
  const fastify = Fastify({ logger: false })
  fastify.addHook('preHandler', async (request) => {
    ;(request as unknown as { adapter: AccountingAdapter; credentials: Credentials }).adapter = adapter
    ;(request as unknown as { adapter: AccountingAdapter; credentials: Credentials }).credentials = STUB_CREDENTIALS
  })
  return fastify
}

describe('accounting invoices router', () => {
  let fastify: FastifyInstance

  afterEach(async () => {
    await fastify?.close()
  })

  describe('GET /', () => {
    it('returns 200 with list', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/invoices' })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it('returns 501 when listInvoices not implemented', async () => {
      fastify = buildFastify(makeAdapter({ listInvoices: undefined }))
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/invoices' })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('GET /:id', () => {
    it('returns 200 with single invoice', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/invoices/inv-1' })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe('inv-1')
    })

    it('returns 501 when getInvoice not implemented', async () => {
      fastify = buildFastify(makeAdapter({ getInvoice: undefined }))
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/invoices/inv-1' })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('POST /', () => {
    it('returns 201 on valid body', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/invoices',
        payload: { invoiceNumber: 'INV-002' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().data.id).toBe('inv-1')
    })

    it('returns 400 on invalid body', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/invoices',
        payload: [1, 2, 3],  // array is not a record object
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Invalid request body')
    })

    it('returns 501 when createInvoice not implemented', async () => {
      fastify = buildFastify(makeAdapter({ createInvoice: undefined }))
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/invoices',
        payload: {},
      })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('PUT /:id', () => {
    it('returns 200 on valid update', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'PUT',
        url: '/v1/invoices/inv-1',
        payload: { status: 'AUTHORIZED' },
      })
      expect(res.statusCode).toBe(200)
    })

    it('returns 400 on invalid body', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'PUT',
        url: '/v1/invoices/inv-1',
        payload: [1, 2, 3],  // array is not a record object
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Invalid request body')
    })

    it('returns 501 when updateInvoice not implemented', async () => {
      fastify = buildFastify(makeAdapter({ updateInvoice: undefined }))
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'PUT',
        url: '/v1/invoices/inv-1',
        payload: {},
      })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('DELETE /:id', () => {
    it('returns 204', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'DELETE', url: '/v1/invoices/inv-1' })
      expect(res.statusCode).toBe(204)
    })

    it('returns 501 when deleteInvoice not implemented', async () => {
      fastify = buildFastify(makeAdapter({ deleteInvoice: undefined }))
      await fastify.register(createInvoicesRouter(), { prefix: '/v1/invoices' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'DELETE', url: '/v1/invoices/inv-1' })
      expect(res.statusCode).toBe(501)
    })
  })
})
