/**
 * The Connect thank-you page greeted the customer with the local part of their
 * email address:
 *
 *   "All set, jane.q.doe."
 *
 * `email.split('@')[0]` is not a name. It reads as a username, it exposes the
 * shape of the address rather than reading as a greeting, and for any
 * firstname.middle.lastname address it is actively worse than showing nothing.
 *
 * A name is available in two places, from the two ways an end-user gets
 * created: `pii.firstName` when the customer was created through the admin or
 * API with PII, and `displayName` when they self-registered on the Connect page
 * itself — that flow (connect-router's POST /connect/:token/customer) collects
 * only email and displayName, so displayName is the ONLY name most
 * connect-originated customers have.
 *
 * Order is therefore firstName, then the first word of displayName, then the
 * email in full as a last resort — full, because the mangled local part is the
 * bug being fixed.
 */
import { describe, it, expect } from 'vitest'
import { greetingName, thankYouHtml } from '../../src/control-plane/connect-html'
import type { HostBranding } from '../../src/control-plane/host-info'

function host(): HostBranding {
  return {
    name: 'Acme',
    logoDataUrl: null,
    primaryColor: null,
    secondaryColor: null,
    fontFamily: null,
    fontDataUrl: null,
    fontUrl: null,
    faviconDataUrl: null,
    hideAttribution: false,
    supportEmail: null,
    privacyPolicyUrl: null,
    termsOfServiceUrl: null,
    baseUrl: null,
  }
}

describe('greetingName', () => {
  it('prefers the PII first name', () => {
    expect(
      greetingName({
        firstName: 'Jane',
        displayName: 'Jane Doe',
        email: 'jane.q.doe@example.com',
      }),
    ).toBe('Jane')
  })

  it('falls back to the first word of displayName', () => {
    expect(
      greetingName({
        firstName: null,
        displayName: 'Jane Doe',
        email: 'jane.q.doe@example.com',
      }),
    ).toBe('Jane')
  })

  it('handles a single-word displayName', () => {
    expect(greetingName({ displayName: 'Jane', email: 'a@b.com' })).toBe('Jane')
  })

  it('collapses leading whitespace in displayName rather than returning empty', () => {
    expect(greetingName({ displayName: '   Jane   Doe  ', email: 'a@b.com' })).toBe('Jane')
  })

  it('falls back to the FULL email, never the local part', () => {
    const name = greetingName({
      firstName: null,
      displayName: null,
      email: 'jane.q.doe@example.com',
    })
    expect(name).toBe('jane.q.doe@example.com')
    expect(name).not.toBe('jane.q.doe')
  })

  it('treats empty and whitespace-only fields as absent', () => {
    expect(greetingName({ firstName: '  ', displayName: '', email: 'a@b.com' })).toBe('a@b.com')
  })

  it('returns null when there is nothing to greet with', () => {
    expect(greetingName({ firstName: null, displayName: null, email: null })).toBeNull()
    expect(greetingName({})).toBeNull()
  })
})

describe('thankYouHtml greeting', () => {
  const base = {
    host: host(),
    platform: 'fortnox',
    vertical: 'accounting',
    connectionId: 'conn_1234567890',
    consumedAtISO: '2026-08-31T12:00:00.000Z',
  }

  it('greets by first name', () => {
    const html = thankYouHtml({
      ...base,
      customerFirstName: 'Jane',
      customerDisplayName: 'Jane Doe',
      customerEmail: 'jane.q.doe@example.com',
    })
    expect(html).toContain('All set, Jane.')
  })

  it('greets by the first word of displayName when there is no first name', () => {
    const html = thankYouHtml({
      ...base,
      customerFirstName: null,
      customerDisplayName: 'Jane Doe',
      customerEmail: 'jane.q.doe@example.com',
    })
    expect(html).toContain('All set, Jane.')
  })

  it('never renders the bare email local part', () => {
    const html = thankYouHtml({
      ...base,
      customerFirstName: null,
      customerDisplayName: null,
      customerEmail: 'jane.q.doe@example.com',
    })
    expect(html).not.toContain('All set, jane.q.doe.')
    expect(html).toContain('jane.q.doe@example.com')
  })

  it('renders a plain "All set." when the customer is unknown', () => {
    const html = thankYouHtml({
      ...base,
      customerFirstName: null,
      customerDisplayName: null,
      customerEmail: null,
    })
    expect(html).toContain('All set.')
    expect(html).not.toContain('All set,')
  })

  it('escapes the name — it reaches the page from customer-supplied input', () => {
    const html = thankYouHtml({
      ...base,
      customerFirstName: '<img src=x onerror=alert(1)>',
      customerDisplayName: null,
      customerEmail: null,
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
