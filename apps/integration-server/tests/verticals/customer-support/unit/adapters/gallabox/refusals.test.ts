import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { GallaboxClient } from '../../../../../../src/verticals/customer-support/adapters/gallabox/client'
import { GallaboxAdapter } from '../../../../../../src/verticals/customer-support/adapters/gallabox/index'

/**
 * Gallabox documents no read endpoint for conversations or messages. The
 * first-party pages https://developers.gallabox.com/gallabox-api/conversations
 * and https://developers.gallabox.com/gallabox-api/messages (and their .md and
 * llms-full.txt forms) are a bare "# Conversations" / "# Messages" heading
 * with no endpoint. The adapter used to call invented
 * /accounts/:accountId/conversations[/:id[/messages]] paths; every one of
 * those methods must now refuse with 501 NOT_SUPPORTED before any request.
 * The Postman reference https://api-docs.gallabox.com has only conversation
 * actions and a message delivery-status read with no conversation, author or
 * body, so it cannot back either resource.
 */

const CREDS = {
  accessToken: 'key',
  extra: { apiSecret: 'secret', accountId: 'acc1' },
} as unknown as Credentials

afterEach(() => vi.restoreAllMocks())

function spyOnRequests() {
  return vi.spyOn(GallaboxClient.prototype, 'get').mockImplementation(async () => {
    throw new Error('no request may be sent')
  })
}

async function expectRefusal(run: () => Promise<unknown>, prefix: string) {
  const spy = spyOnRequests()
  const err = (await run().then(
    () => undefined,
    (e: unknown) => e,
  )) as (Error & { statusCode?: number; code?: string }) | undefined
  expect(err).toBeInstanceOf(Error)
  expect(err!.statusCode).toBe(501)
  expect(err!.code).toBe('NOT_SUPPORTED')
  // Pin the action and resource as a prefix: the reason text itself names
  // other resources and URLs, so a bare toContain would pass a wrong resource.
  expect(err!.message.startsWith(`${prefix}: `)).toBe(true)
  expect(spy).not.toHaveBeenCalled()
}

const adapter = new GallaboxAdapter()

describe('GallaboxAdapter refuses undocumented conversation and message reads', () => {
  it('listTickets throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(
      () => adapter.listTickets(CREDS, { page: 1, limit: 50 }),
      'Gallabox cannot list conversations',
    )
  })

  it('getTicket throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(() => adapter.getTicket(CREDS, 'c1'), 'Gallabox cannot read conversations')
  })

  it('listMessages throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(
      () => adapter.listMessages(CREDS, 'c1', { page: 1, limit: 50 }),
      'Gallabox cannot list messages',
    )
  })

  it('getMessage throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(() => adapter.getMessage(CREDS, 'm1'), 'Gallabox cannot read messages')
  })
})
