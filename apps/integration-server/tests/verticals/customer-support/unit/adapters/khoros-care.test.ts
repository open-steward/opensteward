/**
 * Khoros Care transforms, fed the documented example responses
 * (see khoros-care/fixtures.ts) and checked against the canonical schemas.
 */
import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/khoros-care/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/khoros-care/transform/message'
import {
  personHandles,
  transformContact,
} from '../../../../../src/verticals/customer-support/adapters/khoros-care/transform/contact'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/khoros-care/transform/tag'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/khoros-care/transform/team'
import { TicketSchema } from '../../../../../src/verticals/customer-support/schema/ticket'
import { MessageSchema } from '../../../../../src/verticals/customer-support/schema/message'
import { ContactSchema } from '../../../../../src/verticals/customer-support/schema/contact'
import { TagSchema } from '../../../../../src/verticals/customer-support/schema/tag'
import { TeamSchema } from '../../../../../src/verticals/customer-support/schema/team'
import {
  ACTIVE_WORK_QUEUES,
  AUTHOR_BY_ID,
  AUTHORS_PAGE,
  FACEBOOK_CONVERSATION,
  INSTAGRAM_CONVERSATION,
  TAGS,
} from './khoros-care/fixtures'

const CONV = FACEBOOK_CONVERSATION.data[0]!

describe('transformTicket (conversation detail)', () => {
  it('maps the documented Facebook conversation', () => {
    const t = TicketSchema.parse(transformTicket(CONV))
    expect(t).toMatchObject({
      id: '90853b54-3d5e-4964-aec0-example',
      externalId: '90853b54-3d5e-4964-aec0-example',
      number: '758108',
      status: 'in_progress',
      channel: 'social',
      requesterId: '61454101-351f-424f-87e4-087b12b76ad9',
      assigneeId: '01e638e1-4eb1-4ebe-9290-example',
      teamId: '19',
      tagIds: ['361'],
      createdAt: new Date(1594150259084).toISOString(),
      platform: 'khoros-care',
    })
    expect(t.priority).toBeUndefined()
    expect(t.metadata).toMatchObject({ status: 'INPROGRESS', network: 'facebook', priority: '2' })
  })

  it('keeps an undocumented state as unknown, verbatim in metadata', () => {
    const t = TicketSchema.parse(transformTicket({ ...CONV, status: 'RESPONDED' }))
    expect(t.status).toBe('unknown')
    expect(t.metadata['status']).toBe('RESPONDED')
  })

  it('throws instead of inventing an id, requester or creation time', () => {
    expect(() => transformTicket({ ...CONV, lswUuid: undefined })).toThrow(/lswUuid/)
    expect(() => transformTicket({ ...CONV, primaryMessage: undefined })).toThrow(/author/)
    expect(() => transformTicket({ ...CONV, createDate: undefined })).toThrow(/createDate/)
  })
})

describe('transformTicket (Instagram conversation)', () => {
  const IG = INSTAGRAM_CONVERSATION.data[0]!

  it('maps the documented Instagram conversation to the social channel', () => {
    const t = TicketSchema.parse(transformTicket(IG))
    expect(t).toMatchObject({
      id: 'example-ae4b-4ad8-af78-33a5533dcac7',
      number: '774752',
      status: 'unknown',
      channel: 'social',
      requesterId: '039205f6-b910-4a0e-b168-4caad30fff66',
      teamId: '191',
      tagIds: ['45', '363'],
    })
    expect(t.metadata).toMatchObject({ status: 'RESPONDED', network: 'instagram' })
  })

  it('maps a network no conversation example shows to unknown', () => {
    const t = TicketSchema.parse(
      transformTicket({ ...IG, primaryMessage: { ...IG.primaryMessage, network: 'twitter' } }),
    )
    expect(t.channel).toBe('unknown')
  })

  it('keys a message by its Care lswUuid, not its network id', () => {
    const m = MessageSchema.parse(transformMessage(IG.messages[0]!, IG.lswUuid))
    expect(m.id).toBe('example-e767-4a42-8ad1-9f8c2a426771')
    expect(m.externalId).toBe('example-e767-4a42-8ad1-9f8c2a426771')
    expect(m.metadata['networkId']).toBe('17946188077306953')
    expect(m.attachmentCount).toBe(1)
  })
})

