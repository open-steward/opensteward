import type { AdapterFactory } from '@opensteward/shared'
import type { CrmAdapter } from './interface'

function factory<T extends CrmAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

// ── Tier 1: Enterprise ────────────────────────────────────────────────────
import { SalesforceAdapter } from '../adapters/salesforce'
import { HubSpotAdapter } from '../adapters/hubspot'
import { ZohoCrmAdapter } from '../adapters/zoho-crm'
import { Dynamics365CrmAdapter } from '../adapters/dynamics365-crm'
import { OracleCxAdapter } from '../adapters/oracle-cx'

// ── Tier 2: Mid-market ────────────────────────────────────────────────────
import { PipedriveAdapter } from '../adapters/pipedrive'
import { FreshsalesAdapter } from '../adapters/freshsales'
import { CloseAdapter } from '../adapters/close'
import { CopperAdapter } from '../adapters/copper'
import { InsightlyAdapter } from '../adapters/insightly'
import { SugarCrmAdapter } from '../adapters/sugarcrm'
import { VtigerAdapter } from '../adapters/vtiger'
import { Bitrix24Adapter } from '../adapters/bitrix24'
import { MondayCrmAdapter } from '../adapters/monday-crm'

// ── Tier 3: SMB / Modern ──────────────────────────────────────────────────
import { KeapAdapter } from '../adapters/keap'
import { ActiveCampaignAdapter } from '../adapters/activecampaign'
import { NimbleAdapter } from '../adapters/nimble'
import { NutshellAdapter } from '../adapters/nutshell'
import { AgileCrmAdapter } from '../adapters/agilecrm'
import { CapsuleAdapter } from '../adapters/capsule'
import { LacrmAdapter } from '../adapters/lacrm'
import { SalesflareAdapter } from '../adapters/salesflare'
import { AttioAdapter } from '../adapters/attio'
import { AffinityAdapter } from '../adapters/affinity'
import { FolkAdapter } from '../adapters/folk'
import { ApolloAdapter } from '../adapters/apollo'
import { OutreachAdapter } from '../adapters/outreach'
import { SalesloftAdapter } from '../adapters/salesloft'
import { StreakAdapter } from '../adapters/streak'
import { TeamwaveAdapter } from '../adapters/teamwave'
import { PlanhatAdapter } from '../adapters/planhat'

// ── Tier 5: Regional / Market-Specific ───────────────────────────────────
import { LimeCrmAdapter } from '../adapters/lime-crm'
import { UpsalesAdapter } from '../adapters/upsales'
import { SuperOfficeAdapter } from '../adapters/superoffice'
import { SamdockAdapter } from '../adapters/samdock'
import { WeclappAdapter } from '../adapters/weclapp'
import { SellsyAdapter } from '../adapters/sellsy'
import { TeamleaderAdapter } from '../adapters/teamleader'
import { SpotlerCrmAdapter } from '../adapters/spotler-crm'
import { LeadSquaredAdapter } from '../adapters/leadsquared'
import { DeskeraAdapter } from '../adapters/deskera'
import { RdStationCrmAdapter } from '../adapters/rd-station-crm'
import { AgendorAdapter } from '../adapters/agendor'
import { HoldedAdapter } from '../adapters/holded'
import { RetailCrmAdapter } from '../adapters/retailcrm'

// ── EU Core ───────────────────────────────────────────────────────────────
import { WebcrmAdapter } from '../adapters/webcrm'
import { RaynetAdapter } from '../adapters/raynet'
import { EfficyAdapter } from '../adapters/efficy'
import { SageCrmAdapter } from '../adapters/sage-crm'
import { BexioAdapter } from '../adapters/bexio'

// ── EU Extended ───────────────────────────────────────────────────────────
import { BrevoAdapter } from '../adapters/brevo'
import { SalesmanagoAdapter } from '../adapters/salesmanago'
import { EspoCrmAdapter } from '../adapters/espocrm'
import { TwentyAdapter } from '../adapters/twenty'

