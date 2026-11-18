/**
 * SAML integration test — exercises the real @node-saml/node-saml validation
 * path (signature, audience, recipient, NotOnOrAfter) against SAML Responses we
 * sign in-process with xml-crypto + a self-signed cert. No Docker/IdP.
 *
 * Both the assertion and the response are signed (our provider requires both),
 * matching a real IdP. Negative cases cover signature tampering, audience
 * mismatch, and assertion replay.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { SignedXml } from 'xml-crypto'
import selfsigned from 'selfsigned'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore, type IdentityProviderRow } from '../../src/core/db/identity-store'
import { completeSamlLogin, beginSamlLogin, samlMetadata } from '../../src/core/auth/idp/saml-provider'
import { inflateRawSync } from 'zlib'

const SP_ENTITY = 'urn:opensteward:sp:test'
const ACS = 'https://sp.example.com/api/sso/corp-saml/acs'
const IDP_ISSUER = 'urn:idp:test'

const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#'
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256'

let pems: { private: string; cert: string }

beforeAll(async () => {
  // selfsigned v5 generate() is async, returns { private, public, cert }.
  pems = (await (selfsigned as unknown as {
    generate: (a: unknown[], o: unknown) => Promise<{ private: string; cert: string }>
  }).generate([{ name: 'commonName', value: 'test-idp' }], { keySize: 2048, algorithm: 'sha256', days: 3650 }))
})

function signElement(xml: string, elementLocalName: string, id: string): string {
  const sig = new SignedXml({
    privateKey: pems.private,
    publicCert: pems.cert,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: EXC_C14N,
  })
  sig.addReference({
    xpath: `//*[local-name(.)='${elementLocalName}']`,
    transforms: [ENVELOPED, EXC_C14N],
    digestAlgorithm: SHA256,
    uri: `#${id}`,
  })
  // Place the signature right after the element's <Issuer> (SAML schema order).
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Issuer']", action: 'after' } })
  return sig.getSignedXml()
}

interface ResponseOpts {
  audience?: string
  recipient?: string
  nameId?: string
  email?: string
  groups?: string[]
  notOnOrAfter?: string
}

function buildSignedResponse(opts: ResponseOpts = {}): { xml: string; responseId: string } {
  const assertionId = `_a${randomUUID().replace(/-/g, '')}`
  const responseId = `_r${randomUUID().replace(/-/g, '')}`
  const now = Date.now()
  const issueInstant = new Date(now).toISOString()
  const notBefore = new Date(now - 60_000).toISOString()
  const notOnOrAfter = opts.notOnOrAfter ?? new Date(now + 5 * 60_000).toISOString()
  const audience = opts.audience ?? SP_ENTITY
  const recipient = opts.recipient ?? ACS
  const nameId = opts.nameId ?? 'user@corp.example.com'
  const email = opts.email ?? 'user@corp.example.com'
  const groups = opts.groups ?? ['Admins', 'Staff']

  const groupValues = groups.map((g) => `<saml:AttributeValue>${g}</saml:AttributeValue>`).join('')

  const assertion =
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0" IssueInstant="${issueInstant}">` +
    `<saml:Issuer>${IDP_ISSUER}</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData Recipient="${recipient}" NotOnOrAfter="${notOnOrAfter}"/>` +
    `</saml:SubjectConfirmation></saml:Subject>` +
    `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">` +
    `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="${assertionId}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `<saml:AttributeStatement>` +
    `<saml:Attribute Name="email"><saml:AttributeValue>${email}</saml:AttributeValue></saml:Attribute>` +
    `<saml:Attribute Name="groups">${groupValues}</saml:Attribute>` +
    `</saml:AttributeStatement>` +
    `</saml:Assertion>`

  const signedAssertion = signElement(assertion, 'Assertion', assertionId)

  const response =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${responseId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${recipient}">` +
    `<saml:Issuer>${IDP_ISSUER}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `${signedAssertion}` +
    `</samlp:Response>`

  const signedResponse = signElement(response, 'Response', responseId)
  return { xml: signedResponse, responseId }
}

function b64(xml: string): string {
  return Buffer.from(xml, 'utf8').toString('base64')
}

describe('SAML integration (in-process signed responses)', () => {
  let admin: AdminStore
  let store: IdentityStore
  let provider: IdentityProviderRow

  async function open() {
    const handle = await openDb({ sqlitePath: ':memory:' })
    admin = await AdminStore.create(handle)
    store = await IdentityStore.create(handle, 'test-store-secret-ffffffffffffffffffffffffffff')
    provider = await store.createProvider({
      name: 'Corp SAML',
      slug: 'corp-saml',
      protocol: 'saml',
      enabled: true,
      defaultRole: 'viewer',
      config: {
        entryPoint: 'https://idp.example.com/sso',
        idpIssuer: IDP_ISSUER,
        spEntityId: SP_ENTITY,
        groupsAttribute: 'groups',
        emailAttribute: 'email',
      },
      secret: { idpCert: pems.cert },
    })
  }
  afterEach(async () => {
    await admin?.close()
  })

  it('validates a correctly signed response and extracts identity + groups', async () => {
    await open()
    const { xml } = buildSignedResponse()
    const identity = await completeSamlLogin(store, provider, pems.cert, ACS, b64(xml))
    expect(identity.externalId).toBe('user@corp.example.com')
    expect(identity.email).toBe('user@corp.example.com')
    expect(identity.attributes.groups).toEqual(['Admins', 'Staff'])
  })

  it('rejects a tampered assertion (broken signature)', async () => {
    await open()
    const { xml } = buildSignedResponse({ email: 'user@corp.example.com' })
    const tampered = xml.replace('user@corp.example.com', 'attacker@evil.com')
    await expect(completeSamlLogin(store, provider, pems.cert, ACS, b64(tampered))).rejects.toBeTruthy()
  })

  it('rejects an audience mismatch', async () => {
    await open()
    const { xml } = buildSignedResponse({ audience: 'urn:some:other:sp' })
    await expect(completeSamlLogin(store, provider, pems.cert, ACS, b64(xml))).rejects.toBeTruthy()
  })

  it('rejects a replayed assertion', async () => {
    await open()
    const { xml } = buildSignedResponse()
    const encoded = b64(xml)
    await completeSamlLogin(store, provider, pems.cert, ACS, encoded)
    await expect(completeSamlLogin(store, provider, pems.cert, ACS, encoded)).rejects.toThrow(/replay/i)
  })

  /** Decode a redirect-binding AuthnRequest URL back to its XML. The HTTP-Redirect
   *  binding DEFLATE-compresses (raw, no zlib header) then base64-encodes. */
  function authnRequestXml(url: string): string {
    const req = new URL(url).searchParams.get('SAMLRequest')!
    return inflateRawSync(Buffer.from(req, 'base64')).toString('utf8')
  }

  it('signs the AuthnRequest when an SP private key is configured', async () => {
    await open()
    const signedUrl = await beginSamlLogin(store, provider, pems.cert, ACS, 'relay', {
      spPrivateKey: pems.private,
      spCertificate: pems.cert,
    })
    // Redirect binding signs via the `Signature`/`SigAlg` query params.
    const params = new URL(signedUrl).searchParams
    expect(params.get('Signature')).toBeTruthy()
    expect(params.get('SigAlg')).toContain('rsa-sha256')

    // Without a key the request is unsigned (back-compat).
    const unsignedUrl = await beginSamlLogin(store, provider, pems.cert, ACS, 'relay')
    expect(new URL(unsignedUrl).searchParams.get('Signature')).toBeNull()
    // Sanity: both are valid AuthnRequests.
    expect(authnRequestXml(unsignedUrl)).toContain('AuthnRequest')
  })

  it('advertises the SP certificate in metadata when a signing key + cert are configured', async () => {
    await open()
    const withCert = samlMetadata(provider, ACS, { spPrivateKey: pems.private, spCertificate: pems.cert })
    expect(withCert).toMatch(/X509Certificate/)
    expect(withCert).toMatch(/KeyDescriptor/)
    expect(withCert).toContain('AuthnRequestsSigned="true"')
    const withoutCert = samlMetadata(provider, ACS)
    expect(withoutCert).not.toMatch(/X509Certificate/)
  })
})
