import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { CrmAdapter } from '../../../../../src/verticals/crm/adapter/interface'
import type { Credentials } from '../../../../../src/verticals/crm/adapter/interface'
import { createContactsRouter } from '../../../../../src/verticals/crm/router/contacts'
import type { Contact } from '../../../../../src/verticals/crm/schema/contact'

const STUB_CREDENTIALS: Credentials = { accessToken: 'test-token' }

const STUB_CONTACT: Contact = {
  id: 'c1',
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@example.com',
  metadata: {},
}

function makeAdapter(overrides: Partial<CrmAdapter> = {}): CrmAdapter {
  return {
    platform: 'stub',
    version: '0.1.0',
    getAuthUrl: () => '#',
    exchangeCode: async () => ({ accessToken: '' }),
    refreshCredentials: async (c: Credentials) => c,
    verifyWebhook: () => true,
    parseWebhookEvents: () => [],
    listContacts: async () => [STUB_CONTACT],
    getContact: async () => STUB_CONTACT,
    createContact: async () => STUB_CONTACT,
    updateContact: async () => STUB_CONTACT,
    deleteContact: async () => undefined,
    ...overrides,
  } as unknown as CrmAdapter
}

function buildFastify(adapter: CrmAdapter): FastifyInstance {
  const fastify = Fastify({ logger: false })
  fastify.addHook('preHandler', async (request) => {
    ;(request as unknown as { adapter: CrmAdapter; credentials: Credentials }).adapter = adapter
    ;(request as unknown as { adapter: CrmAdapter; credentials: Credentials }).credentials = STUB_CREDENTIALS
  })
  return fastify
}

describe('crm contacts router', () => {
  let fastify: FastifyInstance

  afterEach(async () => {
    await fastify?.close()
  })

  describe('GET /v1/contacts', () => {
    it('returns 200 with list from adapter', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/contacts' })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().data[0].id).toBe('c1')
    })

    it('returns 501 when adapter does not implement listContacts', async () => {
      fastify = buildFastify(makeAdapter({ listContacts: undefined }))
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/contacts' })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('GET /v1/contacts/:id', () => {
    it('returns 200 with single contact', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/contacts/c1' })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe('c1')
    })

    it('returns 501 when adapter does not implement getContact', async () => {
      fastify = buildFastify(makeAdapter({ getContact: undefined }))
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'GET', url: '/v1/contacts/c1' })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('POST /v1/contacts', () => {
    it('returns 201 on valid body', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/contacts',
        payload: { first_name: 'Bob', email: 'bob@example.com' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().data.id).toBe('c1')
    })

    it('returns 400 on invalid body', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/contacts',
        payload: [1, 2, 3],  // array is not a record object
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Invalid request body')
    })

    it('returns 501 when adapter does not implement createContact', async () => {
      fastify = buildFastify(makeAdapter({ createContact: undefined }))
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/contacts',
        payload: {},
      })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('PATCH /v1/contacts/:id', () => {
    it('returns 200 on valid update', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'PATCH',
        url: '/v1/contacts/c1',
        payload: { first_name: 'Alice Updated' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe('c1')
    })

    it('returns 400 on invalid body', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'PATCH',
        url: '/v1/contacts/c1',
        payload: [1, 2, 3],  // array is not a record object
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Invalid request body')
    })

    it('returns 501 when adapter does not implement updateContact', async () => {
      fastify = buildFastify(makeAdapter({ updateContact: undefined }))
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({
        method: 'PATCH',
        url: '/v1/contacts/c1',
        payload: {},
      })
      expect(res.statusCode).toBe(501)
    })
  })

  describe('DELETE /v1/contacts/:id', () => {
    it('returns 204', async () => {
      fastify = buildFastify(makeAdapter())
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'DELETE', url: '/v1/contacts/c1' })
      expect(res.statusCode).toBe(204)
    })

    it('returns 501 when adapter does not implement deleteContact', async () => {
      fastify = buildFastify(makeAdapter({ deleteContact: undefined }))
      await fastify.register(createContactsRouter(), { prefix: '/v1' })
      await fastify.ready()

      const res = await fastify.inject({ method: 'DELETE', url: '/v1/contacts/c1' })
      expect(res.statusCode).toBe(501)
    })
  })
})