describe('transformMessage (conversation messages)', () => {
  it('maps a customer-side post: author handle, unknown author type', () => {
    const m = MessageSchema.parse(transformMessage(CONV.messages[0]!, CONV.lswUuid))
    expect(m).toMatchObject({
      id: '332e0364-0b7c-4691-bdd9-470f55cb5ff4',
      ticketId: CONV.lswUuid,
      authorId: '61454101-351f-424f-87e4-087b12b76ad9',
      authorType: 'unknown',
      body: 'This is a message.',
      type: 'public',
      createdAt: new Date(1594150257000).toISOString(),
    })
    expect(m.attachmentCount).toBeUndefined()
  })

  it('maps an agent response to the responding agent', () => {
    const m = MessageSchema.parse(transformMessage(CONV.messages[1]!, CONV.lswUuid))
    expect(m).toMatchObject({
      id: 'b1b76e55-8536-4c3d-822d-2feffb21c530',
      authorId: '01e638e1-4eb1-4ebe-9290-4b0304f44a55',
      authorType: 'user',
      body: 'Hello! This is a response.',
    })
    expect(m.metadata).toMatchObject({
      authorLswUuid: 'cf23beb2-0632-4250-b52b-7b3a1ce39e1f',
      inResponseToDocLswUuid: '332e0364-0b7c-4691-bdd9-470f55cb5ff4',
    })
  })

  it('counts documented media as attachments', () => {
    const m = transformMessage(
      { ...CONV.messages[0]!, media: [{ type: 'IMAGE', url: 'https://x' }] },
      't',
    )
    expect(m.attachmentCount).toBe(1)
  })

  it('throws on a message with no id or publish date', () => {
    expect(() => transformMessage({ ...CONV.messages[0]!, lswUuid: undefined }, 't')).toThrow(
      /lswUuid/,
    )
    expect(() => transformMessage({ ...CONV.messages[0]!, publishDate: undefined }, 't')).toThrow(
      /publishDate/,
    )
  })
})

describe('transformContact (author handles)', () => {
  it('maps a handle of the documented authors page, keyed by its lswUuid', () => {
    const person = AUTHORS_PAGE.data.personList[0]!
    const [{ network, handle }] = personHandles(person)
    const c = ContactSchema.parse(transformContact(handle, network, person))
    expect(c).toMatchObject({
      id: 'f169ce75-82c8-4f5b-8e9b-b99ea64fbdaa',
      externalId: 'f169ce75-82c8-4f5b-8e9b-b99ea64fbdaa',
      name: 'LIA_auto_c90d75c1_9f26',
      platform: 'khoros-care',
    })
    expect(c.email).toBeUndefined()
    expect(c.metadata).toMatchObject({
      network: 'lithium',
      personId: '46193948-5a3d-4836-bea8-e7a5070ab00d',
    })
    // ContactSchema refuses social handles: no network user id or screen name.
    expect(c.metadata['networkId']).toBeUndefined()
    expect(c.metadata['screenName']).toBeUndefined()
  })

  it('lists every handle of a person, including a scrubbed one without a name', () => {
    const person = AUTHOR_BY_ID.data[0]!
    const rows = personHandles(person).map(({ network, handle }) =>
      ContactSchema.parse(transformContact(handle, network, person)),
    )
    expect(rows.map((r) => [r.id, r.name, r.metadata['network']])).toEqual([
      ['edce6d32-ee19-4740-87b8-a9b69afd677d', 'Anusuya_user', 'external'],
      ['b20dc99d-144a-4942-92a9-215e3f2ff864', '', 'twitter'],
    ])
  })

  it('throws on a handle with no lswUuid', () => {
    expect(() => transformContact({ name: 'x' }, 'lithium', {})).toThrow(/lswUuid/)
  })
})

describe('transformTag', () => {
  it('keys the documented tag by tagId', () => {
    const t = TagSchema.parse(transformTag(TAGS.data[0]!))
    expect(t).toMatchObject({ id: '2', externalId: '2', name: 'Laptops', color: 'PURPLE' })
    expect(t.metadata).toMatchObject({ hierarchy: 'Computers > Laptops', tagState: 'ENABLED' })
  })

  it('throws on a tag with no tagId', () => {
    expect(() => transformTag({ name: 'Laptops' })).toThrow(/tagId/)
  })
})

describe('transformTeam (active work queues)', () => {
  it('keys the documented work queue by its integer id', () => {
    const t = TeamSchema.parse(transformTeam(ACTIVE_WORK_QUEUES.data[1]!))
    expect(t).toMatchObject({ id: '13194', externalId: '13194', name: 'Twitter Mentions' })
    expect(t.metadata).toMatchObject({
      uuid: '1252d4bd-be75-4b65-8762-c44f515e8317',
      description: 'API Work Queue from OpenConversationReport',
      archived: 'false',
    })
  })

  it('throws on a work queue with no id', () => {
    expect(() => transformTeam({ name: 'x' })).toThrow(/work queue id/)
  })
})
