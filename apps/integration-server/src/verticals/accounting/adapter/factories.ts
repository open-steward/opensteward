/**
 * Adapter factories — lazy constructors keyed by platform slug.
 * Used for config-driven registration: only enabled adapters are loaded.
 */
import type { AccountingAdapter } from './interface'

import { Dynamics365BCAdapter } from '../adapters/dynamics365bc'
import { EBoekhoudenAdapter } from '../adapters/eboekhouden'
import { ExactOnlineAdapter } from '../adapters/exactonline'
import { FattureCloudAdapter } from '../adapters/fatturecloud'
import { FortnoxAdapter } from '../adapters/fortnox'
import { FreeAgentAdapter } from '../adapters/freeagent'
import { FreshBooksAdapter } from '../adapters/freshbooks'
import { LexofficeAdapter } from '../adapters/lexoffice'
import { MoneybirdAdapter } from '../adapters/moneybird'
import { MyobAdapter } from '../adapters/myob'
import { NetSuiteAdapter } from '../adapters/netsuite'
import { OdooAdapter } from '../adapters/odoo'
import { PennylaneAdapter } from '../adapters/pennylane'
import { PowerOfficeAdapter } from '../adapters/poweroffice'
import { QuickBooksAdapter } from '../adapters/quickbooks'
import { SageIntacctAdapter } from '../adapters/sageintacct'
import { SapB1Adapter } from '../adapters/sapb1'
import { SevDeskAdapter } from '../adapters/sevdesk'
import { TallyPrimeAdapter } from '../adapters/tallyprime'
import { TripletexAdapter } from '../adapters/tripletex'
import { VismaAdapter } from '../adapters/visma'
import { SpirisAdapter } from '../adapters/spiris'
import { BillyAdapter } from '../adapters/billy'
import { BjornLundenAdapter } from '../adapters/bjornlunden'
import { BokioAdapter } from '../adapters/bokio'
import { DineroAdapter } from '../adapters/dinero'
import { EconomicAdapter } from '../adapters/economic'
import { NetvisorAdapter } from '../adapters/netvisor'
import { ProcountorAdapter } from '../adapters/procountor'
import { AkauntingAdapter } from '../adapters/akaunting'
import { BexioAdapter } from '../adapters/bexio'
import { BillomatAdapter } from '../adapters/billomat'
import { FakturoidAdapter } from '../adapters/fakturoid'
import { FikenAdapter } from '../adapters/fiken'
import { HoldedAdapter } from '../adapters/holded'
import { PandleAdapter } from '../adapters/pandle'
import { SellsyAdapter } from '../adapters/sellsy'
import { SnelStartAdapter } from '../adapters/snelstart'
import { TwentyFourSevenOfficeAdapter } from '../adapters/twentyfoursevenoffice'
import { TwinfieldAdapter } from '../adapters/twinfield'
import { XeroAdapter } from '../adapters/xero'
import { ZohoBooksAdapter } from '../adapters/zohobooks'
import { KashooAdapter } from '../adapters/kashoo'
import { ZipBooksAdapter } from '../adapters/zipbooks'
import { ProfitBooksAdapter } from '../adapters/profitbooks'
import { SunriseAdapter } from '../adapters/sunrise'
import { LessAccountingAdapter } from '../adapters/lessaccounting'
import { FinlyAdapter } from '../adapters/finly'
import { AccountEdgeAdapter } from '../adapters/accountedge'
import { WaveAdapter } from '../adapters/wave'
import { PatriotAdapter } from '../adapters/patriot'
import { AccountingSeedAdapter } from '../adapters/accountingseed'
import { StessaAdapter } from '../adapters/stessa'
import { CenterAdapter } from '../adapters/center'
import { SiigoAdapter } from '../adapters/siigo'
import { ContaAzulAdapter } from '../adapters/contaazul'
import { AlegraAdapter } from '../adapters/alegra'
import { ChipaxAdapter } from '../adapters/chipax'
import { FacturamaAdapter } from '../adapters/facturama'
import { ContabiliumAdapter } from '../adapters/contabilium'
import { XubioAdapter } from '../adapters/xubio'
import { OmieAdapter } from '../adapters/omie'
import { NiboAdapter } from '../adapters/nibo'
import { ColppyAdapter } from '../adapters/colppy'
import { NuvemFiscalAdapter } from '../adapters/nuvemfiscal'
import { ContpaqiAdapter } from '../adapters/contpaqi'
import { FreeeAdapter } from '../adapters/freee'
import { MoneyForwardAdapter } from '../adapters/moneyforward'
import { BukkuAdapter } from '../adapters/bukku'
import { FinancioAdapter } from '../adapters/financio'
import { AutocountAdapter } from '../adapters/autocount'
import { ClearAdapter } from '../adapters/clear'
import { SaasuAdapter } from '../adapters/saasu'
import { ReckonAdapter } from '../adapters/reckon'
import { MisaAmisAdapter } from '../adapters/misaamis'
import { GiddhAdapter } from '../adapters/giddh'
import { DeskeraAdapter } from '../adapters/deskera'
import { EcountAdapter } from '../adapters/ecount'
import { MekariJurnalAdapter } from '../adapters/mekarijurnal'
import { AccurateAdapter } from '../adapters/accurate'
import { WafeqAdapter } from '../adapters/wafeq'
import { DaftraAdapter } from '../adapters/daftra'
import { InvoiceqAdapter } from '../adapters/invoiceq'
import { FatouraAdapter } from '../adapters/fatoura'
import { FocusSoftnetAdapter } from '../adapters/focussoftnet'
import { ManagerioAdapter } from '../adapters/managerio'
import { BusyAdapter } from '../adapters/busy'
import { HorizonErpAdapter } from '../adapters/horizonerp'
import { CloudMeAdapter } from '../adapters/cloudme'
import { JalebiAdapter } from '../adapters/jalebi'
import { MazeedOneAdapter } from '../adapters/mazeedone'
import { HinawiAdapter } from '../adapters/hinawi'
import { MorningAdapter } from '../adapters/morning'
import { ICountAdapter } from '../adapters/icount'
import { PEAccountingAdapter } from '../adapters/peaccounting'
import { AcconomyAdapter } from '../adapters/acconomy'
import { BrioxAdapter } from '../adapters/briox'
import { WintAdapter } from '../adapters/wint'
import { PromikBookAdapter } from '../adapters/promikbook'
import { SpeedLedgerAdapter } from '../adapters/speedledger'
import { InbooksAdapter } from '../adapters/inbooks'
import { WrebitAdapter } from '../adapters/wrebit'
import { VismaNetAdapter } from '../adapters/vismanet'
import { UnimicroAdapter } from '../adapters/unimicro'
import { DuettAdapter } from '../adapters/duett'
import { CentigaAdapter } from '../adapters/centiga'
import { SystimaAdapter } from '../adapters/systima'
import { LucaAdapter } from '../adapters/luca'
import { SendRegningAdapter } from '../adapters/sendregning'
import { ContaAdapter } from '../adapters/conta'
import { ZervantAdapter } from '../adapters/zervant'
import { VismaBusinessNxtAdapter } from '../adapters/vismabusinessnxt'
import { XledgerAdapter } from '../adapters/xledger'
import { DatevAdapter } from '../adapters/datev'
import { FastBillAdapter } from '../adapters/fastbill'
import { PaperlessNgxAdapter } from '../adapters/paperlessngx'
import { WisoMeinBueroAdapter } from '../adapters/wisomeinbuero'
import { BuchhaltungsButzeAdapter } from '../adapters/buchhaltungsbutze'
import { InvoicePortalAdapter } from '../adapters/invoiceportal'
import { AccountableAdapter } from '../adapters/accountable'
import { AmanoteAdapter } from '../adapters/amanote'
import { Sage50DeAdapter } from '../adapters/sage50de'
import { TiimeAdapter } from '../adapters/tiime'
import { SinaoAdapter } from '../adapters/sinao'
import { LibeoAdapter } from '../adapters/libeo'
import { RegateAdapter } from '../adapters/regate'
import { CegidAdapter } from '../adapters/cegid'
import { MyunisoftAdapter } from '../adapters/myunisoft'
import { IpaidthatAdapter } from '../adapters/ipaidthat'
import { EvolizAdapter } from '../adapters/evoliz'
import { AxonautAdapter } from '../adapters/axonaut'
import { AnfixAdapter } from '../adapters/anfix'
import { ContasimpleAdapter } from '../adapters/contasimple'
import { CuenticaAdapter } from '../adapters/cuentica'
import { DebitoorAdapter } from '../adapters/debitoor'
import { BillinAdapter } from '../adapters/billin'
import { QuipuAdapter } from '../adapters/quipu'
import { FacturadirectaAdapter } from '../adapters/facturadirecta'
import { FactusolAdapter } from '../adapters/factusol'
import { ArubaAdapter } from '../adapters/aruba'
import { DaneaAdapter } from '../adapters/danea'
import { TeamSystemAdapter } from '../adapters/teamsystem'
import { ZucchettiAdapter } from '../adapters/zucchetti'
import { SuperbillAdapter } from '../adapters/superbill'
import { BmanAdapter } from '../adapters/bman'
import { GiobbyAdapter } from '../adapters/giobby'
import { CloudFinanceAdapter } from '../adapters/cloudfinance'
import { Fatture24Adapter } from '../adapters/fatture24'
import { SistemiAdapter } from '../adapters/sistemi'
import { BluenextAdapter } from '../adapters/bluenext'
import { ComarchoptimaAdapter } from '../adapters/comarchoptima'
import { InsertnexoAdapter } from '../adapters/insertnexo'
import { AbraflexiAdapter } from '../adapters/abraflexi'
import { PohodaAdapter } from '../adapters/pohoda'
import { IdokladAdapter } from '../adapters/idoklad'
import { SuperfakturaAdapter } from '../adapters/superfaktura'
import { MeritaktivaAdapter } from '../adapters/meritaktiva'
import { SmartaccountsAdapter } from '../adapters/smartaccounts'
import { JumisAdapter } from '../adapters/jumis'
import { RivileAdapter } from '../adapters/rivile'
import { SmartbillAdapter } from '../adapters/smartbill'
import { BillingoAdapter } from '../adapters/billingo'
import { SzamlazzhuAdapter } from '../adapters/szamlazzhu'
import { DilovodAdapter } from '../adapters/dilovod'
import { FinmapAdapter } from '../adapters/finmap'
import { MasteraccountingAdapter } from '../adapters/masteraccounting'
import { TorgsoftAdapter } from '../adapters/torgsoft'
import { OneCEnterpriseAdapter } from '../adapters/1centerprise'
import { MoyskladAdapter } from '../adapters/moysklad'
import { KonturelbaAdapter } from '../adapters/konturelba'
import { SberbusinessAdapter } from '../adapters/sberbusiness'
import { KingdeeAdapter } from '../adapters/kingdee'
import { YonyouAdapter } from '../adapters/yonyou'
import { ChanjetAdapter } from '../adapters/chanjet'
import { AisinoAdapter } from '../adapters/aisino'
import { GeeyeeAdapter } from '../adapters/geeyee'
import { FenbeitongAdapter } from '../adapters/fenbeitong'
import { ParasutAdapter } from '../adapters/parasut'
import { LogoYazilimAdapter } from '../adapters/logoyazilim'
import { EpsilonNetAdapter } from '../adapters/epsilonnet'
import { ProsvasisAdapter } from '../adapters/prosvasis'
import { AcumaticaAdapter } from '../adapters/acumatica'
import { MaxioAdapter } from '../adapters/maxio'
import { FoundationAdapter } from '../adapters/foundation'
import { CertiniaAdapter } from '../adapters/certinia'
import { SilverfinAdapter } from '../adapters/silverfin'
import { AccountsIQAdapter } from '../adapters/accountsiq'
import { ClearBooksAdapter } from '../adapters/clearbooks'
import { AppFolioAdapter } from '../adapters/appfolio'
import { GustoAdapter } from '../adapters/gusto'
import { Unit4Adapter } from '../adapters/unit4'
import { BlacklineAdapter } from '../adapters/blackline'
import { CmicAdapter } from '../adapters/cmic'
import { MoloniAdapter } from '../adapters/moloni'
import { InvoiceXpressAdapter } from '../adapters/invoicexpress'
import { PeakAccountAdapter } from '../adapters/peakaccount'
import { FlowAccountAdapter } from '../adapters/flowaccount'
import { A2xAdapter } from '../adapters/a2x'
import { AbacusChAdapter } from '../adapters/abacus-ch'
import { AccessFinancialsAdapter } from '../adapters/access-financials'
import { AccounteerAdapter } from '../adapters/accounteer'
import { AccountsportalAdapter } from '../adapters/accountsportal'
import { AfasAdapter } from '../adapters/afas'
import { AvidxchangeAdapter } from '../adapters/avidxchange'
import { BigcapitalAdapter } from '../adapters/bigcapital'
import { Bill4timeAdapter } from '../adapters/bill4time'
import { BillitAdapter } from '../adapters/billit'
import { BindErpAdapter } from '../adapters/bind-erp'
import { BlingAdapter } from '../adapters/bling'
import { BrexAdapter } from '../adapters/brex'
import { BuiltAfricaAdapter } from '../adapters/built-africa'
import { CalxaAdapter } from '../adapters/calxa'
import { CampfireAdapter } from '../adapters/campfire'
import { CashctrlAdapter } from '../adapters/cashctrl'
import { CraterAdapter } from '../adapters/crater'
import { CrunchAdapter } from '../adapters/crunch'
import { DextAdapter } from '../adapters/dext'
import { DigitsAdapter } from '../adapters/digits'
import { DirectoAdapter } from '../adapters/directo'
import { DolibarrAdapter } from '../adapters/dolibarr'
import { DualentryAdapter } from '../adapters/dualentry'
import { EgestorAdapter } from '../adapters/egestor'
import { ErpNextAdapter } from '../adapters/erpnext'
import { FakturowniaAdapter } from '../adapters/fakturownia'
import { FireflyIiiAdapter } from '../adapters/firefly-iii'
import { FrontAccountingAdapter } from '../adapters/frontaccounting'
import { GranatumAdapter } from '../adapters/granatum'
import { IfirmaAdapter } from '../adapters/ifirma'
import { InfaktAdapter } from '../adapters/infakt'
import { InvoiceNinjaAdapter } from '../adapters/invoice-ninja'
import { InvoicedAdapter } from '../adapters/invoiced'
import { KarbonAdapter } from '../adapters/karbon'
import { KashflowAdapter } from '../adapters/kashflow'
import { KlaraAdapter } from '../adapters/klara'
import { KoraAdapter } from '../adapters/kora'
import { KwaraAdapter } from '../adapters/kwara'
import { LedgersCloudAdapter } from '../adapters/ledgers-cloud'
import { LedgersmbAdapter } from '../adapters/ledgersmb'
import { ManagerAdapter } from '../adapters/manager'
import { MazumaAdapter } from '../adapters/mazuma'
import { MediusAdapter } from '../adapters/medius'
import { MelioAdapter } from '../adapters/melio'
import { MezanAdapter } from '../adapters/mezan'
import { MineraltreeAdapter } from '../adapters/mineraltree'
import { MossAdapter } from '../adapters/moss'
import { MriSoftwareAdapter } from '../adapters/mri-software'
import { MybillbookAdapter } from '../adapters/mybillbook'
import { OctopusAdapter } from '../adapters/octopus'
import { PagaAdapter } from '../adapters/paga'
import { PayhawkAdapter } from '../adapters/payhawk'
import { PleoAdapter } from '../adapters/pleo'
import { PuzzleAdapter } from '../adapters/puzzle'
import { QoyodAdapter } from '../adapters/qoyod'
import { QuickfileAdapter } from '../adapters/quickfile'
import { RampAdapter } from '../adapters/ramp'
import { RealbooksAdapter } from '../adapters/realbooks'
import { ReckonOneAdapter } from '../adapters/reckon-one'
import { RefrensAdapter } from '../adapters/refrens'
import { RilletAdapter } from '../adapters/rillet'
import { RoutableAdapter } from '../adapters/routable'
import { SageBusinessCloudAdapter } from '../adapters/sagebusinesscloud'
import { SaldeoAdapter } from '../adapters/saldeo'
import { ScopevisioAdapter } from '../adapters/scopevisio'
import { SilaAdapter } from '../adapters/sila'
import { SimplbooksAdapter } from '../adapters/simplbooks'
import { SmaccAdapter } from '../adapters/smacc'
import { SoldoAdapter } from '../adapters/soldo'
import { SpendeskAdapter } from '../adapters/spendesk'
import { StampliAdapter } from '../adapters/stampli'
import { SynderAdapter } from '../adapters/synder'
import { TinyAdapter } from '../adapters/tiny'
import { TipaltiAdapter } from '../adapters/tipalti'
import { TymsAdapter } from '../adapters/tyms'
import { UhasibuAdapter } from '../adapters/uhasibu'
import { VhsysAdapter } from '../adapters/vhsys'
import { VosfacturesAdapter } from '../adapters/vosfactures'
import { WfirmaAdapter } from '../adapters/wfirma'
import { WhitebooksAdapter } from '../adapters/whitebooks'
import { YayoiAdapter } from '../adapters/yayoi'
import { YoozAdapter } from '../adapters/yooz'
import { YukiAdapter } from '../adapters/yuki'

