/**
 * Adapter factories — lazy constructors keyed by platform slug. The
 * AdapterRegistry reads this map at boot to discover which docsign adapters
 * exist; AdapterSettingsStore decides which ones get instantiated.
 */
import type { AdapterFactory } from '@opensteward/shared'
import type { DocsignAdapter } from './interface'

// Major global platforms
import { DocuSignAdapter } from '../adapters/docusign'
import { DropboxSignAdapter } from '../adapters/dropbox-sign'
import { AdobeAcrobatSignAdapter } from '../adapters/adobe-acrobat-sign'
import { PandaDocAdapter } from '../adapters/pandadoc'
import { SignNowAdapter } from '../adapters/signnow'
import { YousignAdapter } from '../adapters/yousign'

// Ecosystem + SMB
import { ZohoSignAdapter } from '../adapters/zoho-sign'
import { OneSpanSignAdapter } from '../adapters/onespan-sign'
import { SignWellAdapter } from '../adapters/signwell'
import { BoxSignAdapter } from '../adapters/box-sign'
import { GetAcceptAdapter } from '../adapters/getaccept'
import { FoxitESignAdapter } from '../adapters/foxit-esign'
import { NitroSignAdapter } from '../adapters/nitro-sign'
import { EversignAdapter } from '../adapters/eversign'
import { RightSignatureAdapter } from '../adapters/rightsignature'

// EU eIDAS qualified providers
import { SkribbleAdapter } from '../adapters/skribble'
import { SignaturitAdapter } from '../adapters/signaturit'
import { UniversignAdapter } from '../adapters/universign'
import { NamirialAdapter } from '../adapters/namirial'
import { SproofSignAdapter } from '../adapters/sproof-sign'

// LatAm + APAC
import { ClicksignAdapter } from '../adapters/clicksign'
import { D4SignAdapter } from '../adapters/d4sign'
import { DigioAdapter } from '../adapters/digio'
import { LealosAdapter } from '../adapters/lealos'
import { ModusignAdapter } from '../adapters/modusign'

// Global + regional (JP, BR, IN)
import { CloudSignAdapter } from '../adapters/cloudsign'
import { AutentiqueAdapter } from '../adapters/autentique'
import { EmSignerAdapter } from '../adapters/emsigner'
import { SignEasyAdapter } from '../adapters/signeasy'

// Nordic
import { ScriveAdapter } from '../adapters/scrive'
import { PenneoAdapter } from '../adapters/penneo'
import { VismaSignAdapter } from '../adapters/visma-sign'
import { OneflowAdapter } from '../adapters/oneflow'

// EU regional
import { DTrustSignMeAdapter } from '../adapters/d-trust-sign-me'
import { InfoCertAdapter } from '../adapters/infocert'
import { ATrustAdapter } from '../adapters/a-trust'
import { SwissSignAdapter } from '../adapters/swisssign'
import { LuxTrustAdapter } from '../adapters/luxtrust'
import { SignhostAdapter } from '../adapters/signhost'
import { AutentiAdapter } from '../adapters/autenti'
import { DokobitAdapter } from '../adapters/dokobit'

// Contract platforms + regional (MX, AU, FR)
import { ConcordAdapter } from '../adapters/concord'
import { DocSpringAdapter } from '../adapters/docspring'
import { MifielAdapter } from '../adapters/mifiel'
import { AnnatureAdapter } from '../adapters/annature'
import { LexPersonaAdapter } from '../adapters/lex-persona'

