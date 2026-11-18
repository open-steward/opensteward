import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawFoxitESignParty,
} from '../../../../../../../src/verticals/docsign/adapters/foxit-esign/transform/signer'
import type { RawFoxitESignFolderHistoryEntry } from '../../../../../../../src/verticals/docsign/adapters/foxit-esign/transform/audit-trail-entry'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { MYFOLDER_FOLDER, MYFOLDER_HISTORY } from './fixtures'

const parties = MYFOLDER_FOLDER.folderRecipientParties as RawFoxitESignParty[]
const history = MYFOLDER_HISTORY as RawFoxitESignFolderHistoryEntry[]
const john = parties[0]!
const jane = parties[1]!

describe('foxit-esign transformSigner (folderRecipientParties of GET /folders/myfolder)', () => {
  it('maps the documented party example onto the canonical schema', () => {
    const out = SignerSchema.parse(transformSigner(john, '86377', history))
    expect(out.id).toBe('86377:1')
    expect(out.externalId).toBe('1')
    expect(out.envelopeId).toBe('86377')
    expect(out.email).toBe('johndoe@esigngenie.com')
    expect(out.name).toBe('John Doe')
    expect(out.role).toBe('signer')
    expect(out.routingOrder).toBe(1)
    expect(out.platform).toBe('foxit-esign')
    expect(out.metadata).toEqual({
      contractPermissions: 'FILL_FIELDS_AND_SIGN',
      partySequence: '1',
      sharingMode: 'email',
      securityMode: 'none',
    })
  })

  it('a party whose history has a Signed row by that party is signed, at dateChanged', () => {
    const out = SignerSchema.parse(transformSigner(jane, '86377', history))
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe(new Date(1564738091000).toISOString())
    // "InviteAccepted" by party 28 at 1564738073000.
    expect(out.deliveredAt).toBe(new Date(1564738073000).toISOString())
    expect(out.routingOrder).toBe(2)
  })

  it('a party with no Signed or InviteAccepted row of its own has an unknown status', () => {
    const out = SignerSchema.parse(transformSigner(john, '86377', history))
    expect(out.status).toBe('unknown')
    expect(out.signedAt).toBeUndefined()
    expect(out.deliveredAt).toBeUndefined()
  })

  it('an InviteAccepted row without a Signed row is delivered', () => {
    const accepted = history.filter((h) => h.action !== 'Signed')
    const out = SignerSchema.parse(transformSigner(jane, '86377', accepted))
    expect(out.status).toBe('delivered')
    expect(out.signedAt).toBeUndefined()
  })

  it('without any history the status is unknown, never a guessed default', () => {
    expect(SignerSchema.parse(transformSigner(jane, '86377', [])).status).toBe('unknown')
  })

  it.each([
    ['FILL_FIELDS_AND_SIGN', 'signer'],
    ['SIGN_ONLY', 'signer'],
    ['FILL_FIELDS_ONLY', 'unknown'],
    ['VIEW_ONLY', 'unknown'],
    ['PARTY_ASSIGNER', 'unknown'],
  ])('documented permission %s maps to role %s', (permission, role) => {
    const out = SignerSchema.parse(
      transformSigner({ ...john, contractPermissions: permission }, '86377', []),
    )
    expect(out.role).toBe(role)
  })

  it('signedAt is the last Signed row and deliveredAt the first InviteAccepted row', () => {
    const base = history.find((h) => h.action === 'Signed')!
    const rows: RawFoxitESignFolderHistoryEntry[] = [
      { ...base, action: 'InviteAccepted', dateChanged: 1000 },
      { ...base, action: 'InviteAccepted', dateChanged: 2000 },
      { ...base, action: 'Signed', dateChanged: 3000 },
      { ...base, action: 'Signed', dateChanged: 4000 },
    ]
    const out = SignerSchema.parse(transformSigner(jane, '86377', rows))
    expect(out.deliveredAt).toBe(new Date(1000).toISOString())
    expect(out.signedAt).toBe(new Date(4000).toISOString())
  })

  it('an undocumented permission maps to role unknown', () => {
    const out = SignerSchema.parse(
      transformSigner({ ...john, contractPermissions: 'SOMETHING_ELSE' }, '86377', []),
    )
    expect(out.role).toBe('unknown')
  })

  it('omits an empty emailId instead of emitting an empty string', () => {
    const out = SignerSchema.parse(
      transformSigner({ ...john, partyDetails: { ...john.partyDetails, emailId: '' } }, 'e', []),
    )
    expect(out.email).toBeUndefined()
  })

  it('throws when the party has no partyId', () => {
    const { partyId: _p, ...noId } = john
    expect(() => transformSigner(noId as RawFoxitESignParty, 'e', [])).toThrow(/partyId/)
  })
})
