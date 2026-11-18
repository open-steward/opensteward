/**
 * A tiny stand-in for Apache Superset's security API, served by Fastify on
 * an ephemeral port: login (db provider), CSRF token + session cookie, and
 * guest tokens. It enforces what the real one does — a valid bearer token on
 * every call, and the CSRF header plus its session cookie on writes — so the
 * client under test has to get the handshake right.
 */
import Fastify, { type FastifyInstance } from 'fastify'

export function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

export interface MockSuperset {
  app: FastifyInstance
  url: string
  logins: number
  guestTokenRequests: Array<Record<string, unknown>>
  /** Make every issued access token invalid (the next call gets 401). */
  revokeTokens(): void
  /** Make the guest-token endpoint fail with this status. */
  failGuestTokens(status: number | null): void
  close(): Promise<void>
}

export async function startMockSuperset(
  opts: {
    username?: string
    password?: string
    accessTtlSeconds?: number
  } = {},
): Promise<MockSuperset> {
  const username = opts.username ?? 'svc'
  const password = opts.password ?? 'svc-password'
  const app = Fastify({ logger: false })
  let generation = 0
  let guestFailure: number | null = null
  const valid = new Set<string>()
  const state = {
    logins: 0,
    guestTokenRequests: [] as Array<Record<string, unknown>>,
  }

  const bearerOk = (auth: unknown) =>
    typeof auth === 'string' && auth.startsWith('Bearer ') && valid.has(auth.slice(7))

  app.get('/health', async () => 'OK')

  app.post('/api/v1/security/login', async (request, reply) => {
    const b = request.body as Record<string, unknown>
    if (b['username'] !== username || b['password'] !== password || b['provider'] !== 'db') {
      return reply.status(401).send({ message: 'Not authorized' })
    }
    state.logins += 1
    generation += 1
    const token = fakeJwt({
      sub: username,
      gen: generation,
      exp: Math.floor(Date.now() / 1000) + (opts.accessTtlSeconds ?? 900),
    })
    valid.add(token)
    return { access_token: token }
  })

  app.get('/api/v1/security/csrf_token/', async (request, reply) => {
    if (!bearerOk(request.headers.authorization)) return reply.status(401).send({ msg: 'no' })
    reply.header('set-cookie', `session=sess-${generation}; HttpOnly; Path=/`)
    return { result: `csrf-${generation}` }
  })

  app.post('/api/v1/security/guest_token/', async (request, reply) => {
    if (!bearerOk(request.headers.authorization)) return reply.status(401).send({ msg: 'no' })
    const csrf = request.headers['x-csrftoken']
    const cookie = String(request.headers.cookie ?? '')
    if (
      typeof csrf !== 'string' ||
      !csrf.startsWith('csrf-') ||
      !cookie.includes('session=sess-')
    ) {
      return reply.status(400).send({ message: 'The CSRF token is missing.' })
    }
    if (guestFailure !== null) return reply.status(guestFailure).send({ message: 'boom' })
    state.guestTokenRequests.push(request.body as Record<string, unknown>)
    return { token: fakeJwt({ type: 'guest', exp: Math.floor(Date.now() / 1000) + 300 }) }
  })

  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    app,
    url: `http://127.0.0.1:${port}`,
    get logins() {
      return state.logins
    },
    get guestTokenRequests() {
      return state.guestTokenRequests
    },
    revokeTokens: () => valid.clear(),
    failGuestTokens: (status) => {
      guestFailure = status
    },
    close: () => app.close(),
  }
}