// Long tail (alphabetical)
import { DigiSignerAdapter } from '../adapters/digisigner'
import { EidEasyAdapter } from '../adapters/eideasy'
import { ActasignAdapter } from '../adapters/actasign'
import { AgiloftAdapter } from '../adapters/agiloft'
import { AnvilAdapter } from '../adapters/anvil'
import { AssentlyAdapter } from '../adapters/assently'
import { BlueinkAdapter } from '../adapters/blueink'
import { BlueinkBypassAdapter } from '../adapters/blueink-bypass'
import { BoldsignAdapter } from '../adapters/boldsign'
import { BreezedocAdapter } from '../adapters/breezedoc'
import { CertinalAdapter } from '../adapters/certinal'
import { ComsigntrustAdapter } from '../adapters/comsigntrust'
import { CongaSignAdapter } from '../adapters/conga-sign'
import { ContractworksAdapter } from '../adapters/contractworks'
import { CryptomathicSignerAdapter } from '../adapters/cryptomathic-signer'
import { DochubAdapter } from '../adapters/dochub'
import { DocumensoAdapter } from '../adapters/documenso'
import { DocusealAdapter } from '../adapters/docuseal'
import { ESignatureEuAdapter } from '../adapters/e-signature-eu'
import { EsignglobalAdapter } from '../adapters/esignglobal'
import { EsignlyAdapter } from '../adapters/esignly'
import { EvrotrustAdapter } from '../adapters/evrotrust'
import { FlowmonoAdapter } from '../adapters/flowmono'
import { FpSignAdapter } from '../adapters/fp-sign'
import { FptEcontractAdapter } from '../adapters/fpt-econtract'
import { GmoSignAdapter } from '../adapters/gmo-sign'
import { IcertisAdapter } from '../adapters/icertis'
import { InkitAdapter } from '../adapters/inkit'
import { InsignAdapter } from '../adapters/insign'
import { IroncladAdapter } from '../adapters/ironclad'
import { JotformSignAdapter } from '../adapters/jotform-sign'
import { JsignAdapter } from '../adapters/jsign'
import { JuroAdapter } from '../adapters/juro'
import { LeegalityAdapter } from '../adapters/leegality'
import { LegaldeskAdapter } from '../adapters/legaldesk'
import { LegalesignAdapter } from '../adapters/legalesign'
import { LibresignAdapter } from '../adapters/libresign'
import { LinksquaresAdapter } from '../adapters/linksquares'
import { LleidaNetAdapter } from '../adapters/lleida-net'
import { LuminSignAdapter } from '../adapters/lumin-sign'
import { MekariSignAdapter } from '../adapters/mekari-sign'
import { OdooSignAdapter } from '../adapters/odoo-sign'
import { OpensignAdapter } from '../adapters/opensign'
import { PdffillerAdapter } from '../adapters/pdffiller'
import { PrivyidAdapter } from '../adapters/privyid'
import { ProofAdapter } from '../adapters/proof'
import { SecuredSigningAdapter } from '../adapters/secured-signing'
import { SertifiAdapter } from '../adapters/sertifi'
import { SignPlusAdapter } from '../adapters/sign-plus'
import { SignableAdapter } from '../adapters/signable'
import { SignatureapiAdapter } from '../adapters/signatureapi'
import { SignaturelyAdapter } from '../adapters/signaturely'
import { SigndeskAdapter } from '../adapters/signdesk'
import { SignicatAdapter } from '../adapters/signicat'
import { SigniflowAdapter } from '../adapters/signiflow'
import { SignorityAdapter } from '../adapters/signority'
import { SignrequestAdapter } from '../adapters/signrequest'
import { SignzyAdapter } from '../adapters/signzy'
import { SirionAdapter } from '../adapters/sirion'
import { StepoverAdapter } from '../adapters/stepover'
import { SwisscomTrustServicesAdapter } from '../adapters/swisscom-trust-services'
import { TilakaAdapter } from '../adapters/tilaka'
import { ValidatedIdAdapter } from '../adapters/validated-id'
import { ViafirmaAdapter } from '../adapters/viafirma'
import { WebdoxAdapter } from '../adapters/webdox'
import { XodoSignAdapter } from '../adapters/xodo-sign'
import { YotiSignAdapter } from '../adapters/yoti-sign'
import { ZealidAdapter } from '../adapters/zealid'
import { ZefortAdapter } from '../adapters/zefort'
import { ZorrosignAdapter } from '../adapters/zorrosign'