import type { AdapterFactory } from '@opensteward/shared'

/**
 * Narrow the factory boilerplate. Each platform adapter has a slightly
 * different constructor signature (some take `{clientId, clientSecret, ...}`,
 * some take an API key, some take nothing), and the registry-level factory
 * hands them a generic `Record<string, unknown>`. This helper absorbs the
 * type mismatch in a single location so call sites stay tidy.
 */
function factory<T extends AccountingAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<AccountingAdapter>> = {
  'dynamics365bc': factory(Dynamics365BCAdapter),
  'eboekhouden': factory(EBoekhoudenAdapter),
  'exactonline': factory(ExactOnlineAdapter),
  'fatturecloud': factory(FattureCloudAdapter),
  'fortnox': factory(FortnoxAdapter),
  'xero': factory(XeroAdapter),
  'quickbooks': factory(QuickBooksAdapter),
  'tripletex': factory(TripletexAdapter),
  'visma': factory(VismaAdapter),
  'spiris': factory(SpirisAdapter),
  'sevdesk': factory(SevDeskAdapter),
  'lexoffice': factory(LexofficeAdapter),
  'freeagent': factory(FreeAgentAdapter),
  'zohobooks': factory(ZohoBooksAdapter),
  'freshbooks': factory(FreshBooksAdapter),
  'moneybird': factory(MoneybirdAdapter),
  'myob': factory(MyobAdapter),
  'netsuite': factory(NetSuiteAdapter),
  'odoo': factory(OdooAdapter),
  'pennylane': factory(PennylaneAdapter),
  'poweroffice': factory(PowerOfficeAdapter),
  'sageintacct': factory(SageIntacctAdapter),
  'sapb1': factory(SapB1Adapter),
  'tallyprime': factory(TallyPrimeAdapter),
  'billy': factory(BillyAdapter),
  'bokio': factory(BokioAdapter),
  'economic': factory(EconomicAdapter),
  'bjornlunden': factory(BjornLundenAdapter),
  'dinero': factory(DineroAdapter),
  'netvisor': factory(NetvisorAdapter),
  'procountor': factory(ProcountorAdapter),
  'akaunting': factory(AkauntingAdapter),
  'bexio': factory(BexioAdapter),
  'billomat': factory(BillomatAdapter),
  'fakturoid': factory(FakturoidAdapter),
  'fiken': factory(FikenAdapter),
  'holded': factory(HoldedAdapter),
  'pandle': factory(PandleAdapter),
  'sellsy': factory(SellsyAdapter),
  'snelstart': factory(SnelStartAdapter),
  'twentyfoursevenoffice': factory(TwentyFourSevenOfficeAdapter),
  'twinfield': factory(TwinfieldAdapter),
  'kashoo': factory(KashooAdapter),
  'zipbooks': factory(ZipBooksAdapter),
  'profitbooks': factory(ProfitBooksAdapter),
  'sunrise': factory(SunriseAdapter),
  'lessaccounting': factory(LessAccountingAdapter),
  'finly': factory(FinlyAdapter),
  'accountedge': factory(AccountEdgeAdapter),
  'wave': factory(WaveAdapter),
  'patriot': factory(PatriotAdapter),
  'accountingseed': factory(AccountingSeedAdapter),
  'stessa': factory(StessaAdapter),
  'center': factory(CenterAdapter),
  'siigo': factory(SiigoAdapter),
  'contaazul': factory(ContaAzulAdapter),
  'alegra': factory(AlegraAdapter),
  'chipax': factory(ChipaxAdapter),
  'facturama': factory(FacturamaAdapter),
  'contabilium': factory(ContabiliumAdapter),
  'xubio': factory(XubioAdapter),
  'omie': factory(OmieAdapter),
  'nibo': factory(NiboAdapter),
  'colppy': factory(ColppyAdapter),
  'nuvemfiscal': factory(NuvemFiscalAdapter),
  'contpaqi': factory(ContpaqiAdapter),
  'freee': factory(FreeeAdapter),
  'moneyforward': factory(MoneyForwardAdapter),
  'bukku': factory(BukkuAdapter),
  'financio': factory(FinancioAdapter),
  'autocount': factory(AutocountAdapter),
  'clear': factory(ClearAdapter),
  'saasu': factory(SaasuAdapter),
  'reckon': factory(ReckonAdapter),
  'misaamis': factory(MisaAmisAdapter),
  'giddh': factory(GiddhAdapter),
  'deskera': factory(DeskeraAdapter),
  'ecount': factory(EcountAdapter),
  'mekarijurnal': factory(MekariJurnalAdapter),
  'accurate': factory(AccurateAdapter),
  'wafeq': factory(WafeqAdapter),
  'daftra': factory(DaftraAdapter),
  'invoiceq': factory(InvoiceqAdapter),
  'fatoura': factory(FatouraAdapter),
  'focussoftnet': factory(FocusSoftnetAdapter),
  'managerio': factory(ManagerioAdapter),
  'busy': factory(BusyAdapter),
  'horizonerp': factory(HorizonErpAdapter),
  'cloudme': factory(CloudMeAdapter),
  'jalebi': factory(JalebiAdapter),
  'mazeedone': factory(MazeedOneAdapter),
  'morning': factory(MorningAdapter),
  'icount': factory(ICountAdapter),
  'hinawi': factory(HinawiAdapter),
  'peaccounting': factory(PEAccountingAdapter),
  'acconomy': factory(AcconomyAdapter),
  'briox': factory(BrioxAdapter),
  'wint': factory(WintAdapter),
  'promikbook': factory(PromikBookAdapter),
  'speedledger': factory(SpeedLedgerAdapter),
  'inbooks': factory(InbooksAdapter),
  'wrebit': factory(WrebitAdapter),
  'vismanet': factory(VismaNetAdapter),
  'unimicro': factory(UnimicroAdapter),
  'duett': factory(DuettAdapter),
  'centiga': factory(CentigaAdapter),
  'systima': factory(SystimaAdapter),
  'luca': factory(LucaAdapter),
  'sendregning': factory(SendRegningAdapter),
  'conta': factory(ContaAdapter),
  'zervant': factory(ZervantAdapter),
  'vismabusinessnxt': factory(VismaBusinessNxtAdapter),
  'xledger': factory(XledgerAdapter),
  'datev': factory(DatevAdapter),
  'fastbill': factory(FastBillAdapter),
  'paperlessngx': factory(PaperlessNgxAdapter),
  'wisomeinbuero': factory(WisoMeinBueroAdapter),
  'buchhaltungsbutze': factory(BuchhaltungsButzeAdapter),
  'invoiceportal': factory(InvoicePortalAdapter),
  'accountable': factory(AccountableAdapter),
  'amanote': factory(AmanoteAdapter),
  'sage50de': factory(Sage50DeAdapter),
  'tiime': factory(TiimeAdapter),
  'sinao': factory(SinaoAdapter),
  'libeo': factory(LibeoAdapter),
  'regate': factory(RegateAdapter),
  'cegid': factory(CegidAdapter),
  'myunisoft': factory(MyunisoftAdapter),
  'ipaidthat': factory(IpaidthatAdapter),
  'evoliz': factory(EvolizAdapter),
  'axonaut': factory(AxonautAdapter),
  'anfix': factory(AnfixAdapter),
  'contasimple': factory(ContasimpleAdapter),
  'cuentica': factory(CuenticaAdapter),
  'debitoor': factory(DebitoorAdapter),
  'billin': factory(BillinAdapter),
  'quipu': factory(QuipuAdapter),
  'facturadirecta': factory(FacturadirectaAdapter),
  'factusol': factory(FactusolAdapter),
  'aruba': factory(ArubaAdapter),
  'danea': factory(DaneaAdapter),
  'teamsystem': factory(TeamSystemAdapter),
  'zucchetti': factory(ZucchettiAdapter),
  'superbill': factory(SuperbillAdapter),
  'bman': factory(BmanAdapter),
  'giobby': factory(GiobbyAdapter),
  'cloudfinance': factory(CloudFinanceAdapter),
  'fatture24': factory(Fatture24Adapter),
  'sistemi': factory(SistemiAdapter),
  'bluenext': factory(BluenextAdapter),
  'comarchoptima': factory(ComarchoptimaAdapter),
  'insertnexo': factory(InsertnexoAdapter),
  'abraflexi': factory(AbraflexiAdapter),
  'pohoda': factory(PohodaAdapter),
  'idoklad': factory(IdokladAdapter),
  'superfaktura': factory(SuperfakturaAdapter),
  'meritaktiva': factory(MeritaktivaAdapter),
  'smartaccounts': factory(SmartaccountsAdapter),
  'jumis': factory(JumisAdapter),
  'rivile': factory(RivileAdapter),
  'smartbill': factory(SmartbillAdapter),
  'billingo': factory(BillingoAdapter),
  'szamlazzhu': factory(SzamlazzhuAdapter),
  'dilovod': factory(DilovodAdapter),
  'finmap': factory(FinmapAdapter),
  'masteraccounting': factory(MasteraccountingAdapter),
  'torgsoft': factory(TorgsoftAdapter),
  '1centerprise': factory(OneCEnterpriseAdapter),
  'moysklad': factory(MoyskladAdapter),
  'konturelba': factory(KonturelbaAdapter),
  'sberbusiness': factory(SberbusinessAdapter),
  'kingdee': factory(KingdeeAdapter),
  'yonyou': factory(YonyouAdapter),
  'chanjet': factory(ChanjetAdapter),
  'aisino': factory(AisinoAdapter),
  'geeyee': factory(GeeyeeAdapter),
  'fenbeitong': factory(FenbeitongAdapter),
  'parasut': factory(ParasutAdapter),
  'logoyazilim': factory(LogoYazilimAdapter),
  'moloni': factory(MoloniAdapter),
  'invoicexpress': factory(InvoiceXpressAdapter),
  'peakaccount': factory(PeakAccountAdapter),
  'flowaccount': factory(FlowAccountAdapter),
  'epsilonnet': factory(EpsilonNetAdapter),
  'prosvasis': factory(ProsvasisAdapter),
  'acumatica': factory(AcumaticaAdapter),
  'maxio': factory(MaxioAdapter),
  'foundation': factory(FoundationAdapter),
  'certinia': factory(CertiniaAdapter),
  'silverfin': factory(SilverfinAdapter),
  'accountsiq': factory(AccountsIQAdapter),
  'clearbooks': factory(ClearBooksAdapter),
  'appfolio': factory(AppFolioAdapter),
  'gusto': factory(GustoAdapter),
  'unit4': factory(Unit4Adapter),
  'blackline': factory(BlacklineAdapter),
  'cmic': factory(CmicAdapter),
  a2x: factory(A2xAdapter),
  'abacus-ch': factory(AbacusChAdapter),
  'access-financials': factory(AccessFinancialsAdapter),
  accounteer: factory(AccounteerAdapter),
  accountsportal: factory(AccountsportalAdapter),
  afas: factory(AfasAdapter),
  avidxchange: factory(AvidxchangeAdapter),
  bigcapital: factory(BigcapitalAdapter),
  bill4time: factory(Bill4timeAdapter),
  billit: factory(BillitAdapter),
  'bind-erp': factory(BindErpAdapter),
  bling: factory(BlingAdapter),
  brex: factory(BrexAdapter),
  'built-africa': factory(BuiltAfricaAdapter),
  calxa: factory(CalxaAdapter),
  campfire: factory(CampfireAdapter),
  cashctrl: factory(CashctrlAdapter),
  crater: factory(CraterAdapter),
  crunch: factory(CrunchAdapter),
  dext: factory(DextAdapter),
  digits: factory(DigitsAdapter),
  directo: factory(DirectoAdapter),
  dolibarr: factory(DolibarrAdapter),
  dualentry: factory(DualentryAdapter),
  egestor: factory(EgestorAdapter),
  erpnext: factory(ErpNextAdapter),
  fakturownia: factory(FakturowniaAdapter),
  'firefly-iii': factory(FireflyIiiAdapter),
  frontaccounting: factory(FrontAccountingAdapter),
  granatum: factory(GranatumAdapter),
  ifirma: factory(IfirmaAdapter),
  infakt: factory(InfaktAdapter),
  'invoice-ninja': factory(InvoiceNinjaAdapter),
  invoiced: factory(InvoicedAdapter),
  karbon: factory(KarbonAdapter),
  kashflow: factory(KashflowAdapter),
  klara: factory(KlaraAdapter),
  kora: factory(KoraAdapter),
  kwara: factory(KwaraAdapter),
  'ledgers-cloud': factory(LedgersCloudAdapter),
  ledgersmb: factory(LedgersmbAdapter),
  manager: factory(ManagerAdapter),
  mazuma: factory(MazumaAdapter),
  medius: factory(MediusAdapter),
  melio: factory(MelioAdapter),
  mezan: factory(MezanAdapter),
  mineraltree: factory(MineraltreeAdapter),
  moss: factory(MossAdapter),
  'mri-software': factory(MriSoftwareAdapter),
  mybillbook: factory(MybillbookAdapter),
  octopus: factory(OctopusAdapter),
  paga: factory(PagaAdapter),
  payhawk: factory(PayhawkAdapter),
  pleo: factory(PleoAdapter),
  puzzle: factory(PuzzleAdapter),
  qoyod: factory(QoyodAdapter),
  quickfile: factory(QuickfileAdapter),
  ramp: factory(RampAdapter),
  realbooks: factory(RealbooksAdapter),
  'reckon-one': factory(ReckonOneAdapter),
  refrens: factory(RefrensAdapter),
  rillet: factory(RilletAdapter),
  routable: factory(RoutableAdapter),
  sagebusinesscloud: factory(SageBusinessCloudAdapter),
  saldeo: factory(SaldeoAdapter),
  scopevisio: factory(ScopevisioAdapter),
  sila: factory(SilaAdapter),
  simplbooks: factory(SimplbooksAdapter),
  smacc: factory(SmaccAdapter),
  soldo: factory(SoldoAdapter),
  spendesk: factory(SpendeskAdapter),
  stampli: factory(StampliAdapter),
  synder: factory(SynderAdapter),
  tiny: factory(TinyAdapter),
  tipalti: factory(TipaltiAdapter),
  tyms: factory(TymsAdapter),
  uhasibu: factory(UhasibuAdapter),
  vhsys: factory(VhsysAdapter),
  vosfactures: factory(VosfacturesAdapter),
  wfirma: factory(WfirmaAdapter),
  whitebooks: factory(WhitebooksAdapter),
  yayoi: factory(YayoiAdapter),
  yooz: factory(YoozAdapter),
  yuki: factory(YukiAdapter),
}
