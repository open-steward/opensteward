/**
 * Fixture: the documented example of
 * https://docs.ada.cx/reference/conversations/fetch-conversation-messages-by-id
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawAdaMessageLog,
} from '../../../../../../../src/verticals/customer-support/adapters/ada-cx/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

const documented: RawAdaMessageLog[] = [
  {
    type: 'message_logs',
    message_id: '6900e297d458517e4b15787d',
    created_at: '2025-10-28T15:34:41+00:00',
    author: { role: 'ai_agent', id: {} as never, display_name: {} as never, avatar: {} as never },
    content: {
      type: 'text',
      body: "Hello! I'm an AI Agent, here to assist with any questions you may have.",
    },
  },
  {
    type: 'message_logs',
    message_id: '6900e299d458517e4b157881',
    created_at: '2025-10-28T15:34:49+00:00',
    author: {
      id: '6900e28ff6f931ca8672f6dd',
      role: 'end_user',
      display_name: {} as never,
      avatar: {} as never,
    },
    content: { type: 'text', body: 'this is just a test' },
  },
  {
    type: 'message_logs',
    message_id: '6900e2a2d458517e4b157887',
    created_at: '2025-10-28T15:35:05+00:00',
    author: { role: 'ai_agent', id: {} as never, display_name: {} as never, avatar: {} as never },
    content: {
      type: 'link',
      url: 'https://example.com/csat?conversation_id=123',
      link_text: 'Rate your experience',
    },
  },
]

describe('ada-cx transformMessage', () => {
  it('parses every documented example message against MessageSchema', () => {
    for (const raw of documented) MessageSchema.parse(transformMessage(raw, 'conv_1'))
  })

  it('maps an end-user text message', () => {
    const out = MessageSchema.parse(transformMessage(documented[1]!, 'conv_1'))
    expect(out).toMatchObject({
      id: '6900e299d458517e4b157881',
      externalId: '6900e299d458517e4b157881',
      ticketId: 'conv_1',
      authorId: '6900e28ff6f931ca8672f6dd',
      authorType: 'contact',
      body: 'this is just a test',
      type: 'public',
      createdAt: '2025-10-28T15:34:49.000Z',
      platform: 'ada-cx',
    })
  })

  it('maps an AI agent message to system with no author id', () => {
    const out = transformMessage(documented[0]!, 'conv_1')
    expect(out.authorType).toBe('system')
    expect(out.authorId).toBe('')
    expect(out.body).toMatch(/^Hello! I'm an AI Agent/)
  })

  it('maps human_agent to user, and an unlisted role to unknown', () => {
    const human = { ...documented[1]!, author: { id: null, role: 'human_agent' } }
    expect(transformMessage(human, 'c').authorType).toBe('user')
    const other = { ...documented[1]!, author: { id: null, role: 'robot' } }
    expect(transformMessage(other, 'c').authorType).toBe('unknown')
  })

  it('gives a link message no body, and counts a file as one attachment without its content', () => {
    expect(transformMessage(documented[2]!, 'c').body).toBe('')
    const file: RawAdaMessageLog = {
      ...documented[1]!,
      content: {
        type: 'file',
        url: 'https://files.example/presigned',
        mime_type: 'image/png',
        filename: 'screenshot.png',
      },
    }
    const out = MessageSchema.parse(transformMessage(file, 'c'))
    expect(out.body).toBe('')
    expect(out.attachmentCount).toBe(1)
    expect(JSON.stringify(out.metadata)).not.toContain('presigned')
  })

  it('throws on a message with no message_id', () => {
    expect(() => transformMessage({ ...documented[1]!, message_id: undefined }, 'c')).toThrow(
      /message_id/,
    )
  })
})
