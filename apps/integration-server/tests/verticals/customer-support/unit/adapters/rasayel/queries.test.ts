/**
 * rasayel — the exact GraphQL documents the rebuilt read methods send.
 *
 * The original bug in listTickets, listMessages and listContacts was a query
 * that failed schema validation (`identifiers { type value }`, `$id: ID!`,
 * `body` on the `Message` interface), so every call errored at runtime. A
 * fake that only checks variables cannot see that. These tests pin each
 * document verbatim (whitespace collapsed).
 *
 * Every expected document below was validated with graphql-js against the SDL
 * the docs site ships (https://developers.rasayel.io, the schema embedded in
 * `/_app/immutable/chunks/CJwIrjDU.js`): `conversation(id: Int!)`,
 * `channelUser(id: Int!)`, `type ChannelUserSourceIdentifier { category:
 * ChannelUserIdentifierSourceEnum! sourceId: String! }`, `TagConnection`
 * `nodes`, `Conversation.assignedTeam: Team`, `ChannelUser.displayName`, and
 * `body` declared on `TextMessage`, `NoteMessage`, `RichMessage`,
 * `FlowResponseMessage` and `InteractiveMessage`. Changing a document means
 * re-validating it against that SDL before updating the expectation here.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { withPageSink, _resetCursorPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { RasayelAdapter } from '../../../../../../src/verticals/customer-support/adapters/rasayel/index'
import { RasayelClient } from '../../../../../../src/verticals/customer-support/adapters/rasayel/client'

const creds = { accessToken: 'Basic rasayel_q', extra: {} } as Credentials
const adapter = new RasayelAdapter()

const CONVERSATION =
  'id uuid state channelType createdAt updatedAt lastClosedAt contact { id } assignee { id } assignedTeam { id } tags { nodes { id } }'
const CHANNEL_USER = 'id uuid displayName identifiers { category sourceId }'
const MESSAGE =
  '__typename id uuid direction messageType messageCategory createdAt user { __typename id } ' +
  '... on TextMessage { body } ' +
  '... on NoteMessage { body attachments { mimeType } } ' +
  '... on RichMessage { body attachments { mimeType } } ' +
  '... on FlowResponseMessage { body } ' +
  '... on InteractiveMessage { body } ' +
  '... on ImageMessage { caption attachments { mimeType } } ' +
  '... on VideoMessage { caption attachments { mimeType } } ' +
  '... on AudioMessage { caption attachments { mimeType } } ' +
  '... on DocumentMessage { caption attachments { mimeType } } ' +
  '... on AnimationMessage { caption attachments { mimeType } }'

const EXPECTED = {
  ListConversations: `query ListConversations($first: Int, $after: String) { app { conversations(first: $first, after: $after) { edges { node { ${CONVERSATION} } } pageInfo { endCursor hasNextPage } } } }`,
  GetConversation: `query GetConversation($id: Int!) { app { conversation(id: $id) { ${CONVERSATION} } } }`,
  ListMessages: `query ListMessages($conversationId: Int!, $first: Int, $after: String) { app { conversation(id: $conversationId) { messages(first: $first, after: $after) { edges { node { ${MESSAGE} } } pageInfo { endCursor hasNextPage } } } } }`,
  ListChannelUsers: `query ListChannelUsers($first: Int, $after: String) { app { channelUsers(first: $first, after: $after) { edges { node { ${CHANNEL_USER} } } pageInfo { endCursor hasNextPage } } } }`,
  GetChannelUser: `query GetChannelUser($id: Int!) { app { channelUser(id: $id) { ${CHANNEL_USER} } } }`,
}

const normalize = (q: string) => q.replace(/\s+/g, ' ').trim()

/** Records the document of the first request, then fails it: nothing else is read. */
function capture(): { seen: string[] } {
  const box = { seen: [] as string[] }
  vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (query: string) => {
    box.seen.push(normalize(query))
    throw new Error('captured')
  }) as typeof RasayelClient.prototype.query)
  return box
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('rasayel sends schema-valid GraphQL documents, verbatim', () => {
  const cases: Array<[keyof typeof EXPECTED, () => Promise<unknown>]> = [
    ['ListConversations', () => adapter.listTickets(creds, withPageSink({ page: 1, limit: 2 }))],
    ['GetConversation', () => adapter.getTicket(creds, '1')],
    ['ListMessages', () => adapter.listMessages(creds, '1', withPageSink({ page: 1, limit: 2 }))],
    ['ListChannelUsers', () => adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))],
    ['GetChannelUser', () => adapter.getContact(creds, '1')],
  ]

  it.each(cases)('%s', async (name, call) => {
    const box = capture()
    await expect(call()).rejects.toThrow('captured')
    expect(box.seen).toEqual([EXPECTED[name]])
  })
})
