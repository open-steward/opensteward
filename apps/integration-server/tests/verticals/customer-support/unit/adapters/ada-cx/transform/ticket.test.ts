/**
 * Fixtures are the documented example responses:
 * - https://docs.ada.cx/data-export-conversation-object/get-conversations
 * - https://docs.ada.cx/reference/conversations/get-conversation-by-id
 */
import { describe, it, expect } from 'vitest'
import {
  transformConversation,
  transformExportConversation,
  type RawAdaConversation,
  type RawAdaExportConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/ada-cx/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

/** The documented Data Export example, verbatim apart from the used_* lists. */
const exportExample: RawAdaExportConversation = {
  _id: '5d8a7d080afd19b55945c8ab',
  agent_id: ['619d95c0c063a5bf2b1efb7c'],
  agent_handle_time: 4,
  agent_name: ['Ada Lovelace'],
  automated_resolution_classification: 'Resolved',
  automated_resolution_classification_reason:
    'The bot provided a detailed step-by-step guide on how to disable auto deposits',
  bot_handle_time: 4,
  browser: 'chrome',
  browser_version: '95.0.4638.69',
  chatter_id: '5dbaef7283d791f585563d84',
  csat: {
    comment: null,
    feedback: null,
    is_positive: false,
    resolved: null,
    score: 3,
    style: 'EMOJI',
    survey_type: 'end_chat',
    customer_effort_score: 4,
    ces_max: 5,
    net_promoter_score: 8,
  },
  date_created: '2019-10-31T14:28:02',
  date_updated: '2019-10-31T14:29:02',
  device: 'macos',
  end_user_id: '619d95c0c063a5bf2b1efb64e',
  inquiry_summary: 'The customer wanted to know how to temporarily disable auto deposits',
  is_engaged: true,
  is_escalated: false,
  is_test_user: false,
  language: 'en',
  last_agent_id: '619d95c0c063a5bf2b1efb7c',
  last_agent_name: 'Ada Lovelace',
  metavariables: { browser: 'chrome', language: 'en' },
  oauth_channel: 'sms',
  platform: 'chat',
  record_last_updated: {},
  variables: { account_number: '1234' },
}

const conversationExample: RawAdaConversation = {
  id: '5df263b7db5a7e6ea03fae9b',
  channel_id: '5df263b7db5a7e6ea03fae9b',
  end_user_id: '5df263b7db5a7e6ea03fae9b',
  status: 'active',
  created_at: '2020-09-20T00:00:00+00:00',
  updated_at: '2020-09-20T00:00:00+00:00',
  metadata: {
    pass: 'example_string_value',
    initial_url: 'https://example.com',
    locale: 'en-CA',
    confidence: 0.95,
  },
}

describe('ada-cx transformExportConversation', () => {
  it('parses the documented example against TicketSchema', () => {
    const out = TicketSchema.parse(transformExportConversation(exportExample))
    expect(out.id).toBe('5d8a7d080afd19b55945c8ab')
    expect(out.externalId).toBe('5d8a7d080afd19b55945c8ab')
    expect(out.requesterId).toBe('619d95c0c063a5bf2b1efb64e')
    expect(out.assigneeId).toBe('619d95c0c063a5bf2b1efb7c')
    expect(out.channel).toBe('chat')
    expect(out.platform).toBe('ada-cx')
  })

  it('reads the documented UTC timestamps without a zone as UTC', () => {
    const out = transformExportConversation(exportExample)
    expect(out.createdAt).toBe('2019-10-31T14:28:02.000Z')
    expect(out.updatedAt).toBe('2019-10-31T14:29:02.000Z')
  })

  it('reads them as UTC on a host outside UTC too (vitest pins TZ=UTC, which hides the bug)', () => {
    const saved = process.env['TZ']
    process.env['TZ'] = 'America/New_York'
    try {
      expect(new Date('2019-10-31T14:28:02').toISOString()).not.toBe('2019-10-31T14:28:02.000Z')
      expect(transformExportConversation(exportExample).createdAt).toBe('2019-10-31T14:28:02.000Z')
    } finally {
      process.env['TZ'] = saved
    }
  })

  it('surfaces neither the AI-generated inquiry summary nor an unscaled csat', () => {
    const out = transformExportConversation(exportExample)
    expect(out.subject).toBe('')
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('reports status unknown: the export documents no status', () => {
    expect(transformExportConversation(exportExample).status).toBe('unknown')
  })

  it('maps only the documented platform value "chat"; anything else is unknown', () => {
    expect(transformExportConversation({ ...exportExample, platform: 'voice' }).channel).toBe(
      'unknown',
    )
  })

  it('keeps a null end_user_id empty rather than borrowing chatter_id', () => {
    const out = TicketSchema.parse(
      transformExportConversation({ ...exportExample, end_user_id: null }),
    )
    expect(out.requesterId).toBe('')
  })

  it('throws on a record with no _id or no date_created', () => {
    expect(() => transformExportConversation({ ...exportExample, _id: undefined })).toThrow(/_id/)
    expect(() =>
      transformExportConversation({ ...exportExample, date_created: undefined }),
    ).toThrow(/date_created/)
  })
})

describe('ada-cx transformConversation', () => {
  it('parses the documented example against TicketSchema', () => {
    const out = TicketSchema.parse(transformConversation(conversationExample))
    expect(out.id).toBe('5df263b7db5a7e6ea03fae9b')
    expect(out.status).toBe('open')
    expect(out.requesterId).toBe('5df263b7db5a7e6ea03fae9b')
    expect(out.createdAt).toBe('2020-09-20T00:00:00.000Z')
    expect(out.metadata['channelId']).toBe('5df263b7db5a7e6ea03fae9b')
  })

  it('maps the documented status values', () => {
    expect(transformConversation({ ...conversationExample, status: 'ended' }).status).toBe('closed')
    expect(transformConversation({ ...conversationExample, status: 'paused' }).status).toBe(
      'unknown',
    )
  })

  it('throws on a record with no id', () => {
    expect(() => transformConversation({ ...conversationExample, id: undefined })).toThrow(/id/)
  })
})
