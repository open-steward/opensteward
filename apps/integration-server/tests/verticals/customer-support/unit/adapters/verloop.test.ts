import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/verloop/transform/ticket'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/verloop/transform/macro'
import { VerloopAdapter } from '../../../../../src/verticals/customer-support/adapters/verloop/index'

// ── transformTicket ──────────────────────────────────────────────────────────

describe('Verloop transformTicket', () => {
  it('sets platform=verloop', () => {
    const t = transformTicket({})
    expect(t.platform).toBe('verloop')
  })

  it('maps STATUS_PUBLISHED to status=open', () => {
    const t = transformTicket({ Status: 'STATUS_PUBLISHED' })
    expect(t.status).toBe('open')
  })

  it('maps bare ACTIVE to status=open', () => {
    const t = transformTicket({ Status: 'ACTIVE' })
    expect(t.status).toBe('open')
  })

  it('maps STATUS_PAUSED to status=on_hold', () => {
    const t = transformTicket({ Status: 'STATUS_PAUSED' })
    expect(t.status).toBe('on_hold')
  })

  it('maps STATUS_COMPLETED to status=resolved', () => {
    const t = transformTicket({ Status: 'STATUS_COMPLETED' })
    expect(t.status).toBe('resolved')
  })

  it('maps STATUS_SENT to status=resolved', () => {
    const t = transformTicket({ Status: 'STATUS_SENT' })
    expect(t.status).toBe('resolved')
  })

  it('maps STATUS_DELIVERED to status=resolved', () => {
    const t = transformTicket({ Status: 'STATUS_DELIVERED' })
    expect(t.status).toBe('resolved')
  })

  it('maps STATUS_FAILED to status=closed', () => {
    const t = transformTicket({ Status: 'STATUS_FAILED' })
    expect(t.status).toBe('closed')
  })

  it('maps STATUS_EXPIRED to status=closed', () => {
    const t = transformTicket({ Status: 'STATUS_EXPIRED' })
    expect(t.status).toBe('closed')
  })

  it('maps STATUS_DRAFT to status=pending', () => {
    const t = transformTicket({ Status: 'STATUS_DRAFT' })
    expect(t.status).toBe('pending')
  })

  it('maps unknown status to pending (default)', () => {
    const t = transformTicket({ Status: 'WHATEVER_UNKNOWN' })
    expect(t.status).toBe('pending')
  })

  it('sets resolvedAt only when status=resolved, NOT when status=closed', () => {
    const meta = { Id: 'c1', CreatedAt: 1700000000, UpdatedAt: 1700003600 }
    const resolved = transformTicket({ Meta: meta, Status: 'STATUS_COMPLETED' })
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedAt).toBeDefined()

    const closed = transformTicket({ Meta: meta, Status: 'STATUS_FAILED' })
    expect(closed.status).toBe('closed')
    // resolvedAt must NOT be set for closed campaigns
    expect(closed.resolvedAt).toBeUndefined()
  })

  it('does NOT set closedAt (Verloop API has no distinct closed_at field)', () => {
    const meta = { Id: 'c2', CreatedAt: 1700000000, UpdatedAt: 1700003600 }
    const t = transformTicket({ Meta: meta, Status: 'STATUS_FAILED' })
    expect(t.closedAt).toBeUndefined()
  })

  it('maps WHATSAPP channel to chat', () => {
    const t = transformTicket({ Channel: 'WHATSAPP' })
    expect(t.channel).toBe('chat')
  })

  it('maps VOICE channel to voice', () => {
    const t = transformTicket({ Channel: 'VOICE' })
    expect(t.channel).toBe('voice')
  })

  it('maps SMS channel to sms', () => {
    const t = transformTicket({ Channel: 'SMS' })
    expect(t.channel).toBe('sms')
  })

  it('maps unknown channel to other', () => {
    const t = transformTicket({ Channel: 'FOOBAR' })
    expect(t.channel).toBe('other')
  })

  it('extracts id from Meta.Id', () => {
    const t = transformTicket({ Meta: { Id: 'camp-42' } })
    expect(t.id).toBe('camp-42')
    expect(t.externalId).toBe('camp-42')
  })

  it('converts Unix-second timestamps to ISO-8601', () => {
    const t = transformTicket({
      Meta: { Id: 'c3', CreatedAt: 1700000000, UpdatedAt: 1700003600 },
    })
    expect(t.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
    expect(t.updatedAt).toBe(new Date(1700003600 * 1000).toISOString())
  })

  it('stores metadata fields as strings', () => {
    const t = transformTicket({
      TriggerType: 'MANUAL',
      RecipeId: 'rec-7',
      PhoneIntegrationId: 'ph-3',
      Status: 'STATUS_PUBLISHED',
    })
    expect(t.metadata['triggerType']).toBe('MANUAL')
    expect(t.metadata['recipeId']).toBe('rec-7')
    expect(t.metadata['phoneIntegrationId']).toBe('ph-3')
    expect(t.metadata['rawStatus']).toBe('STATUS_PUBLISHED')
  })

  it('does not throw for entirely empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

// ── transformMacro ───────────────────────────────────────────────────────────

describe('Verloop transformMacro', () => {
  it('sets platform=verloop', () => {
    const m = transformMacro({})
    expect(m.platform).toBe('verloop')
  })

  it('uses Meta.Id as id', () => {
    const m = transformMacro({ Meta: { Id: 'tpl-1' }, Name: 'Hello' })
    expect(m.id).toBe('tpl-1')
    expect(m.externalId).toBe('tpl-1')
  })

  it('falls back to Name when Meta.Id is absent', () => {
    const m = transformMacro({ Name: 'OTP Reminder' })
    expect(m.id).toBe('OTP Reminder')
  })

  it('uses Body as macro body when present', () => {
    const m = transformMacro({ Body: 'Hi {{1}}', Name: 'Greeting' })
    expect(m.body).toBe('Hi {{1}}')
  })

  it('builds body from Parameters when Body is absent', () => {
    const m = transformMacro({
      Name: 'Order Update',
      Parameters: [
        { Name: 'order_id', Type: 'TEXT' },
        { Name: 'status', Type: 'TEXT' },
      ],
    })
    expect(m.body).toContain('order_id')
    expect(m.body).toContain('status')
  })

  it('sets category from Category field', () => {
    const m = transformMacro({ Category: 'UTILITY', Name: 'Track Order' })
    expect(m.category).toBe('UTILITY')
  })

  it('stores language and status in metadata', () => {
    const m = transformMacro({ Language: 'en', Status: 'APPROVED', Name: 'Hi' })
    expect(m.metadata['language']).toBe('en')
    expect(m.metadata['status']).toBe('APPROVED')
  })

  it('does not throw for entirely empty input', () => {
    expect(() => transformMacro({})).not.toThrow()
  })
})

// ── VerloopAdapter ───────────────────────────────────────────────────────────

describe('VerloopAdapter', () => {
  it('has platform=verloop', () => {
    const adapter = new VerloopAdapter()
    expect(adapter.platform).toBe('verloop')
  })

  it('does NOT expose parseWebhookEvents (no documented signing scheme)', () => {
    const adapter = new VerloopAdapter()
    expect('parseWebhookEvents' in adapter).toBe(false)
  })

  it('credentialFields returns clientId and apiKey fields', () => {
    const adapter = new VerloopAdapter()
    const fields = adapter.credentialFields()
    const names = fields.map((f) => f.name)
    expect(names).toContain('clientId')
    expect(names).toContain('apiKey')
  })

  it('exchangeCode throws (Verloop uses static key auth)', async () => {
    const adapter = new VerloopAdapter()
    await expect(adapter.exchangeCode('code', 'https://x')).rejects.toThrow()
  })

  it('refreshCredentials returns credentials unchanged', async () => {
    const adapter = new VerloopAdapter()
    const creds = { accessToken: 'tok', extra: { clientId: 'acme' } }
    const result = await adapter.refreshCredentials(creds)
    expect(result).toEqual(creds)
  })
})
