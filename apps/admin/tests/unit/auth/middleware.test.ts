import { describe, it, expect, vi } from 'vitest'
import { requireAuth, requireRole } from '../../../src/core/auth/middleware'
import type { FastifyRequest, FastifyReply } from 'fastify'

function mockRequest(sessionUser?: {
  id: string
  username: string
  role: string
  token: string
}): FastifyRequest {
  return { sessionUser } as unknown as FastifyRequest
}

function mockReply() {
  const reply = {
    redirected: null as string | null,
    statusCode: null as number | null,
    body: null as unknown,
    // A refusal renders the error page rather than sending raw JSON, so the
    // mock needs `view`.
    viewed: null as { template: string; locals: Record<string, unknown> } | null,
    redirect(url: string) {
      reply.redirected = url
      return reply
    },
    status(code: number) {
      reply.statusCode = code
      return reply
    },
    send(body: unknown) {
      reply.body = body
      return reply
    },
    view(template: string, locals: Record<string, unknown>) {
      reply.viewed = { template, locals }
      return reply
    },
  }
  return reply as unknown as FastifyReply & {
    redirected: string | null
    statusCode: number | null
    body: unknown
    viewed: { template: string; locals: Record<string, unknown> } | null
  }
}

describe('requireAuth', () => {
  it('calls done() for authenticated user', () => {
    const done = vi.fn()
    requireAuth(
      mockRequest({ id: '1', username: 'admin', role: 'viewer', token: 't' }),
      mockReply(),
      done,
    )
    expect(done).toHaveBeenCalled()
  })

  it('redirects to /login when not authenticated', () => {
    const done = vi.fn()
    const reply = mockReply()
    requireAuth(mockRequest(), reply, done)
    expect(done).not.toHaveBeenCalled()
    expect(reply.redirected).toBe('/login')
  })
})

describe('requireRole', () => {
  it('allows admin to access operator routes', () => {
    const done = vi.fn()
    requireRole('operator')(
      mockRequest({ id: '1', username: 'a', role: 'admin', token: 't' }),
      mockReply(),
      done,
    )
    expect(done).toHaveBeenCalled()
  })

  it('allows operator to access operator routes', () => {
    const done = vi.fn()
    requireRole('operator')(
      mockRequest({ id: '1', username: 'a', role: 'operator', token: 't' }),
      mockReply(),
      done,
    )
    expect(done).toHaveBeenCalled()
  })

  it('blocks viewer from operator routes', () => {
    const done = vi.fn()
    const reply = mockReply()
    requireRole('operator')(
      mockRequest({ id: '1', username: 'a', role: 'viewer', token: 't' }),
      reply,
      done,
    )
    expect(done).not.toHaveBeenCalled()
    expect(reply.statusCode).toBe(403)
    expect(reply.viewed?.template).toBe('error.ejs')
    // The operator should learn which role is missing and that reading is fine.
    expect(String(reply.viewed?.locals.message)).toContain('operator')
    expect(String(reply.viewed?.locals.message)).toContain('viewer')
  })

  it('blocks operator from admin routes', () => {
    const done = vi.fn()
    const reply = mockReply()
    requireRole('admin')(
      mockRequest({ id: '1', username: 'a', role: 'operator', token: 't' }),
      reply,
      done,
    )
    expect(done).not.toHaveBeenCalled()
    expect(reply.statusCode).toBe(403)
  })

  it('allows admin to access admin routes', () => {
    const done = vi.fn()
    requireRole('admin')(
      mockRequest({ id: '1', username: 'a', role: 'admin', token: 't' }),
      mockReply(),
      done,
    )
    expect(done).toHaveBeenCalled()
  })

  it('redirects unauthenticated user to login', () => {
    const done = vi.fn()
    const reply = mockReply()
    requireRole('operator')(mockRequest(), reply, done)
    expect(done).not.toHaveBeenCalled()
    expect(reply.redirected).toBe('/login')
  })
})
