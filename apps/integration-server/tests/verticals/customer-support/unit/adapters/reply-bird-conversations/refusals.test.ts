/**
 * The current Bird API (https://bird.com/openapi.json; "Base path: all
 * endpoints live under `/v1`", https://bird.com/docs/api) documents no
 * agent, team or macro endpoint.
 * Those methods refuse with 501 NOT_SUPPORTED and send no request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ReplyBirdConversationsAdapter } from '../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/index'

const CREDS = { accessToken: 'bk_us1_Ab3xKq9mP2wR5tY8uI1oL4n3A3aww' }

afterEach(() => vi.restoreAllMocks())

const REFUSED: Array<[string, (a: ReplyBirdConversationsAdapter) => Promise<unknown>]> = [
  ['listUsers', (a) => a.listUsers(CREDS, { page: 1, limit: 10 })],
  ['getUser', (a) => a.getUser(CREDS, 'x')],
  ['listTeams', (a) => a.listTeams(CREDS, { page: 1, limit: 10 })],
  ['getTeam', (a) => a.getTeam(CREDS, 'x')],
  ['listMacros', (a) => a.listMacros(CREDS, { page: 1, limit: 10 })],
  ['getMacro', (a) => a.getMacro(CREDS, 'x')],
]

describe('Bird refuses resources its API does not document', () => {
  for (const [name, call] of REFUSED) {
    it(`${name} throws 501 NOT_SUPPORTED without a request`, async () => {
      const get = vi.fn()
      const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
      const err = await call(new ReplyBirdConversationsAdapter()).catch((e: unknown) => e)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(/^Bird cannot (list|read) /)
      expect(create).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
    })
  }
})