// ── MENA + India ──────────────────────────────────────────────────────────
import { CrmComAdapter } from '../adapters/crm-com'
import { KylasAdapter } from '../adapters/kylas'
import { CorporateStackAdapter } from '../adapters/corporatestack'

// ── EU + Open-Source ──────────────────────────────────────────────────────
import { ScoroAdapter } from '../adapters/scoro'
import { ForceManagerAdapter } from '../adapters/forcemanager'
import { TeamworkCrmAdapter } from '../adapters/teamwork-crm'
import { SuiteCrmAdapter } from '../adapters/suitecrm'
import { MauticAdapter } from '../adapters/mautic'

// ── US / Global ───────────────────────────────────────────────────────────
import { OntraportAdapter } from '../adapters/ontraport'
import { ApptivoAdapter } from '../adapters/apptivo'
import { ActCrmAdapter } from '../adapters/act-crm'
import { SolveCrmAdapter } from '../adapters/solve-crm'

// ── India / APAC ──────────────────────────────────────────────────────────
import { SalesmateAdapter } from '../adapters/salesmate'
import { KaptureCrmAdapter } from '../adapters/kapture-crm'
import { RecruitCrmAdapter } from '../adapters/recruit-crm'
import { WakeupsalesAdapter } from '../adapters/wakeupsales'

// ── EU ────────────────────────────────────────────────────────────────────
import { OnePageCrmAdapter } from '../adapters/onepagecrm'
import { NetHuntCrmAdapter } from '../adapters/nethunt-crm'
import { DolibarrAdapter } from '../adapters/dolibarr'
import { YetiForceAdapter } from '../adapters/yetiforce'
import { KrayinCrmAdapter } from '../adapters/krayin-crm'

// ── APAC ──────────────────────────────────────────────────────────────────
import { BullhornAdapter } from '../adapters/bullhorn'
import { QontakAdapter } from '../adapters/qontak'
import { QiscusAdapter } from '../adapters/qiscus'

// ── LATAM ─────────────────────────────────────────────────────────────────
import { PloomesAdapter } from '../adapters/ploomes'
import { MoskitAdapter } from '../adapters/moskit'
import { ClientifyAdapter } from '../adapters/clientify'

// ── East Asia ─────────────────────────────────────────────────────────────
import { KintoneAdapter } from '../adapters/kintone'
import { SansanAdapter } from '../adapters/sansan'
import { RagicAdapter } from '../adapters/ragic'

// ── ANZ ───────────────────────────────────────────────────────────────────
import { OrttoAdapter } from '../adapters/ortto'
import { RexCrmAdapter } from '../adapters/rex-crm'

// ── Global Niche + EU ─────────────────────────────────────────────────────
import { ZohoBiginAdapter } from '../adapters/zoho-bigin'
import { MaximizerAdapter } from '../adapters/maximizer'
import { MembrainAdapter } from '../adapters/membrain'
import { CobraCrmAdapter } from '../adapters/cobra-crm'
import { NetsuiteCrmAdapter } from '../adapters/netsuite-crm'

