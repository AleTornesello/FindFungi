import type { Locale } from "../i18n/locales"
import { SITE_NAME } from "../seo"
import { AUTHOR_EMAIL } from "./author"

/** Bump when the text changes; shown as "last updated" in the reader's date format. */
export const DISCLAIMER_UPDATED = "2026-10-05"

/** The language the disclaimer was written in; other languages are translations and say so. */
export const DISCLAIMER_ORIGINAL: Locale = "en"

/**
 * A paragraph, a bulleted list when it's an array, or a safety warning set apart from the
 * text. Inline `**bold**` and `[label](href)` are rendered by the page.
 */
export type LegalBlock = string | string[] | { warning: string }

export interface LegalSection {
  title: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  intro: LegalBlock[]
  sections: LegalSection[]
}

const SITE = `**${SITE_NAME}**`
const EMAIL = `**[${AUTHOR_EMAIL}](mailto:${AUTHOR_EMAIL})**`

const en: LegalDocument = {
  intro: [
    `${SITE} (the “Website”, “we”, “us” or “our”) provides publicly available information concerning fungi, including scientific and common names, taxonomy, photographs, descriptions, edibility, toxicity and potential hazards.`,
    "The information available on the Website is provided **for general informational, educational and research purposes only**.",
  ],
  sections: [
    {
      title: "Critical safety warning",
      blocks: [
        { warning: "Do not use this Website to decide whether a fungus is safe to eat." },
        "**The information provided on this Website must never be used as the sole or primary basis for identifying, collecting, preparing or consuming a wild fungus.**",
        "**Never eat a fungus because it appears to match a photograph, description, species name or edibility classification displayed on this Website.**",
        "A fungus that appears to correspond to a species described as edible on the Website may in fact be:",
        [
          "a different species;",
          "a poisonous or potentially lethal look-alike;",
          "incorrectly identified;",
          "incorrectly classified;",
          "subject to a taxonomic change;",
          "incorrectly represented by a photograph;",
          "contaminated, spoiled or otherwise unsafe to consume; or",
          "unsafe for a particular person or under particular circumstances.",
        ],
        "**When there is any doubt whatsoever regarding the identity or safety of a fungus, do not consume it.**",
        "For any fungus intended for consumption, users should obtain an identification and safety assessment from a **qualified professional mycologist or other appropriately qualified professional**, in accordance with applicable local requirements.",
      ],
    },
    {
      title: "The Website does not provide mushroom identification",
      blocks: [
        "The Website is **not an identification service** and does not provide an identification guarantee.",
        "The Website does not examine physical specimens and does not have the ability to determine, solely from an image or description, whether a particular fungus found by a user belongs to a particular species.",
        "Photographs displayed on the Website are provided for **illustrative purposes only**.",
        "A visual resemblance between a user's specimen and an image displayed on the Website **does not establish that the specimens are the same species**.",
        "Users must not treat any species match, search result, photograph, description or other information displayed by the Website as a professional identification.",
      ],
    },
    {
      title: "No food-safety or edibility guarantee",
      blocks: [
        "Any indication concerning whether a species is described as “edible”, “poisonous”, “toxic”, “inedible”, “dangerous” or similar is provided solely as general informational content.",
        "Such classifications:",
        [
          "are not a certification of food safety;",
          "are not a recommendation to consume the species;",
          "do not constitute approval for consumption;",
          "do not guarantee that every specimen of the species is safe to consume;",
          "do not take account of the condition, age, preparation, storage or origin of an individual specimen;",
          "may differ between sources or jurisdictions; and",
          "may change as scientific knowledge and taxonomy develop.",
        ],
        "**The presence of an “edible” classification on the Website must never be interpreted as an instruction, recommendation or authorization to consume a fungus.**",
      ],
    },
    {
      title: "Sources and unverified information",
      blocks: [
        "The Website aggregates information obtained from **publicly accessible third-party sources available on the Internet**.",
        "Unless expressly stated otherwise, we do **not independently verify, authenticate, validate, review or certify** the information obtained from those sources.",
        "Information may therefore be:",
        [
          "inaccurate;",
          "incomplete;",
          "outdated;",
          "incorrectly attributed;",
          "inconsistent between sources;",
          "affected by taxonomic changes;",
          "affected by regional differences in nomenclature or edibility classifications; or",
          "subsequently removed or modified by the original source.",
        ],
        "The publication of information on the Website does not constitute an endorsement, certification or guarantee by us of the underlying source or information.",
      ],
    },
    {
      title: "No warranty",
      blocks: [
        "To the maximum extent permitted by applicable law, the Website and its content are provided **“as is” and “as available”**, without warranties or representations of any kind, whether express or implied.",
        "To the maximum extent permitted by applicable law, we do not warrant or represent that:",
        [
          "information is accurate or complete;",
          "information is current or up to date;",
          "information is suitable for any particular purpose;",
          "photographs accurately represent the characteristics of a species;",
          "species names or classifications are current;",
          "edibility or toxicity information is universally applicable;",
          "the Website will be continuously available;",
          "the Website will be free from errors or omissions; or",
          "information obtained from third parties is reliable.",
        ],
      ],
    },
    {
      title: "User responsibility",
      blocks: [
        "Each user is solely responsible for how they use the information available on the Website.",
        "Users expressly acknowledge that they must **not rely on the Website when making decisions concerning the consumption of fungi**.",
        "Users are responsible for obtaining appropriate professional advice where identification, toxicity, edibility or food safety is relevant.",
        "Nothing on the Website replaces professional examination of a physical specimen.",
      ],
    },
    {
      title: "Health and poisoning emergencies",
      blocks: [
        "The Website does not provide medical advice, diagnosis or treatment.",
        "If a person may have consumed a poisonous, unidentified or potentially dangerous fungus, **do not rely on information provided by this Website**.",
        "Seek immediate assistance from the appropriate emergency medical services, poison control centre or other competent healthcare authority.",
        "The absence of a warning concerning a particular fungus on the Website must **never** be interpreted as evidence that the fungus is safe.",
      ],
    },
    {
      title: "Limitation of liability",
      blocks: [
        "To the maximum extent permitted by applicable law, we shall not be liable for losses, damages, costs, expenses or consequences arising out of or relating to:",
        [
          "reliance on information published on the Website;",
          "errors or omissions in the information;",
          "inaccurate or incomplete species identification;",
          "reliance on photographs or visual similarity;",
          "reliance on edibility, toxicity or danger classifications;",
          "the collection, handling, preparation or consumption of fungi;",
          "poisoning, intoxication, allergic reactions or other adverse health effects;",
          "decisions made by users on the basis of Website content;",
          "information obtained from third-party sources;",
          "links to external websites;",
          "interruption or unavailability of the Website;",
          "technical errors or failures; or",
          "any other use or misuse of information made available through the Website.",
        ],
        "This limitation applies to the maximum extent permitted by applicable law and is subject to any rights, remedies, liabilities or protections that cannot lawfully be excluded or limited.",
        "**Nothing in this Disclaimer is intended to exclude or limit liability where such exclusion or limitation is prohibited by applicable law.**",
      ],
    },
    {
      title: "Third-party websites and content",
      blocks: [
        "The Website may display, reproduce, reference or link to information originating from third parties.",
        "Third-party websites and sources are outside our control.",
        "We do not guarantee the accuracy, reliability, completeness, availability or continued existence of third-party information.",
        "A link, citation, photograph, name or other reference to a third-party source does not constitute an endorsement, recommendation or certification of that source or its content.",
        "Users access third-party websites at their own risk and should review the applicable terms and policies of those websites.",
      ],
    },
    {
      title: "Taxonomy and nomenclature",
      blocks: [
        "Scientific names, classifications, taxonomic relationships and common names of fungi may change over time.",
        "Different scientific publications, databases, countries and regions may use different names or classifications for the same organism.",
        "The Website does not guarantee that its nomenclature or taxonomy reflects the most recent scientific consensus.",
        "A change in scientific classification does not necessarily mean that older information has been immediately removed or corrected from every page of the Website.",
      ],
    },
    {
      title: "Photographs and visual content",
      blocks: [
        "Photographs are intended solely to assist with general educational understanding.",
        "Photographs may not show all characteristics necessary for reliable identification, including microscopic, chemical, anatomical, ecological or other diagnostic features.",
        "Images may also vary according to specimen age, environmental conditions, lighting, camera equipment and photographic processing.",
        "**Never use a photograph on the Website as sufficient evidence that a mushroom is safe to eat.**",
      ],
    },
    {
      title: "No duty to update",
      blocks: [
        "Unless expressly stated otherwise, we do not undertake any obligation to continuously monitor, update, correct or supplement information published on the Website.",
        "Information may remain available after it has become outdated or has been superseded by more recent scientific information.",
        "We reserve the right to modify, correct, suspend or remove content at any time and without prior notice.",
      ],
    },
    {
      title: "Reporting errors or safety concerns",
      blocks: [
        "If you believe that information published on the Website is inaccurate, misleading, outdated or potentially dangerous, please report it to:",
        EMAIL,
        "Where appropriate, we may review reported information and make corrections or removals at our discretion.",
        "The submission of a report does not create an obligation to investigate, correct or remove the relevant content within any particular period.",
      ],
    },
    {
      title: "User-submitted content",
      blocks: [
        "If the Website permits users to submit photographs, comments, identifications or other material, users remain solely responsible for the content they submit.",
        "User-submitted content must not be interpreted as information verified or endorsed by us.",
        "We reserve the right to remove, restrict or modify user-submitted content that we consider inaccurate, misleading, unsafe, unlawful or otherwise inappropriate.",
      ],
    },
    {
      title: "Prohibited use",
      blocks: [
        "Users must not use the Website or its content as a substitute for:",
        [
          "professional mycological identification;",
          "food-safety assessment;",
          "medical advice;",
          "emergency medical assistance;",
          "laboratory testing; or",
          "any other professional service.",
        ],
        "Users must not represent information obtained from the Website as professionally verified information.",
      ],
    },
    {
      title: "Assumption of risk",
      blocks: [
        "By using the Website, users acknowledge that information concerning fungi may involve inherent uncertainty and that incorrect identification or incorrect assumptions concerning edibility or toxicity may result in **serious injury, poisoning, permanent health consequences or death**.",
        "Users voluntarily assume responsibility for their use of the information provided through the Website, subject to rights and protections that cannot legally be waived or excluded.",
      ],
    },
    {
      title: "Children and vulnerable users",
      blocks: [
        "The Website is not intended to provide safety or consumption guidance to children.",
        "Parents, guardians and other responsible adults should ensure that children do not use information from the Website to identify or consume wild fungi.",
      ],
    },
    {
      title: "Changes to this Disclaimer",
      blocks: [
        "We may update or modify this Disclaimer from time to time.",
        "The latest version published on the Website will apply from the date indicated at the beginning of the document, subject to applicable law.",
      ],
    },
    {
      title: "Severability",
      blocks: [
        "If any provision of this Disclaimer is found to be invalid, unlawful or unenforceable, that provision shall be enforced to the maximum extent permitted by applicable law and the remaining provisions shall remain in full force and effect, to the extent permitted by law.",
      ],
    },
    {
      title: "Applicable law and mandatory rights",
      blocks: [
        "Nothing in this Disclaimer is intended to deprive users of any mandatory rights or protections available to them under applicable law.",
        "Where mandatory consumer protection provisions apply, those provisions shall prevail over any conflicting provision of this Disclaimer.",
      ],
    },
    {
      title: "Final safety notice",
      blocks: [
        { warning: "Do not eat a fungus based on this Website." },
        "The Website is an informational resource, **not a mushroom identification or food-safety service**.",
        "**If you are not completely certain about the identity and safety of a fungus, do not consume it. Seek professional assistance.**",
        "**In case of suspected poisoning or ingestion of an unidentified or potentially toxic fungus, seek immediate medical or poison-control assistance.**",
      ],
    },
  ],
}