function factory<T extends DocsignAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<DocsignAdapter>> = {
  // Major global platforms
  docusign: factory(DocuSignAdapter),
  'dropbox-sign': factory(DropboxSignAdapter),
  'adobe-acrobat-sign': factory(AdobeAcrobatSignAdapter),
  pandadoc: factory(PandaDocAdapter),
  signnow: factory(SignNowAdapter),
  yousign: factory(YousignAdapter),
  // Ecosystem + SMB
  'zoho-sign': factory(ZohoSignAdapter),
  'onespan-sign': factory(OneSpanSignAdapter),
  signwell: factory(SignWellAdapter),
  'box-sign': factory(BoxSignAdapter),
  getaccept: factory(GetAcceptAdapter),
  'foxit-esign': factory(FoxitESignAdapter),
  'nitro-sign': factory(NitroSignAdapter),
  eversign: factory(EversignAdapter),
  rightsignature: factory(RightSignatureAdapter),
  // EU eIDAS
  skribble: factory(SkribbleAdapter),
  signaturit: factory(SignaturitAdapter),
  universign: factory(UniversignAdapter),
  namirial: factory(NamirialAdapter),
  'sproof-sign': factory(SproofSignAdapter),
  // LatAm + APAC
  clicksign: factory(ClicksignAdapter),
  d4sign: factory(D4SignAdapter),
  digio: factory(DigioAdapter),
  lealos: factory(LealosAdapter),
  modusign: factory(ModusignAdapter),
  // Global + regional (JP, BR, IN)
  cloudsign: factory(CloudSignAdapter),
  autentique: factory(AutentiqueAdapter),
  emsigner: factory(EmSignerAdapter),
  signeasy: factory(SignEasyAdapter),
  // Nordic
  scrive: factory(ScriveAdapter),
  penneo: factory(PenneoAdapter),
  'visma-sign': factory(VismaSignAdapter),
  oneflow: factory(OneflowAdapter),
  // EU regional
  'd-trust-sign-me': factory(DTrustSignMeAdapter),
  infocert: factory(InfoCertAdapter),
  'a-trust': factory(ATrustAdapter),
  swisssign: factory(SwissSignAdapter),
  luxtrust: factory(LuxTrustAdapter),
  signhost: factory(SignhostAdapter),
  autenti: factory(AutentiAdapter),
  dokobit: factory(DokobitAdapter),
  // Contract platforms + regional (MX, AU, FR)
  concord: factory(ConcordAdapter),
  docspring: factory(DocSpringAdapter),
  mifiel: factory(MifielAdapter),
  annature: factory(AnnatureAdapter),
  'lex-persona': factory(LexPersonaAdapter),
  // Long tail (alphabetical)
  digisigner: factory(DigiSignerAdapter),
  eideasy: factory(EidEasyAdapter),
  actasign: factory(ActasignAdapter),
  agiloft: factory(AgiloftAdapter),
  anvil: factory(AnvilAdapter),
  assently: factory(AssentlyAdapter),
  blueink: factory(BlueinkAdapter),
  'blueink-bypass': factory(BlueinkBypassAdapter),
  boldsign: factory(BoldsignAdapter),
  breezedoc: factory(BreezedocAdapter),
  certinal: factory(CertinalAdapter),
  comsigntrust: factory(ComsigntrustAdapter),
  'conga-sign': factory(CongaSignAdapter),
  contractworks: factory(ContractworksAdapter),
  'cryptomathic-signer': factory(CryptomathicSignerAdapter),
  dochub: factory(DochubAdapter),
  documenso: factory(DocumensoAdapter),
  docuseal: factory(DocusealAdapter),
  'e-signature-eu': factory(ESignatureEuAdapter),
  esignglobal: factory(EsignglobalAdapter),
  esignly: factory(EsignlyAdapter),
  evrotrust: factory(EvrotrustAdapter),
  flowmono: factory(FlowmonoAdapter),
  'fp-sign': factory(FpSignAdapter),
  'fpt-econtract': factory(FptEcontractAdapter),
  'gmo-sign': factory(GmoSignAdapter),
  icertis: factory(IcertisAdapter),
  inkit: factory(InkitAdapter),
  insign: factory(InsignAdapter),
  ironclad: factory(IroncladAdapter),
  'jotform-sign': factory(JotformSignAdapter),
  jsign: factory(JsignAdapter),
  juro: factory(JuroAdapter),
  leegality: factory(LeegalityAdapter),
  legaldesk: factory(LegaldeskAdapter),
  legalesign: factory(LegalesignAdapter),
  libresign: factory(LibresignAdapter),
  linksquares: factory(LinksquaresAdapter),
  'lleida-net': factory(LleidaNetAdapter),
  'lumin-sign': factory(LuminSignAdapter),
  'mekari-sign': factory(MekariSignAdapter),
  'odoo-sign': factory(OdooSignAdapter),
  opensign: factory(OpensignAdapter),
  pdffiller: factory(PdffillerAdapter),
  privyid: factory(PrivyidAdapter),
  proof: factory(ProofAdapter),
  'secured-signing': factory(SecuredSigningAdapter),
  sertifi: factory(SertifiAdapter),
  'sign-plus': factory(SignPlusAdapter),
  signable: factory(SignableAdapter),
  signatureapi: factory(SignatureapiAdapter),
  signaturely: factory(SignaturelyAdapter),
  signdesk: factory(SigndeskAdapter),
  signicat: factory(SignicatAdapter),
  signiflow: factory(SigniflowAdapter),
  signority: factory(SignorityAdapter),
  signrequest: factory(SignrequestAdapter),
  signzy: factory(SignzyAdapter),
  sirion: factory(SirionAdapter),
  stepover: factory(StepoverAdapter),
  'swisscom-trust-services': factory(SwisscomTrustServicesAdapter),
  tilaka: factory(TilakaAdapter),
  'validated-id': factory(ValidatedIdAdapter),
  viafirma: factory(ViafirmaAdapter),
  webdox: factory(WebdoxAdapter),
  'xodo-sign': factory(XodoSignAdapter),
  'yoti-sign': factory(YotiSignAdapter),
  zealid: factory(ZealidAdapter),
  zefort: factory(ZefortAdapter),
  zorrosign: factory(ZorrosignAdapter),
}
