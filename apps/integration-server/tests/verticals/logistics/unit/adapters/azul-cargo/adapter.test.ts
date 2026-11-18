/**
 * Azul Cargo adapter reads, against the Swagger 2.0 spec "EDI Azul Logistica
 * Toolkit API's" (host ediapi.onlineapp.com.br, basePath /toolkit):
 * https://ediapi.onlineapp.com.br/toolkit/swagger/docs/v1
 *
 *   POST /api/Autenticacao/AutenticarUsuario  body Usuario {Email, Senha}
 *        → JSON_RepostaPadrao {ErrorText, HasErrors, Value}
 *   POST /api/Rastreio/Consultar  body RastreioRequestModel {Token, Awb, ChaveNfe, Pedido}
 *        → array of arrays of WEBCARGO_JSON_Rastreio_Ocorrencia
 *
 * The spec has no list or paging operation, so listTrackingEvents refuses with
 * 501 before any request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withPageSink } from '@opensteward/shared'
import { AzulCargoAdapter } from '../../../../../../src/verticals/logistics/adapters/azul-cargo/index'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'

const BASE = 'https://ediapi.onlineapp.com.br/toolkit/api/'
const LOGIN_URL = `${BASE}Autenticacao/AutenticarUsuario`
const CREDS = {
  accessToken: 'stale-token',
  extra: { email: 'ops@example.com', senha: 's3cret' },
}
const RASTREIO = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'rastreio-consultar.json'), 'utf8'),
) as unknown

describe('azul-cargo adapter', () => {
  const loginPost = vi.fn()
  const clientPost = vi.fn()
  const create = vi.fn()

  beforeEach(() => {
    loginPost.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url !== LOGIN_URL) throw new Error(`undocumented login url ${url}`)
      if (Object.keys(body).sort().join(',') !== 'Email,Senha') {
        throw new Error(`undocumented login body ${JSON.stringify(body)}`)
      }
      return { data: { HasErrors: false, ErrorText: null, Value: 'tok-123' } }
    })
    vi.spyOn(axios, 'post').mockImplementation(loginPost)
    clientPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
      if (path !== 'Rastreio/Consultar') {
        throw Object.assign(new Error(`undocumented path ${path}`), { response: { status: 404 } })
      }
      const allowed = new Set(['Token', 'Awb', 'ChaveNfe', 'Pedido'])
      for (const k of Object.keys(body)) {
        if (!allowed.has(k)) throw new Error(`undocumented body field ${k}`)
      }
      return { data: RASTREIO }
    })
    create.mockReturnValue({ post: clientPost } as unknown as ReturnType<typeof axios.create>)
    vi.spyOn(axios, 'create').mockImplementation(create)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    loginPost.mockReset()
    clientPost.mockReset()
    create.mockReset()
  })

  describe('listTrackingEvents', () => {
    it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
      const adapter = new AzulCargoAdapter()
      const err = await adapter
        .listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 5 }))
        .catch((e: unknown) => e)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(
        /^Azul Cargo cannot list tracking events: .*"POST \/api\/Rastreio\/Consultar"/,
      )
      expect(loginPost).not.toHaveBeenCalled()
      expect(clientPost).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  })

  describe('getTrackingEvents', () => {
    it('logs in, then posts {Token, Awb} to Rastreio/Consultar on the toolkit host', async () => {
      const events = await new AzulCargoAdapter().getTrackingEvents(CREDS, 'AWB123')
      expect(loginPost).toHaveBeenCalledWith(
        LOGIN_URL,
        { Email: 'ops@example.com', Senha: 's3cret' },
        expect.anything(),
      )
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ baseURL: BASE }))
      expect(clientPost).toHaveBeenCalledWith('Rastreio/Consultar', {
        Awb: 'AWB123',
        Token: 'tok-123',
      })
      expect(events).toHaveLength(3)
      for (const e of events) {
        expect(TrackingEventSchema.parse(e)).toEqual(e)
        expect(e.trackingNumber).toBe('AWB123')
      }
    })

    it('sends no API-key or Authorization header', async () => {
      await new AzulCargoAdapter().getTrackingEvents(CREDS, 'AWB123')
      const headers = (create.mock.calls[0]?.[0] as { headers?: Record<string, string> }).headers
      expect(headers).not.toHaveProperty('Authorization')
    })

    it('throws the login ErrorText when HasErrors is true, before tracking', async () => {
      loginPost.mockResolvedValueOnce({
        data: { HasErrors: true, ErrorText: 'Usuário inválido', Value: null },
      })
      await expect(new AzulCargoAdapter().getTrackingEvents(CREDS, 'AWB123')).rejects.toThrow(
        /Usuário inválido/,
      )
      expect(clientPost).not.toHaveBeenCalled()
    })

    it('asks for a reconnect when the connection has no e-mail and password', async () => {
      await expect(
        new AzulCargoAdapter().getTrackingEvents({ accessToken: 'k' }, 'AWB123'),
      ).rejects.toThrow(/reconnect/)
      expect(loginPost).not.toHaveBeenCalled()
    })

    it('rejects a body that is not the documented array', async () => {
      clientPost.mockResolvedValueOnce({ data: { HasErrors: true } })
      await expect(new AzulCargoAdapter().getTrackingEvents(CREDS, 'AWB123')).rejects.toThrow(
        /documented array/,
      )
    })

    it('surfaces ErrorText when a 200 carries the JSON_RepostaPadrao envelope', async () => {
      clientPost.mockResolvedValueOnce({
        data: { HasErrors: true, ErrorText: 'AWB não encontrado', Value: null },
      })
      await expect(new AzulCargoAdapter().getTrackingEvents(CREDS, 'AWB123')).rejects.toThrow(
        /Rastreio\/Consultar failed: AWB não encontrado/,
      )
    })

    it.each([
      ['an object', { Token: 'tok' }],
      ['an empty string', ''],
      ['null', null],
    ])('refuses a login whose Value is %s and never posts tracking', async (_label, value) => {
      loginPost.mockResolvedValueOnce({ data: { HasErrors: false, ErrorText: null, Value: value } })
      await expect(new AzulCargoAdapter().getTrackingEvents(CREDS, 'AWB123')).rejects.toThrow(
        /no token in Value/,
      )
      expect(clientPost).not.toHaveBeenCalled()
    })
  })

  describe('credentials', () => {
    it('collects e-mail and password and logs in to verify them', async () => {
      const adapter = new AzulCargoAdapter()
      expect(adapter.credentialFields().map((f) => f.name)).toEqual(['email', 'senha'])
      const creds = await adapter.exchangeCredentials({ email: 'ops@example.com', senha: 's3cret' })
      expect(creds).toEqual({
        accessToken: 'tok-123',
        extra: { email: 'ops@example.com', senha: 's3cret' },
      })
    })

    it.each([
      ['e-mail', { email: '  ', senha: 's3cret' }],
      ['password', { email: 'ops@example.com', senha: '' }],
    ])('refuses the form when the %s is blank and sends no login', async (_label, input) => {
      await expect(new AzulCargoAdapter().exchangeCredentials(input)).rejects.toThrow(
        /E-mail and password are required/,
      )
      expect(loginPost).not.toHaveBeenCalled()
    })

    it('refreshCredentials logs in again for a fresh token', async () => {
      loginPost.mockResolvedValueOnce({ data: { HasErrors: false, Value: 'tok-456' } })
      const creds = await new AzulCargoAdapter().refreshCredentials(CREDS)
      expect(creds.accessToken).toBe('tok-456')
    })

    it('exchangeCode refuses: there is no OAuth code', async () => {
      await expect(new AzulCargoAdapter().exchangeCode('x', 'https://r')).rejects.toThrow(
        /no OAuth/,
      )
    })

    it('getAuthUrl points at the toolkit docs, not a dead host', () => {
      expect(new AzulCargoAdapter().getAuthUrl('s')).toBe(
        'https://ediapi.onlineapp.com.br/toolkit/swagger/ui/index',
      )
    })
  })
})