const it: LegalDocument = {
  intro: [
    `${SITE} (il “Sito”, “noi” o “nostro”) fornisce informazioni pubblicamente disponibili sui funghi, tra cui nomi scientifici e comuni, tassonomia, fotografie, descrizioni, commestibilità, tossicità e potenziali pericoli.`,
    "Le informazioni disponibili sul Sito sono fornite **esclusivamente a scopo informativo generale, educativo e di ricerca**.",
  ],
  sections: [
    {
      title: "Avvertenza di sicurezza fondamentale",
      blocks: [
        { warning: "Non usare questo Sito per stabilire se un fungo è sicuro da mangiare." },
        "**Le informazioni fornite su questo Sito non devono mai essere usate come base unica o principale per identificare, raccogliere, preparare o consumare un fungo selvatico.**",
        "**Non mangiare mai un fungo perché sembra corrispondere a una fotografia, una descrizione, un nome di specie o una classificazione di commestibilità presenti su questo Sito.**",
        "Un fungo che sembra corrispondere a una specie descritta come commestibile sul Sito potrebbe in realtà essere:",
        [
          "una specie diversa;",
          "un sosia velenoso o potenzialmente mortale;",
          "identificato in modo errato;",
          "classificato in modo errato;",
          "soggetto a una revisione tassonomica;",
          "rappresentato in modo non corretto da una fotografia;",
          "contaminato, deteriorato o comunque non sicuro da consumare; oppure",
          "non sicuro per una determinata persona o in determinate circostanze.",
        ],
        "**In caso di qualsiasi dubbio sull'identità o sulla sicurezza di un fungo, non consumarlo.**",
        "Per qualsiasi fungo destinato al consumo, gli utenti devono ottenere un'identificazione e una valutazione di sicurezza da un **micologo professionista qualificato o da un altro professionista adeguatamente qualificato**, secondo quanto previsto dalla normativa locale applicabile.",
      ],
    },
    {
      title: "Il Sito non fornisce l'identificazione dei funghi",
      blocks: [
        "Il Sito **non è un servizio di identificazione** e non fornisce alcuna garanzia di identificazione.",
        "Il Sito non esamina esemplari fisici e non è in grado di stabilire, solo da un'immagine o da una descrizione, se un determinato fungo trovato da un utente appartenga a una determinata specie.",
        "Le fotografie presenti sul Sito hanno **esclusivamente funzione illustrativa**.",
        "La somiglianza visiva tra l'esemplare di un utente e un'immagine presente sul Sito **non dimostra che si tratti della stessa specie**.",
        "Gli utenti non devono considerare alcuna corrispondenza di specie, risultato di ricerca, fotografia, descrizione o altra informazione mostrata dal Sito come un'identificazione professionale.",
      ],
    },
    {
      title: "Nessuna garanzia di sicurezza alimentare o di commestibilità",
      blocks: [
        "Qualsiasi indicazione sul fatto che una specie sia descritta come “commestibile”, “velenosa”, “tossica”, “non commestibile”, “pericolosa” o simili è fornita esclusivamente come contenuto informativo generale.",
        "Tali classificazioni:",
        [
          "non sono una certificazione di sicurezza alimentare;",
          "non sono una raccomandazione a consumare la specie;",
          "non costituiscono un'autorizzazione al consumo;",
          "non garantiscono che ogni esemplare della specie sia sicuro da consumare;",
          "non tengono conto delle condizioni, dell'età, della preparazione, della conservazione o della provenienza del singolo esemplare;",
          "possono variare tra fonti o giurisdizioni diverse; e",
          "possono cambiare con l'evoluzione delle conoscenze scientifiche e della tassonomia.",
        ],
        "**La presenza di una classificazione “commestibile” sul Sito non deve mai essere interpretata come un'istruzione, una raccomandazione o un'autorizzazione a consumare un fungo.**",
      ],
    },
    {
      title: "Fonti e informazioni non verificate",
      blocks: [
        "Il Sito aggrega informazioni ottenute da **fonti di terzi pubblicamente accessibili su Internet**.",
        "Salvo diversa indicazione espressa, **non verifichiamo, autentichiamo, convalidiamo, revisioniamo né certifichiamo in modo indipendente** le informazioni ottenute da tali fonti.",
        "Le informazioni possono pertanto essere:",
        [
          "inesatte;",
          "incomplete;",
          "obsolete;",
          "attribuite in modo errato;",
          "incoerenti tra fonti diverse;",
          "influenzate da revisioni tassonomiche;",
          "influenzate da differenze regionali nella nomenclatura o nelle classificazioni di commestibilità; oppure",
          "successivamente rimosse o modificate dalla fonte originale.",
        ],
        "La pubblicazione di informazioni sul Sito non costituisce un'approvazione, una certificazione o una garanzia da parte nostra della fonte o dell'informazione.",
      ],
    },
    {
      title: "Nessuna garanzia",
      blocks: [
        "Nei limiti massimi consentiti dalla legge applicabile, il Sito e i suoi contenuti sono forniti **“così come sono” e “come disponibili”**, senza garanzie o dichiarazioni di alcun tipo, espresse o implicite.",
        "Nei limiti massimi consentiti dalla legge applicabile, non garantiamo né dichiariamo che:",
        [
          "le informazioni siano accurate o complete;",
          "le informazioni siano attuali o aggiornate;",
          "le informazioni siano adatte a uno scopo particolare;",
          "le fotografie rappresentino fedelmente le caratteristiche di una specie;",
          "i nomi delle specie o le classificazioni siano aggiornati;",
          "le informazioni su commestibilità o tossicità siano universalmente applicabili;",
          "il Sito sia disponibile senza interruzioni;",
          "il Sito sia privo di errori od omissioni; oppure",
          "le informazioni ottenute da terzi siano affidabili.",
        ],
      ],
    },
    {
      title: "Responsabilità dell'utente",
      blocks: [
        "Ogni utente è l'unico responsabile dell'uso che fa delle informazioni disponibili sul Sito.",
        "Gli utenti riconoscono espressamente di **non dover fare affidamento sul Sito nel prendere decisioni relative al consumo di funghi**.",
        "Spetta agli utenti ottenere un parere professionale adeguato quando sono in gioco l'identificazione, la tossicità, la commestibilità o la sicurezza alimentare.",
        "Nulla sul Sito sostituisce l'esame professionale di un esemplare fisico.",
      ],
    },
    {
      title: "Salute ed emergenze da avvelenamento",
      blocks: [
        "Il Sito non fornisce consulenza, diagnosi o trattamenti medici.",
        "Se una persona potrebbe aver consumato un fungo velenoso, non identificato o potenzialmente pericoloso, **non fare affidamento sulle informazioni fornite da questo Sito**.",
        "Rivolgiti immediatamente ai servizi di emergenza sanitaria, a un Centro Antiveleni o a un'altra autorità sanitaria competente.",
        "L'assenza di un'avvertenza su un determinato fungo nel Sito non deve **mai** essere interpretata come prova che il fungo sia sicuro.",
      ],
    },
    {
      title: "Limitazione di responsabilità",
      blocks: [
        "Nei limiti massimi consentiti dalla legge applicabile, non saremo responsabili per perdite, danni, costi, spese o conseguenze derivanti da o connessi a:",
        [
          "l'affidamento sulle informazioni pubblicate sul Sito;",
          "errori od omissioni nelle informazioni;",
          "un'identificazione della specie inesatta o incompleta;",
          "l'affidamento su fotografie o somiglianze visive;",
          "l'affidamento su classificazioni di commestibilità, tossicità o pericolosità;",
          "la raccolta, la manipolazione, la preparazione o il consumo di funghi;",
          "avvelenamenti, intossicazioni, reazioni allergiche o altri effetti negativi sulla salute;",
          "decisioni prese dagli utenti sulla base dei contenuti del Sito;",
          "informazioni ottenute da fonti di terzi;",
          "link a siti web esterni;",
          "l'interruzione o l'indisponibilità del Sito;",
          "errori o malfunzionamenti tecnici; oppure",
          "qualsiasi altro uso o uso improprio delle informazioni rese disponibili tramite il Sito.",
        ],
        "Questa limitazione si applica nei limiti massimi consentiti dalla legge applicabile e fatti salvi i diritti, i rimedi, le responsabilità o le tutele che non possono essere legittimamente esclusi o limitati.",
        "**Nulla nel presente Disclaimer intende escludere o limitare la responsabilità nei casi in cui tale esclusione o limitazione sia vietata dalla legge applicabile.**",
      ],
    },
    {
      title: "Siti web e contenuti di terzi",
      blocks: [
        "Il Sito può mostrare, riprodurre, citare o collegarsi a informazioni provenienti da terzi.",
        "I siti web e le fonti di terzi sono al di fuori del nostro controllo.",
        "Non garantiamo l'accuratezza, l'affidabilità, la completezza, la disponibilità o la continuità delle informazioni di terzi.",
        "Un link, una citazione, una fotografia, un nome o un altro riferimento a una fonte di terzi non costituisce un'approvazione, una raccomandazione o una certificazione di tale fonte o dei suoi contenuti.",
        "Gli utenti accedono ai siti web di terzi a proprio rischio e dovrebbero consultarne i termini e le condizioni applicabili.",
      ],
    },
    {
      title: "Tassonomia e nomenclatura",
      blocks: [
        "I nomi scientifici, le classificazioni, le relazioni tassonomiche e i nomi comuni dei funghi possono cambiare nel tempo.",
        "Pubblicazioni scientifiche, banche dati, paesi e regioni diversi possono usare nomi o classificazioni differenti per lo stesso organismo.",
        "Il Sito non garantisce che la propria nomenclatura o tassonomia rifletta il consenso scientifico più recente.",
        "Una modifica della classificazione scientifica non comporta necessariamente che le informazioni precedenti siano state immediatamente rimosse o corrette da ogni pagina del Sito.",
      ],
    },
    {
      title: "Fotografie e contenuti visivi",
      blocks: [
        "Le fotografie hanno il solo scopo di favorire una comprensione generale a fini educativi.",
        "Le fotografie potrebbero non mostrare tutte le caratteristiche necessarie per un'identificazione affidabile, comprese quelle microscopiche, chimiche, anatomiche, ecologiche o altre caratteristiche diagnostiche.",
        "Le immagini possono inoltre variare in base all'età dell'esemplare, alle condizioni ambientali, all'illuminazione, all'attrezzatura fotografica e all'elaborazione dell'immagine.",
        "**Non usare mai una fotografia presente sul Sito come prova sufficiente che un fungo sia sicuro da mangiare.**",
      ],
    },
    {
      title: "Nessun obbligo di aggiornamento",
      blocks: [
        "Salvo diversa indicazione espressa, non assumiamo alcun obbligo di monitorare, aggiornare, correggere o integrare costantemente le informazioni pubblicate sul Sito.",
        "Le informazioni possono rimanere disponibili anche dopo essere diventate obsolete o superate da informazioni scientifiche più recenti.",
        "Ci riserviamo il diritto di modificare, correggere, sospendere o rimuovere contenuti in qualsiasi momento e senza preavviso.",
      ],
    },
    {
      title: "Segnalazione di errori o problemi di sicurezza",
      blocks: [
        "Se ritieni che un'informazione pubblicata sul Sito sia inesatta, fuorviante, obsoleta o potenzialmente pericolosa, segnalala a:",
        EMAIL,
        "Ove opportuno, potremo esaminare le informazioni segnalate ed effettuare correzioni o rimozioni a nostra discrezione.",
        "L'invio di una segnalazione non crea alcun obbligo di verificare, correggere o rimuovere il contenuto in questione entro un determinato periodo.",
      ],
    },
    {
      title: "Contenuti inviati dagli utenti",
      blocks: [
        "Se il Sito consente agli utenti di inviare fotografie, commenti, identificazioni o altro materiale, gli utenti restano gli unici responsabili dei contenuti che inviano.",
        "I contenuti inviati dagli utenti non devono essere interpretati come informazioni verificate o approvate da noi.",
        "Ci riserviamo il diritto di rimuovere, limitare o modificare i contenuti inviati dagli utenti che riteniamo inesatti, fuorvianti, non sicuri, illeciti o comunque inappropriati.",
      ],
    },
    {
      title: "Usi vietati",
      blocks: [
        "Gli utenti non devono usare il Sito o i suoi contenuti in sostituzione di:",
        [
          "un'identificazione micologica professionale;",
          "una valutazione di sicurezza alimentare;",
          "una consulenza medica;",
          "un'assistenza medica d'urgenza;",
          "analisi di laboratorio; oppure",
          "qualsiasi altro servizio professionale.",
        ],
        "Gli utenti non devono presentare le informazioni ottenute dal Sito come informazioni verificate da professionisti.",
      ],
    },
    {
      title: "Assunzione del rischio",
      blocks: [
        "Usando il Sito, gli utenti riconoscono che le informazioni sui funghi possono comportare un'incertezza intrinseca e che un'identificazione errata o supposizioni errate sulla commestibilità o sulla tossicità possono causare **lesioni gravi, avvelenamenti, danni permanenti alla salute o la morte**.",
        "Gli utenti si assumono volontariamente la responsabilità dell'uso che fanno delle informazioni fornite tramite il Sito, fatti salvi i diritti e le tutele a cui non è possibile rinunciare o che non possono essere esclusi per legge.",
      ],
    },
    {
      title: "Minori e utenti vulnerabili",
      blocks: [
        "Il Sito non è destinato a fornire indicazioni di sicurezza o sul consumo ai minori.",
        "Genitori, tutori e altri adulti responsabili devono assicurarsi che i minori non usino le informazioni del Sito per identificare o consumare funghi selvatici.",
      ],
    },
    {
      title: "Modifiche al presente Disclaimer",
      blocks: [
        "Potremo aggiornare o modificare il presente Disclaimer di tanto in tanto.",
        "L'ultima versione pubblicata sul Sito si applica a partire dalla data indicata all'inizio del documento, nel rispetto della legge applicabile.",
      ],
    },
    {
      title: "Clausola di salvaguardia",
      blocks: [
        "Se una qualsiasi disposizione del presente Disclaimer risultasse invalida, illecita o inapplicabile, tale disposizione sarà applicata nei limiti massimi consentiti dalla legge applicabile e le restanti disposizioni rimarranno pienamente valide ed efficaci, nei limiti consentiti dalla legge.",
      ],
    },
    {
      title: "Legge applicabile e diritti inderogabili",
      blocks: [
        "Nulla nel presente Disclaimer intende privare gli utenti dei diritti o delle tutele inderogabili a loro disposizione ai sensi della legge applicabile.",
        "Ove si applichino disposizioni inderogabili a tutela dei consumatori, tali disposizioni prevalgono su qualsiasi disposizione contrastante del presente Disclaimer.",
      ],
    },
    {
      title: "Avviso finale di sicurezza",
      blocks: [
        { warning: "Non mangiare un fungo basandoti su questo Sito." },
        "Il Sito è una risorsa informativa, **non un servizio di identificazione dei funghi né di sicurezza alimentare**.",
        "**Se non sei del tutto certo dell'identità e della sicurezza di un fungo, non consumarlo. Rivolgiti a un professionista.**",
        "**In caso di sospetto avvelenamento o di ingestione di un fungo non identificato o potenzialmente tossico, rivolgiti immediatamente a un medico o a un Centro Antiveleni.**",
      ],
    },
  ],
}

export const DISCLAIMER: Record<Locale, LegalDocument> = { en, it }