// ── Tier 4: Niche / Specialized ───────────────────────────────────────────
import { KommoAdapter } from '../adapters/kommo'
import { ZendeskSellAdapter } from '../adapters/zendesk-sell'
import { CreatioAdapter } from '../adapters/creatio'
import { HighLevelAdapter } from '../adapters/highlevel'
import { OdooCrmAdapter } from '../adapters/odoo-crm'
import { PodioAdapter } from '../adapters/podio'
import { PipelinerAdapter } from '../adapters/pipeliner'
import { WixCrmAdapter } from '../adapters/wix-crm'
import { OneCrmAdapter } from '../adapters/1crm'
import { AcceloAdapter } from '../adapters/accelo'
import { BarantumAdapter } from '../adapters/barantum'
import { BoondmanagerAdapter } from '../adapters/boondmanager'
import { CarerixAdapter } from '../adapters/carerix'
import { CasGenesisworldAdapter } from '../adapters/cas-genesisworld'
import { CatalystAdapter } from '../adapters/catalyst'
import { CentralstationcrmAdapter } from '../adapters/centralstationcrm'
import { ChurnzeroAdapter } from '../adapters/churnzero'
import { ClarifyAdapter } from '../adapters/clarify'
import { ClozeAdapter } from '../adapters/cloze'
import { CorefactorsAdapter } from '../adapters/corefactors'
import { CortezaCrmAdapter } from '../adapters/corteza-crm'
import { CrelateAdapter } from '../adapters/crelate'
import { DayliteAdapter } from '../adapters/daylite'
import { DexAdapter } from '../adapters/dex'
import { EngagebayAdapter } from '../adapters/engagebay'
import { EudonetAdapter } from '../adapters/eudonet'
import { FollowUpBossAdapter } from '../adapters/follow-up-boss'
import { FrappeCrmAdapter } from '../adapters/frappe-crm'
import { GainsightAdapter } from '../adapters/gainsight'
import { GallaboxAdapter } from '../adapters/gallabox'
import { GoldVisionAdapter } from '../adapters/gold-vision'
import { GrooveSalesAdapter } from '../adapters/groove-sales'
import { JobadderAdapter } from '../adapters/jobadder'
import { JobdivaAdapter } from '../adapters/jobdiva'
import { KlentyAdapter } from '../adapters/klenty'
import { LemlistAdapter } from '../adapters/lemlist'
import { LoxoAdapter } from '../adapters/loxo'
import { ManatalAdapter } from '../adapters/manatal'
import { MazricaAdapter } from '../adapters/mazrica'
import { MegaplanAdapter } from '../adapters/megaplan'
import { MethodCrmAdapter } from '../adapters/method-crm'
import { MixmaxAdapter } from '../adapters/mixmax'
import { NocrmIoAdapter } from '../adapters/nocrm-io'
import { OrocrmAdapter } from '../adapters/orocrm'
import { PegaCrmAdapter } from '../adapters/pega-crm'
import { PipelineCrmAdapter } from '../adapters/pipeline-crm'
import { RecruiterflowAdapter } from '../adapters/recruiterflow'
import { ReplyIoAdapter } from '../adapters/reply-io'
import { RespondIoAdapter } from '../adapters/respond-io'
import { SalesnexusAdapter } from '../adapters/salesnexus'
import { SapSalesCloudAdapter } from '../adapters/sap-sales-cloud'
import { SimplicateAdapter } from '../adapters/simplicate'
import { SpiroAdapter } from '../adapters/spiro'
import { TeamgateAdapter } from '../adapters/teamgate'
import { TotangoAdapter } from '../adapters/totango'
import { TribeCrmAdapter } from '../adapters/tribe-crm'
import { VendastaAdapter } from '../adapters/vendasta'
import { VincereAdapter } from '../adapters/vincere'
import { VitallyAdapter } from '../adapters/vitally'
import { WatiAdapter } from '../adapters/wati'
import { WorkbooksAdapter } from '../adapters/workbooks'

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<CrmAdapter>> = {
  // Tier 1
  'salesforce':     factory(SalesforceAdapter),
  'hubspot':        factory(HubSpotAdapter),
  'zoho-crm':       factory(ZohoCrmAdapter),
  'dynamics365-crm': factory(Dynamics365CrmAdapter),
  'oracle-cx':      factory(OracleCxAdapter),
  // Tier 2
  'pipedrive':      factory(PipedriveAdapter),
  'freshsales':     factory(FreshsalesAdapter),
  'close':          factory(CloseAdapter),
  'copper':         factory(CopperAdapter),
  'insightly':      factory(InsightlyAdapter),
  'sugarcrm':       factory(SugarCrmAdapter),
  'vtiger':         factory(VtigerAdapter),
  'bitrix24':       factory(Bitrix24Adapter),
  'monday-crm':     factory(MondayCrmAdapter),
  // Tier 3
  'keap':           factory(KeapAdapter),
  'activecampaign': factory(ActiveCampaignAdapter),
  'nimble':         factory(NimbleAdapter),
  'nutshell':       factory(NutshellAdapter),
  'agilecrm':       factory(AgileCrmAdapter),
  'capsule':        factory(CapsuleAdapter),
  'lacrm':          factory(LacrmAdapter),
  'salesflare':     factory(SalesflareAdapter),
  'attio':          factory(AttioAdapter),
  'affinity':       factory(AffinityAdapter),
  'folk':           factory(FolkAdapter),
  'apollo':         factory(ApolloAdapter),
  'outreach':       factory(OutreachAdapter),
  'salesloft':      factory(SalesloftAdapter),
  'streak':         factory(StreakAdapter),
  'teamwave':       factory(TeamwaveAdapter),
  'planhat':        factory(PlanhatAdapter),
  // Tier 5 — Regional
  'lime-crm':       factory(LimeCrmAdapter),
  'upsales':        factory(UpsalesAdapter),
  'superoffice':    factory(SuperOfficeAdapter),
  'samdock':        factory(SamdockAdapter),
  'weclapp':        factory(WeclappAdapter),
  'sellsy':         factory(SellsyAdapter),
  'teamleader':     factory(TeamleaderAdapter),
  'spotler-crm':    factory(SpotlerCrmAdapter),
  'leadsquared':    factory(LeadSquaredAdapter),
  'deskera':        factory(DeskeraAdapter),
  'rd-station-crm': factory(RdStationCrmAdapter),
  'agendor':        factory(AgendorAdapter),
  'holded':         factory(HoldedAdapter),
  'retailcrm':      factory(RetailCrmAdapter),
  // EU Core
  'webcrm':         factory(WebcrmAdapter),
  'raynet':         factory(RaynetAdapter),
  'efficy':         factory(EfficyAdapter),
  'sage-crm':       factory(SageCrmAdapter),
  'bexio':          factory(BexioAdapter),
  // EU Extended
  'brevo':          factory(BrevoAdapter),
  'salesmanago':    factory(SalesmanagoAdapter),
  'espocrm':        factory(EspoCrmAdapter),
  'twenty':         factory(TwentyAdapter),
  // MENA + India
  'crm-com':        factory(CrmComAdapter),
  'kylas':          factory(KylasAdapter),
  'corporatestack': factory(CorporateStackAdapter),
  // EU + Open-Source
  'scoro':          factory(ScoroAdapter),
  'forcemanager':   factory(ForceManagerAdapter),
  'teamwork-crm':   factory(TeamworkCrmAdapter),
  'suitecrm':       factory(SuiteCrmAdapter),
  'mautic':         factory(MauticAdapter),
  // US / Global
  'ontraport':      factory(OntraportAdapter),
  'apptivo':        factory(ApptivoAdapter),
  'act-crm':        factory(ActCrmAdapter),
  'solve-crm':      factory(SolveCrmAdapter),
  // India / APAC
  'salesmate':      factory(SalesmateAdapter),
  'kapture-crm':    factory(KaptureCrmAdapter),
  'recruit-crm':    factory(RecruitCrmAdapter),
  'wakeupsales':    factory(WakeupsalesAdapter),
  // EU
  'onepagecrm':     factory(OnePageCrmAdapter),
  'nethunt-crm':    factory(NetHuntCrmAdapter),
  'dolibarr':       factory(DolibarrAdapter),
  'yetiforce':      factory(YetiForceAdapter),
  'krayin-crm':     factory(KrayinCrmAdapter),
  // APAC
  'bullhorn':       factory(BullhornAdapter),
  'qontak':         factory(QontakAdapter),
  'qiscus':         factory(QiscusAdapter),
  // LATAM
  'ploomes':        factory(PloomesAdapter),
  'moskit':         factory(MoskitAdapter),
  'clientify':      factory(ClientifyAdapter),
  // Global Niche + EU
  'zoho-bigin':     factory(ZohoBiginAdapter),
  'maximizer':      factory(MaximizerAdapter),
  'membrain':       factory(MembrainAdapter),
  'cobra-crm':      factory(CobraCrmAdapter),
  'netsuite-crm':   factory(NetsuiteCrmAdapter),
  // Tier 4
  'kommo':          factory(KommoAdapter),
  'zendesk-sell':   factory(ZendeskSellAdapter),
  'creatio':        factory(CreatioAdapter),
  'highlevel':      factory(HighLevelAdapter),
  'odoo-crm':       factory(OdooCrmAdapter),
  'podio':          factory(PodioAdapter),
  'pipeliner':      factory(PipelinerAdapter),
  'wix-crm':        factory(WixCrmAdapter),
  // East Asia
  'kintone':        factory(KintoneAdapter),
  'sansan':         factory(SansanAdapter),
  'ragic':          factory(RagicAdapter),
  // ANZ
  'ortto':          factory(OrttoAdapter),
  'rex-crm':        factory(RexCrmAdapter),
  '1crm': factory(OneCrmAdapter),
  accelo: factory(AcceloAdapter),
  barantum: factory(BarantumAdapter),
  boondmanager: factory(BoondmanagerAdapter),
  carerix: factory(CarerixAdapter),
  'cas-genesisworld': factory(CasGenesisworldAdapter),
  catalyst: factory(CatalystAdapter),
  centralstationcrm: factory(CentralstationcrmAdapter),
  churnzero: factory(ChurnzeroAdapter),
  clarify: factory(ClarifyAdapter),
  cloze: factory(ClozeAdapter),
  corefactors: factory(CorefactorsAdapter),
  'corteza-crm': factory(CortezaCrmAdapter),
  crelate: factory(CrelateAdapter),
  daylite: factory(DayliteAdapter),
  dex: factory(DexAdapter),
  engagebay: factory(EngagebayAdapter),
  eudonet: factory(EudonetAdapter),
  'follow-up-boss': factory(FollowUpBossAdapter),
  'frappe-crm': factory(FrappeCrmAdapter),
  gainsight: factory(GainsightAdapter),
  gallabox: factory(GallaboxAdapter),
  'gold-vision': factory(GoldVisionAdapter),
  'groove-sales': factory(GrooveSalesAdapter),
  jobadder: factory(JobadderAdapter),
  jobdiva: factory(JobdivaAdapter),
  klenty: factory(KlentyAdapter),
  lemlist: factory(LemlistAdapter),
  loxo: factory(LoxoAdapter),
  manatal: factory(ManatalAdapter),
  mazrica: factory(MazricaAdapter),
  megaplan: factory(MegaplanAdapter),
  'method-crm': factory(MethodCrmAdapter),
  mixmax: factory(MixmaxAdapter),
  'nocrm-io': factory(NocrmIoAdapter),
  orocrm: factory(OrocrmAdapter),
  'pega-crm': factory(PegaCrmAdapter),
  'pipeline-crm': factory(PipelineCrmAdapter),
  recruiterflow: factory(RecruiterflowAdapter),
  'reply-io': factory(ReplyIoAdapter),
  'respond-io': factory(RespondIoAdapter),
  salesnexus: factory(SalesnexusAdapter),
  'sap-sales-cloud': factory(SapSalesCloudAdapter),
  simplicate: factory(SimplicateAdapter),
  spiro: factory(SpiroAdapter),
  teamgate: factory(TeamgateAdapter),
  totango: factory(TotangoAdapter),
  'tribe-crm': factory(TribeCrmAdapter),
  vendasta: factory(VendastaAdapter),
  vincere: factory(VincereAdapter),
  vitally: factory(VitallyAdapter),
  wati: factory(WatiAdapter),
  workbooks: factory(WorkbooksAdapter),
}
