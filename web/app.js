"use strict";

// Le chiavi del localStorage stanno in cima perche' `caricaAsta()` gira gia'
// alla riga sotto: dichiarate piu' avanti sarebbero ancora nella zona morta.
const CHIAVE_ASTA = "asta-mantra";
const CHIAVE_COPIA = "asta-mantra-copia";      // vedi copiaDiSicurezza()
const CHIAVE_PREFERITI = "preferiti-mantra";
const CHIAVE_RISERVA = "riserva-mantra";

// Di quanto devono distare le due fonti di titolarita' perche' valga la pena
// mostrarle tutte e due in colonna. Stesso valore di SCARTO_NOTEVOLE in
// build.py: se cambia li' va cambiato anche qui.
const SCARTO_TITOLARITA = 0.20;

// Stato dell'applicazione. `asta` e' l'unica cosa che sopravvive al ricaricamento:
// durante un'asta vera il browser non deve poter perdere gli acquisti fatti.
let DATI = null;
let BLOCCHI = [];
let aBlocchi = false;
let asta = caricaAsta();
let preferiti = caricaPreferiti();
let riserva = caricaRiserva();

const stato = {
  vista: "listone",
  ricerca: [],
  macro: "",
  mantra: "",
  squadra: "",
  prezzoMin: null,
  prezzoMax: null,
  soloPreferiti: false,
  soloOccasioni: false,
  nascondiPresi: false,
  fasce: false,
  prezziLive: localStorage.getItem("prezzi-live") === "1",
  // acceso di default: a rosa vuota i due tetti coincidono, quindi non cambia
  // niente finche' non compri, e da li' in poi e' quello che serve vedere
  prezziRosa: localStorage.getItem("prezzi-rosa") !== "0",
  ordine: { campo: "prezzo_consigliato", crescente: false },
};

const NOMI_MACRO = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
const FRA_I = { P: "fra i portieri", D: "fra i difensori", C: "fra i centrocampisti", A: "fra gli attaccanti" };
const NOMI_MANTRA = {
  por: "Portiere", dc: "Difensore centrale", dd: "Terzino destro", ds: "Terzino sinistro",
  b: "Braccetto", e: "Esterno", m: "Mediano", c: "Centrocampista", w: "Ala",
  t: "Trequartista", a: "Attaccante", pc: "Punta centrale",
};
// Gli undici moduli ammessi in Mantra, edizione 2025/26. Ogni voce elenca le
// dieci caselle di movimento: il portiere non c'e' perche' e' uno e lo copre
// il blocco. Una casella come "dc/b" accetta un difensore centrale o un
// braccetto, "t/a/pc" tutti e tre.
const MODULI = {
  "3-4-3":   ["dc", "dc", "dc/b", "e", "m/c", "c", "e", "w/a", "w/a", "a/pc"],
  "3-4-1-2": ["dc", "dc", "dc/b", "e", "m/c", "c", "e", "t", "a/pc", "a/pc"],
  "3-4-2-1": ["dc", "dc", "dc/b", "m", "m/c", "e", "e/w", "t", "t/a", "a/pc"],
  "3-5-2":   ["dc", "dc", "dc/b", "m", "m/c", "e", "e/w", "c", "a/pc", "a/pc"],
  "3-5-1-1": ["dc", "dc", "dc/b", "m", "m", "c", "e/w", "e/w", "t/a", "a/pc"],
  "4-3-3":   ["dd", "dc", "dc", "ds", "m/c", "m", "c", "w/a", "w/a", "a/pc"],
  "4-3-1-2": ["dd", "dc", "dc", "ds", "m/c", "m", "c", "t", "t/a/pc", "a/pc"],
  "4-4-2":   ["dd", "dc", "dc", "ds", "m/c", "c", "e", "e/w", "a/pc", "a/pc"],
  "4-1-4-1": ["dd", "dc", "dc", "ds", "m", "c/t", "t", "e/w", "w", "a/pc"],
  "4-4-1-1": ["dd", "dc", "dc", "ds", "m", "c", "e/w", "e/w", "t/a", "a/pc"],
  "4-2-3-1": ["dd", "dc", "dc", "ds", "m", "m/c", "w/t", "t", "w/a", "a/pc"],
};

// I dodici ruoli mantra si raggruppano nei cinque colori usati da fantacalcio.it:
// porta, difesa, centrocampo, esterni offensivi, attacco. L'esterno (e) è
// colorato come il centrocampo, l'ala (w) come il trequartista.
const COLORE_RUOLO = {
  por: "P",
  dd: "D", dc: "D", ds: "D", b: "D",
  e: "C", m: "C", c: "C",
  t: "W", w: "W",
  a: "A", pc: "A",
};

// ------------------------------------------------------------- prezzi live
//
// I prezzi consigliati sono calcolati a budget pieno: valgono al primo
// rilancio. Durante l'asta il rapporto fra i crediti ancora in mano ai
// partecipanti e il valore ancora sul piatto si sposta, e sposta i prezzi:
// se la lega ha speso troppo presto, quello che resta si compra a sconto.
//
// Crediti spesi e valore residuo vanno misurati con lo stesso metro, ed e'
// il prezzo di mercato: e' quello che stima cosa assorbira' ogni giocatore.
// Il metro va pero' riportato sulla scala del budget, perche' la somma dei
// prezzi di mercato non coincide con i crediti che esistono davvero (li
// supera di parecchio: sono due grandezze costruite in modo diverso, una
// stima per giocatore e un totale da distribuire). Senza questa scala il
// fattore scivolerebbe sotto 1 anche in un'asta che va esattamente come
// previsto, che e' il modo peggiore di sbagliare.
let SCALA_ATTESA = 1;

// Tutto cio' che si compra all'asta, giocatori di movimento e blocchi
// portieri, con la chiave con cui compare in `asta`: attingono allo stesso
// budget e vanno contati insieme.
function vociAcquistabili() {
  const voci = [];
  for (const g of DATI.giocatori) {
    if (g.acquisto_a_blocchi) continue;
    const attesa = g.prezzo_mercato ?? g.prezzo_consigliato;
    if (attesa === null || attesa === undefined) continue;
    voci.push({ chiave: g.id, attesa });
  }
  // i blocchi non hanno un prezzo di mercato proprio: il listino quota i
  // portieri singolarmente, che con questa regola non vuol dire niente
  for (const b of BLOCCHI) {
    voci.push({ chiave: "blocco:" + b.squadra, attesa: b.prezzo_consigliato });
  }
  return voci;
}

function preparaMercato() {
  const totale = vociAcquistabili().reduce((s, v) => s + v.attesa, 0);
  SCALA_ATTESA = totale > 0 ? DATI.riepilogo.budget_totale / totale : 1;
}

// Quanto si e' mosso il mercato: 1 = l'asta sta andando come previsto,
// sotto 1 = restano meno crediti di quanto vale la roba ancora libera e
// quindi quello che manca si comprera' a sconto.
function scostamentoMercato() {
  const speso = Object.values(asta).reduce((s, v) => s + (v.prezzo || 0), 0);
  const crediti = DATI.riepilogo.budget_totale - speso;
  const residuo = vociAcquistabili()
    .filter((v) => !asta[v.chiave])
    .reduce((s, v) => s + v.attesa, 0) * SCALA_ATTESA;
  if (crediti <= 0 || residuo <= 0) return 1;
  // gli estremi servono solo a non mostrare numeri assurdi quando l'asta e'
  // registrata a meta': il fattore vero non arriva mai a tanto
  return Math.min(2.5, Math.max(0.4, crediti / residuo));
}

function fattoreLive() {
  return stato.prezziLive ? scostamentoMercato() : 1;
}

const vivo = (v, f) => (v === null || v === undefined ? null : v * f);

// -------------------------------------------- la scarsita' dentro la casella
//
// Il fattore qui sopra e' globale: dice se in lega restano piu' crediti o piu'
// roba, e muove tutti i prezzi insieme. Ma un'asta non si svuota in modo
// uniforme. Se le punte centrali buone finiscono e i difensori no, le ultime
// punte si pagano care e i difensori no -- ed e' li' che si buttano crediti,
// perche' il listone continua a mostrare il prezzo di partenza di una casella
// che ormai non ha piu' alternative.
//
// Il conto giusto non e' *quanti* ne restano ma **quanto si scende quando
// finiscono**. Contare e basta -- domanda contro offerta dentro il ruolo --
// e' stato provato e sbaglia: dava lo stesso rincaro secco ai difensori
// centrali, dove sotto il tier c'e' un altro centrale che vale uguale e
// nessuno rilancia di un credito. La scarsita' morde solo se sotto c'e' un
// salto, e il salto e' esattamente quello che le fasce misurano gia': un
// confine di fascia e' un calo di prezzo del 15% o piu' (fanta/motore.py).
//
//   premio(fascia) = salto sotto la fascia  ×  quanta ne e' gia' sparita
//
// Il salto e' la caduta dal fondo della fascia al miglior giocatore ancora
// libero piu' in basso in quella casella: e' quello che ti tocca prendere se
// resti senza. La quota e' la frazione gia' comprata. Il prodotto vale
// **esattamente zero ad asta vuota** -- nessuno e' ancora sparito -- che e' la
// condizione al contorno giusta: il prezzo di mercato di agosto la contesa
// prevista se la porta gia' dentro, e contarla due volte gonfierebbe il
// listone prima di cominciare.
//
// Quello che ne esce e' il comportamento vero delle due code. Fra le punte
// centrali la prima fascia sono Martinez e Malen e sotto c'e' un burrone di 81
// crediti: appena ne va uno, l'altro rincara di quaranta. Fra i centrali la
// seconda fascia ne ha otto e sotto ce n'e' un nono che vale cinque crediti
// meno: puoi perderne sette e il premio resta di quattro crediti. Non e' una
// taratura, e' la forma dei due ruoli.
//
// Non tocca il tetto, e non e' una dimenticanza: che gli altri paghino di piu'
// le ultime due punte non le rende piu' utili al tuo undici. Sposta il numero
// di sinistra -- quanto costera' -- e quindi il punto in cui i due si
// incrociano e la colonna smette di dire "conviene". La conclusione operativa
// di una casella che si sta svuotando e' comprare prima, non rilanciare di piu'.

let _premi = null;

function premiScarsita() {
  if (_premi) return _premi;
  const per = {};   // ruolo -> fascia -> { totale, presi, giu: [valori liberi sotto] }
  for (const g of DATI.giocatori) {
    if (!g.fasce || g.acquisto_a_blocchi) continue;
    if (g.prezzo_consigliato === null || g.prezzo_consigliato === undefined) continue;
    for (const [ruolo, fascia] of Object.entries(g.fasce)) {
      const r = per[ruolo] || (per[ruolo] = {});
      const v = r[fascia] || (r[fascia] = { totale: 0, presi: 0, fondo: Infinity, liberi: 0 });
      v.totale++;
      if (asta[g.id]) v.presi++; else { v.liberi++; }
      if (g.prezzo_consigliato < v.fondo) v.fondo = g.prezzo_consigliato;
    }
  }

  const dati = {};
  for (const [ruolo, fasce] of Object.entries(per)) {
    // il miglior giocatore ancora libero di ogni fascia: e' il ripiego a cui
    // scendi se quella sopra si svuota
    const meglio = {};
    for (const g of DATI.giocatori) {
      if (!g.fasce || g.acquisto_a_blocchi || asta[g.id]) continue;
      const f = g.fasce[ruolo];
      if (f === undefined) continue;
      if (!(f in meglio) || g.prezzo_consigliato > meglio[f]) meglio[f] = g.prezzo_consigliato;
    }
    // le fasce si leggono dalla piu' cara alla piu' povera; la 0 e' il
    // riempimento e va in fondo
    const ordine = Object.keys(fasce).map(Number)
      .sort((a, b) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b));

    dati[ruolo] = {};
    for (let i = 0; i < ordine.length; i++) {
      const f = ordine[i];
      const v = fasce[f];
      // il riempimento non ha un sotto: sotto c'e' il credito singolo, e per
      // quello nessuno rilancia
      if (f === 0) { dati[ruolo][f] = { premio: 0, salto: 0, quota: 0, ...v }; continue; }
      let sotto = 1;
      for (let j = i + 1; j < ordine.length; j++) {
        const m = meglio[ordine[j]];
        if (m !== undefined) { sotto = m; break; }
      }
      const salto = Math.max(0, v.fondo - sotto);
      const quota = v.totale > 0 ? v.presi / v.totale : 0;
      dati[ruolo][f] = { premio: salto * quota, salto, quota, ...v };
    }
  }
  return (_premi = dati);
}

// Chi copre due caselle se le contende tutte e due, e a spingere il prezzo e'
// quella piu' svuotata: e' li' che qualcuno resta senza, e chi resta senza
// rilancia.
function premioScarsita(g, f = 1) {
  if (!stato.prezziLive || !g.fasce) return 0;
  // Chi e' gia' stato venduto non ha piu' un prezzo futuro: il suo e' un fatto,
  // non una previsione. Senza questo la riga di chi ha appena svuotato la
  // fascia si gonfiava del premio che ha causato lui stesso, e in tabella
  // sembrava ancora da prendere a una cifra che non esiste.
  if (asta[g.id]) return 0;
  const dati = premiScarsita();
  let premio = 0;
  // `for..in` invece di Object.entries: questa gira due o tre volte per riga,
  // cioe' oltre mille volte a ridisegno, e la tupla allocata ogni giro si
  // vedeva nel profilo
  for (const ruolo in g.fasce) {
    const v = (dati[ruolo] || {})[g.fasce[ruolo]];
    if (v && v.premio > premio) premio = v.premio;
  }
  return premio * f;
}

// Quanto costera' davvero: il prezzo di mercato portato ai crediti di adesso e
// alla scarsita' della sua casella. E' il numero di sinistra della colonna
// Conviene, quello che si confronta col tetto -- e l'unico posto dove la
// scarsita' ha diritto di entrare.
function costoAtteso(g, f = 1) {
  const v = vivo(g.portieri ? g.quotazione_scalata : g.prezzo_mercato, f);
  return v === null ? null : v + premioScarsita(g, f);
}

// ---------------------------------------------------------------- avvio

async function avvia() {
  const risposta = await fetch("../data/processed/listone.json");
  if (!risposta.ok) {
    document.getElementById("sottotitolo").textContent =
      "dati non trovati: esegui prima  python3 -m fanta.build";
    return;
  }
  DATI = await risposta.json();
  BLOCCHI = DATI.riepilogo.blocchi_portieri || [];
  aBlocchi = BLOCCHI.length > 0;

  // campi appiattiti per poter ordinare la tabella delle statistiche avanzate
  for (const g of DATI.giocatori) {
    const u = g.understat;
    if (u) {
      g.u_minuti = u.minuti; g.u_gol = u.gol; g.u_xg = u.xg; g.u_assist = u.assist;
      g.u_xa = u.xa; g.u_tiri = u.tiri; g.u_kp = u.key_passes;
      g.u_diff_gol = u.gol - u.xg;
      g.u_xg90 = u.novanta > 0 ? u.xg / u.novanta : 0;
    }
  }

  preparaMercato();
  preparaRicerca();
  migraAsta();
  misuraCornice();
  preparaIntestazione();
  preparaLegenda();
  preparaFiltri();
  collegaEventi();
  disegna();
}

// Le aste registrate prima dei prezzi live segnavano a zero tutto quello che
// avevano preso gli altri. Lasciarlo a zero direbbe al fattore di mercato che
// in lega non e' stato speso niente, che e' l'errore peggiore possibile:
// meglio la stima di listino, marcata come tale.
function migraAsta() {
  let cambiato = false;
  for (const [chiave, v] of Object.entries(asta)) {
    if (v.mio || v.stimato || v.prezzo) continue;
    v.prezzo = stimaNeutra(chiave);
    v.stimato = true;
    cambiato = true;
  }
  if (cambiato) salvaAsta();
}

// Quanto ci si aspetta che vada via, negli stessi crediti che si leggono
// nella colonna "Costerà": serve come proposta nel prompt e come ripiego
// quando il prezzo pagato dagli altri non si sa.
function prezzoAtteso(chiave) {
  const voce = vociAcquistabili().find((v) => v.chiave === chiave);
  return voce ? voce.attesa : 0;
}

// Quanto registrare quando il prezzo pagato dagli altri non si sa. Non e' il
// prezzo di mercato grezzo: quello, sommato su tutti, chiede piu' crediti di
// quanti ne esistano, e usarlo trascinerebbe il fattore verso il basso a ogni
// acquisto ignoto. Questa e' la stessa cifra riportata sulla scala del
// budget, l'unica che lascia il mercato dov'e': non sapere non e' notizia.
function stimaNeutra(chiave) {
  return Math.round(prezzoAtteso(chiave) * SCALA_ATTESA);
}

// Quanto e' alta la cornice appiccicata in cima: testata piu' barra dell'asta.
// Il CSS ci incolla sotto l'intestazione della tabella, e i due numeri non si
// possono scrivere a mano perche' cambiano quando la testata va a capo -- a
// 1200px di larghezza le schede scendono su una seconda riga e la testata
// cresce di venti pixel. Scritti a mano erano gia' sbagliati di 4px, e mentre
// scorrevi passava una striscia di riga sopra i nomi delle colonne.
let _osservatore = null;
let _misuraInCoda = false;

function misuraCornice() {
  for (const [nome, sel] of [["testata", ".testata"], ["barra", ".barra-asta"]]) {
    const el = document.querySelector(sel);
    if (el) {
      document.documentElement.style.setProperty(
        `--h-${nome}`, `${Math.round(el.getBoundingClientRect().height)}px`
      );
    }
  }

  // Il ResizeObserver e' il meccanismo giusto e prende anche il caso che gli
  // altri non vedono -- la barra che si allunga da sola quando i conteggi per
  // ruolo passano a due cifre -- ma i suoi richiami viaggiano col ciclo di
  // rendering, e in una scheda che non disegna non arrivano mai (misurato:
  // altezza da 82 a 112 pixel, zero richiami). Il resize della finestra fa da
  // rete, e il ridisegno da rete alla rete.
  if (_osservatore) return;
  window.addEventListener("resize", misuraCornice);
  if (window.ResizeObserver) {
    _osservatore = new ResizeObserver(() => misuraCornice());
    document.querySelectorAll(".testata, .barra-asta")
      .forEach((el) => _osservatore.observe(el));
  } else {
    _osservatore = true;   // basta il resize della finestra
  }
}

// Da chiamare dopo aver riscritto la barra. Misurare li' per li' costava 476
// millisecondi a ridisegno -- leggere un'altezza a meta' aggiornamento obbliga
// il browser a ricalcolare il layout di 449 righe, e `disegna()` gira a ogni
// tasto premuto nella ricerca. Dentro il frame quel calcolo il browser lo fa
// comunque, quindi la misura torna a costare quanto deve: niente.
function programmaMisuraCornice() {
  if (_misuraInCoda || !window.requestAnimationFrame) return;
  _misuraInCoda = true;
  requestAnimationFrame(() => {
    _misuraInCoda = false;
    misuraCornice();
  });
}

function preparaIntestazione() {
  const r = DATI.riepilogo;
  const data = new Date(r.generato_il).toLocaleString("it-IT", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  document.getElementById("sottotitolo").textContent =
    `${r.stagione} · ${r.giocatori_totali} giocatori · lega da ${r.lega.n_squadre} squadre ` +
    `× ${r.lega.crediti_iniziali} crediti · aggiornato il ${data}`;
}

function preparaLegenda() {
  const usati = new Set();
  DATI.giocatori.forEach((g) => g.ruoli_mantra.forEach((r) => usati.add(r)));
  document.getElementById("elenco-ruoli").innerHTML = Object.entries(NOMI_MANTRA)
    .filter(([r]) => usati.has(r))
    .map(([r, nome]) => `<li><code class="r-${COLORE_RUOLO[r]}">${r}</code>${nome}</li>`)
    .join("");

  const legenda = document.getElementById("legenda");
  if (localStorage.getItem("legenda-chiusa") !== "1") legenda.open = true;
  legenda.addEventListener("toggle", () =>
    localStorage.setItem("legenda-chiusa", legenda.open ? "0" : "1")
  );
}

function preparaFiltri() {
  const contenitore = document.getElementById("filtro-macro");
  // con i portieri a blocchi il filtro P non ha senso: hanno una scheda a parte
  const macro = aBlocchi
    ? [["", "Tutti"], ["D", "D"], ["C", "C"], ["A", "A"]]
    : [["", "Tutti"], ["P", "P"], ["D", "D"], ["C", "C"], ["A", "A"]];
  for (const [chiave, nome] of macro) {
    const b = document.createElement("button");
    b.className = "bottone-ruolo" + (chiave === "" ? " attivo" : "");
    b.textContent = nome;
    b.dataset.macro = chiave;
    contenitore.appendChild(b);
  }

  const usati = new Set();
  DATI.giocatori
    .filter((g) => !(aBlocchi && g.ruolo_classic === "P"))
    .forEach((g) => g.ruoli_mantra.forEach((r) => usati.add(r)));
  const selMantra = document.getElementById("filtro-mantra");
  for (const r of Object.keys(NOMI_MANTRA).filter((r) => usati.has(r))) {
    selMantra.insertAdjacentHTML("beforeend", `<option value="${r}">${NOMI_MANTRA[r]}</option>`);
  }

  if (aBlocchi) {
    document.getElementById("scheda-portieri").classList.remove("nascosto");
    const lega = DATI.riepilogo.lega;
    const quota = Math.round((DATI.riepilogo.quota_budget_portieri || 0) * 100);
    document.getElementById("nota-blocchi").innerHTML =
      `Nella tua lega i portieri si comprano a blocchi: chi prende un portiere prende tutti quelli
       della sua squadra. Ogni partecipante si aggiudica <strong>${lega.blocchi_per_squadra} blocchi</strong>
       e i ${BLOCCHI.length} disponibili vengono assegnati tutti, quindi l'alternativa a un blocco
       conteso non è restare senza portiere ma prendersi il peggiore: è quello il metro di paragone.
       Il valore di un blocco è la fantamedia della porta su tutte e 38 le giornate, pesata su quanto
       ci si aspetta che giochi ciascun portiere.
       <br><br>Complessivamente i blocchi valgono circa il <strong>${quota}% del budget</strong> della lega:
       con questa regola i portieri costano molto meno che in un'asta normale, perché comprando il
       blocco il rischio infortunio è già coperto e nessun titolare è un bene scarso. Per questo lo
       <strong>scarto qui confronta i blocchi fra loro</strong>, non con le quotazioni ufficiali, che
       presuppongono l'acquisto individuale.`;
  }

  const squadre = [...new Set(DATI.giocatori.map((g) => g.squadra))].sort();
  const selSquadra = document.getElementById("filtro-squadra");
  for (const s of squadre) {
    selSquadra.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
  }
}

function collegaEventi() {
  document.querySelectorAll(".scheda").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".scheda").forEach((x) => x.classList.remove("attiva"));
      b.classList.add("attiva");
      stato.vista = b.dataset.vista;
      disegna();
    })
  );

  document.getElementById("filtro-macro").addEventListener("click", (e) => {
    const b = e.target.closest(".bottone-ruolo");
    if (!b) return;
    document.querySelectorAll(".bottone-ruolo").forEach((x) => x.classList.remove("attivo"));
    b.classList.add("attivo");
    stato.macro = b.dataset.macro;
    disegna();
  });

  document.getElementById("ricerca").addEventListener("input", (e) => {
    // a pezzi, cosi' "lautaro inter" trova anche se le due parole nel nome
    // non sono attaccate
    stato.ricerca = normalizza(e.target.value).split(" ").filter(Boolean);
    disegna();
  });
  document.getElementById("filtro-mantra").addEventListener("change", (e) => {
    stato.mantra = e.target.value; disegna();
  });
  document.getElementById("filtro-squadra").addEventListener("change", (e) => {
    stato.squadra = e.target.value; disegna();
  });
  const leggiPrezzo = (e) => {
    const v = parseFloat(e.target.value);
    stato[e.target.id === "prezzo-min" ? "prezzoMin" : "prezzoMax"] =
      Number.isNaN(v) ? null : v;
    disegna();
  };
  document.getElementById("prezzo-min").addEventListener("input", leggiPrezzo);
  document.getElementById("prezzo-max").addEventListener("input", leggiPrezzo);

  document.getElementById("solo-preferiti").addEventListener("change", (e) => {
    stato.soloPreferiti = e.target.checked; disegna();
  });
  document.getElementById("solo-occasioni").addEventListener("change", (e) => {
    stato.soloOccasioni = e.target.checked; disegna();
  });
  document.getElementById("nascondi-presi").addEventListener("change", (e) => {
    stato.nascondiPresi = e.target.checked; disegna();
  });

  document.getElementById("mostra-fasce").addEventListener("change", (e) => {
    stato.fasce = e.target.checked; disegna();
  });

  const live = document.getElementById("prezzi-live");
  live.checked = stato.prezziLive;
  live.addEventListener("change", (e) => {
    stato.prezziLive = e.target.checked;
    localStorage.setItem("prezzi-live", stato.prezziLive ? "1" : "0");
    invalidaRosa();   // i costi del piano sono in crediti di adesso
    disegna();
  });

  const rosa = document.getElementById("prezzi-rosa");
  rosa.checked = stato.prezziRosa;
  rosa.addEventListener("change", (e) => {
    stato.prezziRosa = e.target.checked;
    localStorage.setItem("prezzi-rosa", stato.prezziRosa ? "1" : "0");
    disegna();
  });

  const campoRiserva = document.getElementById("riserva-crediti");
  campoRiserva.value = riserva;
  campoRiserva.addEventListener("change", (e) => {
    const messo = impostaRiserva(parseInt(e.target.value, 10));
    e.target.value = messo;        // rimette il valore se l'ho tagliato al tetto
    descriviRiserva();
    disegna();                     // i tetti cambiano su tutto il listone
  });
  descriviRiserva();

  document.querySelectorAll("th[data-ordina]").forEach((th) =>
    th.addEventListener("click", () => {
      const campo = th.dataset.ordina;
      if (stato.ordine.campo === campo) stato.ordine.crescente = !stato.ordine.crescente;
      else stato.ordine = { campo, crescente: false };
      stato.ordineScelto = true;   // da qui comanda la tua colonna
      disegna();
    })
  );

  document.getElementById("chiudi-pannello").addEventListener("click", chiudiPannello);
  document.getElementById("velo").addEventListener("click", chiudiPannello);

  // Invio sulla ricerca apre il primo risultato: all'asta il nome lo senti e
  // lo cerchi, e quasi sempre il primo della lista e' quello giusto.
  document.getElementById("ricerca").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const prima = document.querySelector("#tabella-listone tbody tr[data-id]");
    if (prima) apriPannello(prima.dataset.id);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { chiudiPannello(); return; }
    // "/" porta sulla ricerca, ma non mentre stai scrivendo da qualche parte
    if (e.key === "/" && !scrivendo(e.target)) {
      e.preventDefault();
      const ricerca = document.getElementById("ricerca");
      ricerca.focus();
      ricerca.select();
    }
  });
  document.getElementById("azzera-asta").addEventListener("click", chiediAzzeramento);
  document.getElementById("esporta-asta").addEventListener("click", esportaAsta);

  const file = document.getElementById("file-asta");
  document.getElementById("ricarica-asta").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    if (file.files[0]) apriFileAsta(file.files[0]);
    // senza questo, riscegliere lo stesso file una seconda volta non scatena
    // nessun evento e il bottone sembra rotto
    file.value = "";
  });
}

// ---------------------------------------------------------------- ricerca
//
// All'asta il banditore urla un nome e hai tre secondi: quello che scrivi non
// e' quello che c'e' scritto nel listino. Scrivi "lautaro" e il listino dice
// "Martinez L."; scrivi "ndicka" e il listino dice "N'Dicka"; scrivi "soule" e
// il listino dice "Soule'". Quindi accenti, apostrofi e puntini spariscono da
// entrambe le parti del confronto, e nell'indice finisce anche il nome per
// esteso che usa Understat, che e' quello con cui i giocatori si chiamano.
//
// Le lettere che non sono accenti ma lettere a se' (la o barrata di Hojlund,
// la d slava) vanno tradotte a mano: NFD non le scompone, resterebbero tali e
// quali e nessuno le scrive.
const LETTERE_PROPRIE = { "ø": "o", "đ": "d", "ł": "l", "æ": "ae", "œ": "oe", "ß": "ss", "ð": "d", "þ": "th" };

function normalizza(testo) {
  return (testo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[øđłæœßðþ]/g, (c) => LETTERE_PROPRIE[c])
    // l'apostrofo sparisce e non diventa spazio: "N'Dicka" si cerca
    // scrivendo "ndicka", non "n dicka"
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// L'indice si costruisce una volta sola: normalizzare 500 nomi a ogni tasto
// premuto sarebbe lavoro buttato mentre stai cercando in fretta.
function preparaRicerca() {
  for (const g of DATI.giocatori) {
    const pezzi = [g.nome, g.squadra];
    if (g.understat) pezzi.push(g.understat.nome, g.understat.squadra);
    g._cerca = normalizza(pezzi.join(" "));
  }
}

const scrivendo = (el) =>
  !!el && (el.isContentEditable ||
           ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

// ---------------------------------------------------------------- filtri e ordinamento

function filtrati() {
  const f = fattoreLive();   // fuori dal ciclo: costa un giro su tutto il listone
  return DATI.giocatori.filter((g) => {
    if (aBlocchi && g.ruolo_classic === "P") return false;  // stanno nella scheda Portieri
    if (stato.macro && g.ruolo_classic !== stato.macro) return false;
    if (stato.mantra && !g.ruoli_mantra.includes(stato.mantra)) return false;
    if (stato.squadra && g.squadra !== stato.squadra) return false;
    if (stato.soloPreferiti && !preferiti[g.id]) return false;
    // la fascia di prezzo si legge su quello che vedi in tabella, quindi
    // segue i prezzi live quando sono accesi
    const prezzo = tettoDi(g, f) ?? 0;
    if (stato.prezzoMin !== null && prezzo < stato.prezzoMin) return false;
    if (stato.prezzoMax !== null && prezzo > stato.prezzoMax) return false;
    if (stato.soloOccasioni && !((scartoDi(g, f) ?? 0) > 0.25 * (g.prezzo_mercato || 0)
        && prezzo > 5)) return false;
    if (stato.nascondiPresi && asta[g.id]) return false;
    if (stato.ricerca.length && !stato.ricerca.every((t) => g._cerca.includes(t))) return false;
    return true;
  });
}

function ordina(righe) {
  const { campo, crescente } = stato.ordine;
  const segno = crescente ? 1 : -1;
  return righe.slice().sort((a, b) => {
    let x, y;
    if (campo === "preferito") {
      x = preferiti[a.id] ? 1 : 0;
      y = preferiti[b.id] ? 1 : 0;
      if (x === y) return b.prezzo_consigliato - a.prezzo_consigliato;
      return segno * (x - y);
    }
    // ordinare per un prezzo che non e' quello mostrato confonde e basta
    if (campo === "prezzo_consigliato" && stato.prezziRosa) {
      return segno * ((prezzoPerLaTuaRosa(a) ?? 0) - (prezzoPerLaTuaRosa(b) ?? 0));
    }
    x = a[campo]; y = b[campo];
    if (Array.isArray(x)) x = x.join("/");
    if (Array.isArray(y)) y = y.join("/");
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === "string") return segno * x.localeCompare(y, "it");
    return segno * (x - y);
  });
}

// ---------------------------------------------------------------- disegno

function disegna() {
  for (const v of ["listone", "portieri", "avanzate", "asta"]) {
    document.getElementById("vista-" + v).classList.toggle("nascosto", stato.vista !== v);
  }
  const senzaFiltri = ["asta", "portieri"].includes(stato.vista);
  document.querySelector(".filtri").classList.toggle("nascosto", senzaFiltri);
  document.getElementById("legenda").classList.toggle("nascosto", stato.vista !== "listone");

  aggiornaBarraAsta();
  if (stato.vista === "listone") disegnaListone();
  else if (stato.vista === "portieri") disegnaPortieri();
  else if (stato.vista === "avanzate") disegnaAvanzate();
  else disegnaAsta();
}

function disegnaListone() {
  const elenco = filtrati();
  // con le fasce accese una riga e' una casella, non un giocatore: chi ne
  // copre due compare due volte, ed e' il punto
  const voci = stato.fasce
    ? ordinaPerFasce(elenco)
    : ordina(elenco).map((g) => ({ g, ruolo: null, fascia: null }));
  const f = fattoreLive();
  document.getElementById("conteggio").textContent =
    `${elenco.length} giocatori` +
    (stato.fasce && voci.length !== elenco.length ? ` in ${voci.length} caselle` : "") +
    (f !== 1 ? ` · prezzi ×${f.toFixed(2).replace(".", ",")}` : "");
  segnaColonnaOrdinata("tabella-listone");

  const corpo = document.querySelector("#tabella-listone tbody");
  const perFascia = stato.fasce ? riassuntoFasceVive(f) : null;
  let ultimaFascia = null;
  corpo.innerHTML = voci.map(({ g, ruolo, fascia }) => {
    let separatore = "";
    if (stato.fasce) {
      const chiave = ruolo + "|" + fascia;
      if (chiave !== ultimaFascia) {
        separatore = rigaFascia(ruolo, fascia, perFascia[chiave], f);
        ultimaFascia = chiave;
      }
    }
    const stato_ = asta[g.id];
    const classe = stato_ ? (stato_.mio ? "preso-io" : "preso-altri") : "";
    const note = (g.etichette || []).slice(0, 3)
      .map((e) => `<span class="nota-piccola n-${e.replace(/ /g, "-")}"${motivoNota(e, g)}>${e}</span>`).join("");
    return separatore + `<tr class="${classe}" data-id="${g.id}">
      <td class="cella-stella"><button class="stella ${preferiti[g.id] ? "attiva" : ""}"
          data-stella="${g.id}" title="Segna come preferito">${preferiti[g.id] ? "★" : "☆"}</button></td>
      <td>${pillole(g)}</td>
      <td class="nome-giocatore">${g.nome}${stato_ && stato_.mio ? " ✓" : ""}</td>
      <td class="tenue">${g.squadra}</td>
      <td class="num conviene">${fasciaPrezzo(g, f)}</td>
      <td class="num">${g.fantamedia_attesa.toFixed(2)}</td>
      <td class="num">${titolarita(g)}</td>
      <td>${note}</td>
    </tr>`;
  }).join("");

  corpo.querySelectorAll("tr[data-id]").forEach((tr) =>
    tr.addEventListener("click", (e) => {
      if (e.target.closest("[data-stella]")) return;  // la stella non apre il dettaglio
      apriPannello(tr.dataset.id);
    })
  );
  corpo.querySelectorAll("[data-stella]").forEach((b) =>
    b.addEventListener("click", () => alternaPreferito(b.dataset.stella))
  );
}

function caricaPreferiti() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_PREFERITI) || "{}"); }
  catch { return {}; }
}

function salvaPreferiti() {
  try { localStorage.setItem(CHIAVE_PREFERITI, JSON.stringify(preferiti)); }
  catch { /* una stella persa non e' un'asta persa: vedi salvaAsta() */ }
}

function alternaPreferito(id) {
  if (preferiti[id]) delete preferiti[id];
  else preferiti[id] = true;
  salvaPreferiti();
  disegna();
}

function disegnaAvanzate() {
  const righe = ordina(filtrati().filter((g) => g.understat));
  document.getElementById("conteggio").textContent = `${righe.length} giocatori con dati avanzati`;
  segnaColonnaOrdinata("tabella-avanzate");

  document.querySelector("#tabella-avanzate tbody").innerHTML = righe.map((g) => {
    const u = g.understat;
    const diff = g.u_diff_gol;
    const classe = diff >= 2 ? "i-cattivo" : diff <= -2 ? "i-buono" : "i-medio";
    return `<tr data-id="${g.id}">
      <td class="nome-giocatore">${g.nome}</td>
      <td class="tenue">${g.squadra}</td>
      <td class="num">${u.minuti}</td>
      <td class="num">${u.gol}</td>
      <td class="num">${u.xg.toFixed(1)}</td>
      <td class="num indice ${classe}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}</td>
      <td class="num">${u.assist}</td>
      <td class="num">${u.xa.toFixed(1)}</td>
      <td class="num">${g.u_xg90.toFixed(2)}</td>
      <td class="num tenue">${u.tiri}</td>
      <td class="num tenue">${u.key_passes}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("#tabella-avanzate tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => apriPannello(tr.dataset.id))
  );
}

function disegnaPortieri() {
  const { campo, crescente } = stato.ordine;
  const campoValido = ["squadra", "prezzo_consigliato", "quotazione_scalata",
    "scarto_listino", "fantamedia_ponderata"].includes(campo);
  const chiave = campoValido ? campo : "prezzo_consigliato";
  const segno = campoValido && crescente ? 1 : -1;

  const righe = BLOCCHI.slice().sort((a, b) => {
    const x = a[chiave], y = b[chiave];
    return typeof x === "string" ? segno * x.localeCompare(y, "it") : segno * (x - y);
  });

  const f = fattoreLive();
  segnaColonnaOrdinata("tabella-portieri");

  // Con un blocco gia' preso la domanda cambia: non piu' "quale porta e' la
  // migliore" ma "quale si sposa con quella che ho". Ordino per quello.
  const inCoppia = blocchiMiei().length > 0 && bloccheMancanti() > 0;
  if (inCoppia && !stato.ordineScelto) {
    righe.sort((a, b) => (valoreMarginaleBlocco(b) ?? -1) - (valoreMarginaleBlocco(a) ?? -1));
  }
  const guadagni = righe
    .filter((b) => !asta["blocco:" + b.squadra])
    .map((b) => valoreMarginaleBlocco(b)).filter((v) => v !== null);
  const soglia = guadagni.length
    ? guadagni.slice().sort((a, b) => b - a)[Math.min(2, guadagni.length - 1)] : null;

  document.querySelector("#tabella-portieri tbody").innerHTML = righe.map((b) => {
    const preso = asta["blocco:" + b.squadra];
    const classe = preso ? (preso.mio ? "preso-io" : "preso-altri") : "";
    const elenco = b.portieri.map((p, i) =>
      `<span class="portiere-blocco ${i === 0 ? "titolare" : ""}">${p.nome}</span>`).join("");
    const mv = valoreMarginaleBlocco(b);
    const c = coppiaCon(b);
    const consigliato = inCoppia && !preso && soglia !== null && mv !== null && mv >= soglia;
    return `<tr class="${classe}${consigliato ? " coppia-consigliata" : ""}" data-squadra="${b.squadra}">
      <td><span class="stemma">${b.squadra}</span>${preso && preso.mio ? "✓" : ""}${
        consigliato ? '<span class="nota-piccola n-coppia" title="Fra i migliori compagni per la porta che hai già">coppia</span>' : ""}</td>
      <td class="num consigliato">${arrotonda(tettoDi(b, f))}</td>
      <td class="num tenue">${arrotonda(vivo(b.quotazione_scalata, f))}</td>
      <td class="num indice ${classeScarto(b)}">${scarto(b, f)}</td>
      <td class="num">${b.fantamedia_ponderata.toFixed(2)}</td>
      <td class="num tenue">${b.clean_sheet_attesi !== undefined ? b.clean_sheet_attesi.toFixed(0) : "—"}</td>
      <td class="num${consigliato ? " i-buono" : ""}">${
        mv === null ? "—"
          : inCoppia ? `+${mv.toFixed(1)}${c ? `<span class="tenue"> · ${c.casa} casa</span>` : ""}`
          : `<span class="tenue">${mv.toFixed(0)}</span>`}</td>
      <td><div class="elenco-blocco">${elenco}</div></td>
    </tr>`;
  }).join("");

  document.querySelectorAll("#tabella-portieri tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => apriPannelloBlocco(tr.dataset.squadra))
  );
}

// Il pezzo che spiega la coppia. Compare solo quando serve davvero: prima del
// primo blocco non c'e' nessuna coppia da valutare, dopo il secondo non c'e'
// piu' niente da comprare.
function sezioneCoppia(b, f = 1) {
  if (!b.giornate || !b.giornate.length) return "";
  const mv = valoreMarginaleBlocco(b);
  const c = coppiaCon(b);
  const pieno = b.giornate.reduce((s, g) => s + g.fm, 0);

  const calendario = `<p class="spiegazione tenue">Su 38 giornate: <strong>${b.clean_sheet_attesi}
     clean sheet attesi</strong>, ${b.giornate.filter((g) => g.casa).length} in casa.
     I gol attesi contro ogni avversario vengono dalle forze di attacco e difesa
     dell'anno scorso, e sono quello che sposta la fantamedia di un portiere.</p>`;

  if (!c) return `<h3>La porta, giornata per giornata</h3>${calendario}`;

  const quota = mv !== null && pieno > 0 ? mv / pieno : 0;
  return `<h3>In coppia con ${c.con}</h3>
    <div class="cartellini">
      <div class="cartellino"><div class="etichetta" title="Quanto aggiunge alla porta che hai già, in fantapunti sulla stagione">Aggiunge</div>
        <div class="valore ${quota > 0.04 ? "i-buono" : ""}">+${(mv ?? 0).toFixed(1)}</div></div>
      <div class="cartellino"><div class="etichetta">Giornate con una in casa</div>
        <div class="valore">${c.casa}<span class="tenue">/38</span></div></div>
      <div class="cartellino"><div class="etichetta" title="Giornate in cui sono difficili tutte e due: è lì che la coppia non ti copre">Giornate storte</div>
        <div class="valore ${c.dure >= 8 ? "i-cattivo" : ""}">${c.dure}</div></div>
    </div>
    <p class="spiegazione">Con i blocchi ne schieri uno per giornata, quindi il secondo
      non vale quanto è forte ma quanto è <strong>complementare</strong> al primo: da solo
      varrebbe ${pieno.toFixed(0)} fantapunti, accanto a ${c.con} te ne aggiunge
      <strong>${(mv ?? 0).toFixed(1)}</strong>. È per questo che il prezzo consigliato
      qui sopra è molto più basso di quello che vedevi prima di prendere ${c.con}.</p>
    ${calendario}`;
}

function apriPannelloBlocco(squadra) {
  const b = BLOCCHI.find((x) => x.squadra === squadra);
  if (!b) return;
  const preso = asta["blocco:" + b.squadra];
  const f = fattoreLive();

  let html = `
    <h2>Porta ${b.squadra}</h2>
    <div class="squadra-ruolo">Blocco portieri · ${b.posizione}º dei ${BLOCCHI.length} disponibili</div>

    <div class="cartellini">
      <div class="cartellino"><div class="etichetta">Prezzo consigliato</div>
        <div class="valore">${arrotonda(tettoDi(b, f))}</div></div>
      <div class="cartellino"><div class="etichetta">Listino titolare</div>
        <div class="valore">${arrotonda(vivo(b.quotazione_scalata, f))}</div></div>
      <div class="cartellino"><div class="etichetta">FM porta</div>
        <div class="valore">${b.fantamedia_ponderata.toFixed(2)}</div></div>
    </div>

    ${sezioneCoppia(b, f)}
    ${fraseOfferta(tettoDi(b, f))}

    <div class="azioni">
      <button class="primario" data-blocco="mio">${preso && preso.mio ? "Modifica prezzo" : "L'ho preso io"}</button>
      <button data-blocco="altri">${preso && !preso.mio ? "Preso ✓" : "Preso da altri"}</button>
      ${preso ? '<button class="pericolo" data-blocco="annulla">Annulla</button>' : ""}
    </div>
    <div id="forma-prezzo"></div>

    <h3>Portieri compresi</h3>
    <table class="tabellina">
      <tr><th>Portiere</th><th>FM attesa</th><th>Pres. attese</th><th>Listino</th></tr>
      ${b.portieri.map((p) => `<tr>
        <td>${p.nome}${(p.etichette || []).includes("Para rigori") ? " 🧤" : ""}</td>
        <td>${p.fantamedia_attesa.toFixed(2)}</td>
        <td>${Math.round(p.presenze_attese)}</td>
        <td>${p.qa_mantra ?? "—"}</td></tr>`).join("")}
    </table>

    <h3>Come si arriva al prezzo</h3>
    <div class="spiegazione">
      <div class="riga-calcolo"><span>Fantamedia della porta</span><strong>${b.fantamedia_ponderata.toFixed(2)}</strong></div>
      <div class="riga-calcolo"><span>Giornate coperte</span><strong>38</strong></div>
      <div class="riga-calcolo"><span>Punteggio stagionale</span><strong>${b.punteggio_stagionale}</strong></div>
      <div class="riga-calcolo"><span>Blocco peggiore disponibile</span><strong>${b.riferimento}</strong></div>
      <div class="riga-calcolo"><span>Vantaggio sul riferimento</span><strong>${b.surplus}</strong></div>
      <div class="riga-calcolo totale"><span>Prezzo consigliato</span><strong>${arrotonda(b.prezzo_consigliato)} crediti</strong></div>
      ${rigaLive(b.prezzo_consigliato, f)}
    </div>
    <p class="spiegazione">La fantamedia della porta pesa i portieri per quanto ci si aspetta che
    giochino: il secondo e il terzo contano solo nella misura in cui il titolare rischia di
    lasciargli spazio. Comprando il blocco quel rischio è già coperto.</p>`;

  document.getElementById("pannello-contenuto").innerHTML = html;
  document.getElementById("pannello").classList.remove("nascosto");
  document.getElementById("velo").classList.remove("nascosto");

  document.querySelectorAll("#pannello [data-blocco]").forEach((btn) =>
    btn.addEventListener("click", () => azioneBlocco(b, btn.dataset.blocco))
  );
}

// Le due fonti di titolarità, quando ci sono tutte e due. Il numero che fa il
// prezzo è quello di fantacalcio.it: copre 465 giocatori invece di 300 e il 17
// agosto correlava meglio con le presenze vere dell'anno scorso (+0.34 contro
// +0.21). SOS Fanta sta qui per far vedere il disaccordo, non per correggere:
// le due scale sono diverse — 95% al titolare sicuro e 51/49 al ballottaggio
// contro una distribuzione più morbida che si ferma al 90% — e mediarle
// darebbe un numero che non vuol dire niente in nessuna delle due.
function righeDueFonti(g) {
  const s = g.titolarita_sos;
  if (s === null || s === undefined) return "";
  if (g.titolarita_fc === null || g.titolarita_fc === undefined) {
    return `<div class="riga-calcolo"><span>Solo SOS Fanta ce l'ha: fantacalcio.it
      non lo mette fra i ventidue</span><strong>${Math.round(s * 100)}%</strong></div>`;
  }
  const litiga = g.scarto_titolarita >= SCARTO_TITOLARITA;
  return `<div class="riga-calcolo"><span>Seconda fonte (SOS Fanta)</span>
      <strong class="${litiga ? "contesa" : ""}">${Math.round(s * 100)}%</strong></div>
    ${litiga ? `<p class="spiegazione" style="margin:6px 0 0">Le due fonti non sono
      d'accordo (${Math.round(g.titolarita_fc * 100)}% contro ${Math.round(s * 100)}%).
      Il prezzo qui sopra usa la prima; questo è un giocatore su cui la stima poggia
      su un'ipotesi contesa, e all'asta conviene saperlo prima di rilanciare.</p>` : ""}`;
}

// Da dove escono le presenze attese quando c'è anche la titolarità. Le due
// stime vanno mostrate separate: quando divergono è lì che c'è da decidere, e
// nascondere il disaccordo dentro una media sarebbe il modo peggiore di
// presentarlo.
function righeTitolarita(g) {
  if (g.titolarita === null || g.titolarita === undefined) return "";
  const mod = DATI.riepilogo.modificatori || {};
  const peso = mod.peso_titolarita;
  let html = `<div class="riga-calcolo"><span>Titolarità alla prossima giornata</span>
    <strong>${Math.round(g.titolarita * 100)}%</strong></div>`;
  html += righeDueFonti(g);
  if (g.presenze_da_titolarita === undefined) return html;
  html += `<div class="riga-calcolo"><span>Presenze che valgono quella percentuale</span>
    <strong>${Math.round(g.presenze_da_titolarita)}</strong></div>`;
  if (g.presenze_storiche !== null && g.presenze_storiche !== undefined) {
    html += `<div class="riga-calcolo"><span>Presenze secondo il solo storico</span>
      <strong>${Math.round(g.presenze_storiche)}</strong></div>`;
    if (peso !== undefined) {
      html += `<div class="riga-calcolo"><span>Peso delle probabili formazioni</span>
        <strong>${Math.round(peso * 100)}%</strong></div>`;
    }
  } else {
    html += `<div class="riga-calcolo"><span>Storico in Serie A</span>
      <strong>nessuno: conta solo la percentuale</strong></div>`;
  }
  return html;
}

// La terza fonte sulle presenze: l'XPV di Algo, cioe' la percentuale di
// partite in cui si aspettano che il giocatore prenda voto. E' l'unica delle
// tre che parli di stagione invece che di prossima giornata, e per 38 e' gia'
// un numero di presenze: la titolarita' delle probabili va invece passata per
// una curva calibrata, perche' descrive una giornata sola. Misurata il 18
// agosto 2026 sui 300 rimasti nella stessa squadra, contro le presenze vere
// del 2025-26, correla +0.72 contro +0.61 della titolarita'. Sta nel dettaglio
// e non in colonna: la colonna ha gia' due numeri e il terzo la renderebbe
// illeggibile a scorrimento.
function righeXpv(g) {
  if (g.presenze_da_xpv === null || g.presenze_da_xpv === undefined) return "";
  const mod = DATI.riepilogo.modificatori || {};
  const peso = mod.peso_presenze_xpv;
  let html = `<div class="riga-calcolo"><span>Presenze secondo Algo (XPV ${
    Math.round(g.algo_xpv)}% delle partite a voto)</span>
    <strong>${Math.round(g.presenze_da_xpv)}</strong></div>`;
  if (peso) {
    html += `<div class="riga-calcolo"><span>Peso dell'XPV sulle presenze</span>
      <strong>${Math.round(peso * 100)}%</strong></div>`;
  }
  return html;
}

// L'ultima riga del calcolo quando i prezzi live sono accesi: il conto del
// motore resta quello, sopra ci si vede cosa ne fa il mercato di adesso.
function rigaLive(prezzo, f) {
  if (f === 1 || prezzo === null || prezzo === undefined) return "";
  const segno = f > 1 ? "la lega ha ancora crediti da spendere" : "in lega restano pochi crediti";
  return `<div class="riga-calcolo totale" title="${segno}">
    <span>Ricalibrato sui crediti residui (×${f.toFixed(2).replace(".", ",")})</span>
    <strong>${arrotonda(prezzo * f)} crediti</strong></div>`;
}

function segnaColonnaOrdinata(idTabella) {
  document.querySelectorAll(`#${idTabella} th`).forEach((th) => {
    th.classList.toggle("ordinata", th.dataset.ordina === stato.ordine.campo);
    th.classList.toggle("crescente", th.dataset.ordina === stato.ordine.campo && stato.ordine.crescente);
  });
}

// Il motivo dell'assenza nel passaggio del mouse, quando a saperlo è la
// seconda fonte: così la riga resta corta e non serve aprire il dettaglio per
// decidere se guardarci dentro.
function motivoNota(e, g) {
  if (e !== "Infortunato" && e !== "Acciaccato") return "";
  const i = g.indisponibile_sos;
  if (!i || (g.infortunio && g.infortunio.fonte !== "sos")) return "";
  // il title va su una riga sola: gli a capo del sorgente finirebbero dentro
  // il fumetto, indentazione compresa
  const g_ = i.giornate_saltate;
  const testo = `${(i.descrizione || i.stato).replace(/"/g, "'")} — lo dice SOS Fanta, la
    pagina infortuni di fantacalcio.it no. ${g_ >= 1
      ? `Sono ${g_} giornate su 38, e dalle presenze attese sono già state tolte.`
      : "Le presenze attese non sono state ridotte."}`.replace(/\s+/g, " ");
  return ` title="${testo}"`;
}

function pillole(g) {
  const ruoli = g.ruoli_mantra.length ? g.ruoli_mantra : [g.ruolo_classic.toLowerCase()];
  return ruoli.map((r) =>
    `<span class="pillola-ruolo r-${COLORE_RUOLO[r] || g.ruolo_classic}" title="${NOMI_MANTRA[r] || r}">${r}</span>`
  ).join("");
}

// La fascia in cui conviene comprare. Il tetto e' sempre quanto vale: i prezzi
// consigliati sommati fanno esattamente il budget, quindi ogni credito speso
// sopra e' un credito tolto a un altro acquisto, e questo vale sia che il
// mercato chieda meno sia che chieda di piu'. Il fondo e' quanto costera'
// davvero, e c'e' solo quando il mercato lo lascia sotto il tetto: quando
// chiede di piu' non esiste nessuna fascia da mostrare, solo il punto in cui
// smettere di rilanciare.
// ------------------------------------------------------- fasce di ruolo
//
// Con le fasce accese l'ordinamento scelto sulle intestazioni passa in
// secondo piano: raggruppare ha senso solo dentro un ruolo e per prezzo
// decrescente, che e' poi l'ordine in cui i giocatori si esauriscono
// all'asta. Il riempimento va in fondo a ogni ruolo, non in fondo a tutto.
// Dalla difesa all'attacco, come si legge una formazione. Stessa sequenza di
// fanta/moduli.py: le fasce arrivano di li'.
const ORDINE_RUOLI = ["dc", "b", "dd", "ds", "e", "m", "c", "w", "t", "a", "pc"];

// Con le fasce accese non si scorre un listone di giocatori ma di *caselle*:
// in Mantra non compri un difensore, compri il posto che il modulo ti chiede,
// e un braccetto non sostituisce un terzino destro. Un giocatore che copre due
// caselle compare quindi in tutte e due, con la fascia che ha dentro ciascuna
// -- lo stesso esterno puo' essere di prima fra le ali e di quarta fra gli
// esterni puri. Se stai gia' filtrando per un ruolo Mantra e' quello che ti
// interessa, e le altre caselle sono rumore.
function ordinaPerFasce(righe) {
  const voci = [];
  for (const g of righe) {
    const ruoli = stato.mantra ? [stato.mantra] : (g.ruoli_mantra || []);
    for (const ruolo of ruoli) {
      if (!g.fasce || !(ruolo in g.fasce)) continue;
      voci.push({ g, ruolo, fascia: g.fasce[ruolo] });
    }
  }
  return voci.sort((a, b) =>
    (ORDINE_RUOLI.indexOf(a.ruolo) - ORDINE_RUOLI.indexOf(b.ruolo)) ||
    ((a.fascia || 99) - (b.fascia || 99)) ||
    ((b.g.prezzo_consigliato || 0) - (a.g.prezzo_consigliato || 0))
  );
}

// Quanti ne restano da contendere in ogni fascia. Si conta su tutto il
// listone, non sulle righe filtrate: una fascia si svuota per gli acquisti
// degli altri, non perche' tu hai scritto qualcosa nella ricerca.
//
// Insieme al conteggio calcolo anche la banda di prezzo vera, invece di
// leggerla dal riepilogo. Quella della build e' in crediti di lega, e con
// "Per la tua rosa" acceso l'intestazione annunciava "61-58 crediti" sopra a
// righe che dicevano 51 e 49: due numeri diversi per la stessa cosa, a mezzo
// centimetro di distanza. La banda deve descrivere quello che si vede.
let _fasceVive = null;

function riassuntoFasceVive(f) {
  // Non dipende da quello che scrivi nella ricerca -- si conta su tutto il
  // listone -- ma disegnaListone gira a ogni tasto premuto, e rifarlo li' per
  // li' costava 130 millisecondi a battuta. Cambia solo con gli acquisti, con
  // il fattore live e con l'interruttore della rosa: quelli fanno da chiave.
  const chiaveCache = `${f}|${stato.prezziRosa}`;
  if (_fasceVive && _fasceVive.chiave === chiaveCache) return _fasceVive.dati;

  const dati = {};
  for (const g of DATI.giocatori) {
    if (!g.fasce) continue;
    const tetto = tettoDi(g, f);
    for (const ruolo of Object.keys(g.fasce)) {
      const chiave = ruolo + "|" + g.fasce[ruolo];
      const v = dati[chiave] || (dati[chiave] = { liberi: 0, min: null, max: null });
      if (!asta[g.id]) v.liberi++;
      if (tetto !== null) {
        if (v.min === null || tetto < v.min) v.min = tetto;
        if (v.max === null || tetto > v.max) v.max = tetto;
      }
    }
  }
  _fasceVive = { chiave: chiaveCache, dati };
  return dati;
}

function rigaFascia(ruolo, fascia, vivo_, f) {
  const dati = (DATI.riepilogo.fasce || {})[ruolo] || {};
  const info = (dati.fasce || []).find((x) => x.fascia === fascia);
  const nome = NOMI_MANTRA[ruolo] || ruolo;
  const titolo = fascia ? `${nome} · Fascia ${fascia}` : `${nome} · Riempimento`;
  const liberi = vivo_ ? vivo_.liberi : 0;
  const banda = vivo_ && vivo_.max !== null
    ? (vivo_.max === vivo_.min
        ? `${arrotonda(vivo_.max)} crediti`
        : `${arrotonda(vivo_.max)}–${arrotonda(vivo_.min)} crediti`)
    : "";
  const quanti = info ? `${info.giocatori} giocator${info.giocatori === 1 ? "e" : "i"}` : "";
  const rimasti = liberi === 0
    ? '<span class="i-cattivo">esaurita</span>'
    : `<strong>${liberi}</strong> ancora liber${liberi === 1 ? "o" : "i"}`;
  return `<tr class="riga-fascia"><td colspan="8">
    <span class="pillola-ruolo r-${COLORE_RUOLO[ruolo] || "D"}">${ruolo}</span>
    <span class="nome-fascia">${titolo}</span>
    <span class="tenue">${[quanti, banda].filter(Boolean).join(" · ")}</span>
    ${statoScarsita(ruolo, fascia, dati)}
    <span class="liberi-fascia">${rimasti}</span>
  </td></tr>`;
}

// Quanto si e' svuotata questa fascia, e quanto costa restarne fuori. La
// riga di fascia diceva finora solo meta' della cosa -- quanti ne schiera la
// lega -- senza mai aggiornare quanto e' cara l'alternativa adesso.
function statoScarsita(ruolo, fascia, dati) {
  const schierati = fascia === 1 && dati.titolari
    ? `<span class="tenue">la lega ne schiera ${dati.titolari}</span>` : "";
  const v = (premiScarsita()[ruolo] || {})[fascia];
  if (!v || v.premio < 1) return schierati;
  const premio = Math.round(v.premio);
  const titolo = `${v.presi} di ${v.totale} in questa fascia sono già andati, e sotto si scende di `
    + `${Math.round(v.salto)} crediti: chi resta senza non ha più un'alternativa allo stesso livello, `
    + `quindi gli ultimi si pagano circa ${premio} crediti sopra il listino.`
    + (stato.prezziLive ? "" : " Accendi «prezzi live» perché la colonna Conviene ne tenga conto.");
  const forte = v.quota >= 0.6 ? " i-cattivo" : "";
  return `${schierati} <span class="premio-scarsita${forte}" title="${titolo}">+${premio} di scarsità</span>`;
}

// Il tetto da mostrare: quello di lega, oppure quello della tua rosa se hai
// acceso l'interruttore. Il prezzo personale e' gia' in crediti di adesso --
// il piano su cui e' costruito usa i costi correnti -- quindi il fattore live
// non va applicato una seconda volta.
function tettoDi(g, f = 1) {
  if (stato.prezziRosa) {
    // i blocchi hanno una logica loro: non si schierano in un modulo, si
    // alternano fra loro giornata per giornata
    const p = g.portieri ? prezzoBloccoPerLaTuaRosa(g) : prezzoPerLaTuaRosa(g);
    if (p !== null) return p;
  }
  return vivo(g.prezzo_consigliato, f);
}

function fasciaPrezzo(g, f = 1) {
  const tetto = tettoDi(g, f);
  if (tetto === null) return "—";
  const base = costoAtteso(g, f);
  const alto = Math.round(tetto);
  const basso = base === null ? null : Math.round(base);
  if (basso !== null && basso < alto)
    return `<span class="tenue">${basso} –</span> <strong>${alto}</strong>`;
  // Il mercato chiede piu' del tetto. Finche' a dirlo e' il listino di agosto
  // basta "fino a": e' una cosa che sai da prima e non cambia mentre giochi.
  // Se invece a portarcelo e' stata la casella che si e' svuotata adesso, il
  // numero va detto -- e' successo un minuto fa, ed e' esattamente la ragione
  // per cui non conviene piu' aspettare il prossimo.
  const premio = premioScarsita(g, f);
  if (premio >= 1 && basso !== null)
    return `<span class="costo-scarsita" title="La sua fascia si sta svuotando: andrà via intorno ai ${basso} crediti, ${Math.round(premio)} sopra il listino. Per te ne vale al massimo ${alto}.">${basso}</span> <span class="tenue">›</span> <strong>${alto}</strong>`;
  return `<span class="tenue">fino a</span> <strong>${alto}</strong>`;
}

// La percentuale di titolarità con la sua barretta. Il grigio sotto il 40% non
// e' un giudizio: fare la riserva non e' un errore, e su un listone di 500
// nomi la maggioranza sta li'. Il rosso lo tengo per quello che ti fa perdere
// crediti.
function titolarita(g) {
  const t = g.titolarita;
  if (t === null || t === undefined) return '<span class="tenue">—</span>';
  const livello = t >= 0.7 ? "t-alta" : t >= 0.4 ? "t-media" : "t-bassa";
  const barra = `<span class="titolarita ${livello}"
    ><span class="barra-tit" style="--q:${t}"></span>${Math.round(t * 100)}%</span>`;
  return barra + secondaFonte(g);
}

// La seconda fonte compare in colonna solo quando litiga con la prima: se sono
// d'accordo il secondo numero e' rumore, e la colonna la scorri con l'occhio.
// Quando invece discordano quella e' la notizia - un titolare per un sito e un
// ballottaggio per l'altro - e va vista senza aprire il dettaglio.
function secondaFonte(g) {
  const s = g.titolarita_sos;
  if (s === null || s === undefined) return "";
  if (!(g.scarto_titolarita >= SCARTO_TITOLARITA)) return "";
  return `<span class="tit-contesa" title="Seconda fonte (SOS Fanta): ${Math.round(s * 100)}%${
    ""}. Le due fonti non sono d'accordo: il prezzo usa la prima.">${Math.round(s * 100)}%</span>`;
}

function classeIndice(i) {
  if (i === null || i === undefined) return "i-medio";
  if (i >= 1.25) return "i-buono";
  if (i <= 0.8) return "i-cattivo";
  return "i-medio";
}

// Quanto vale meno quanto costerà: in crediti si legge meglio di un rapporto,
// e "+113" dice subito di quanto conviene rilanciare. Con i prezzi live si
// contrae come tutto il resto della scala: l'affare va letto nei crediti di
// adesso, non in quelli di inizio asta.
function scarto(x, f = 1) {
  const s = scartoDi(x, f);
  if (s === null) return "—";
  const v = Math.round(s);
  return (v > 0 ? "+" : "") + v;
}

// Con i prezzi di lega l'affare e' gia' calcolato dalla build; con quelli
// della tua rosa va rifatto, perche' il tetto e' cambiato e il confronto e'
// proprio quello che serve: quanto vale a te meno quanto costera' a tutti.
function scartoDi(x, f = 1) {
  if (stato.prezziRosa && x.prezzo_consigliato !== undefined && !x.acquisto_a_blocchi) {
    const tetto = tettoDi(x, f);
    // per un blocco il termine di paragone e' il listino del titolare: il
    // prezzo di mercato non esiste, i portieri il listino li quota uno per uno
    const riferimento = costoAtteso(x, f) ?? 0;
    if (tetto !== null) return tetto - riferimento;
  }
  const s = x.scarto_mercato !== undefined ? x.scarto_mercato : x.scarto_listino;
  if (s === null || s === undefined) return null;
  // lo scarto della build e' stato calcolato con la casella ancora piena:
  // quello che la scarsita' ha aggiunto al costo va tolto di qui, se no un
  // ruolo esaurito continuerebbe a segnalare occasioni che non esistono piu'
  return s * f - premioScarsita(x, f);
}

function classeScarto(x) {
  const s = scartoDi(x, fattoreLive());
  if (s === null) return "i-medio";
  const rif = Math.max(x.prezzo_mercato || x.quotazione_scalata || 0, 8);
  if (s > 0.25 * rif) return "i-buono";
  if (s < -0.2 * rif) return "i-cattivo";
  return "i-medio";
}

const arrotonda = (n) => (n === null || n === undefined ? "—" : Math.round(n));

// ---------------------------------------------------------------- pannello di dettaglio

function apriPannello(id) {
  const g = DATI.giocatori.find((x) => x.id === id);
  if (!g) return;
  const stagioni = DATI.riepilogo.stagioni_storico;
  const preso = asta[g.id];
  const f = fattoreLive();

  const ruoli = g.ruoli_mantra.map((r) => NOMI_MANTRA[r] || r).join(", ");
  let html = `
    <h2><button class="stella ${preferiti[g.id] ? "attiva" : ""}" data-stella-dettaglio="${g.id}"
        style="font-size:20px">${preferiti[g.id] ? "★" : "☆"}</button> ${g.nome}</h2>
    <div class="squadra-ruolo">${g.squadra} · ${NOMI_MACRO[g.ruolo_classic]} · ${ruoli}</div>

    <div class="cartellini">
      <div class="cartellino">
        <div class="etichetta">Conviene</div>
        <div class="valore conviene">${fasciaPrezzo(g, f)}</div>
      </div>
      <div class="cartellino">
        <div class="etichetta">Quanto costerà</div>
        <div class="valore">${arrotonda(costoAtteso(g, f))}</div>
      </div>
      <div class="cartellino">
        <div class="etichetta">Affare</div>
        <div class="valore ${classeScarto(g)}">${scarto(g, f)}</div>
      </div>
    </div>
    <p class="spiegazione">${frasePrezzo(g, f)}</p>
    ${sezioneRosa(g, f)}
    ${fraseOfferta(tettoDi(g, f))}

    <div class="azioni">
      <button class="primario" data-azione="mio">${preso && preso.mio ? "Modifica prezzo" : "L'ho preso io"}</button>
      <button data-azione="altri">${preso && !preso.mio ? "Preso ✓" : "Preso da altri"}</button>
      ${preso ? '<button class="pericolo" data-azione="annulla">Annulla</button>' : ""}
    </div>
    <div id="forma-prezzo"></div>`;

  html += `<h3>Come si arriva al prezzo</h3>
    <div class="spiegazione">
      <div class="riga-calcolo"><span>Fantamedia attesa</span><strong>${g.fantamedia_attesa.toFixed(2)}</strong></div>
      <div class="riga-calcolo"><span>Presenze attese</span><strong>${Math.round(g.presenze_attese)}</strong></div>
      ${righeTitolarita(g)}
      ${righeXpv(g)}
      <div class="riga-calcolo"><span>Punteggio stagionale</span><strong>${g.punteggio_stagionale}</strong></div>
      <div class="riga-calcolo"><span>Livello di riferimento del ruolo</span><strong>${g.riferimento_ruolo}</strong></div>
      <div class="riga-calcolo"><span>Vantaggio sul riferimento</span><strong>${g.surplus}</strong></div>
      ${g.moltiplicatore_versatilita > 1
        ? `<div class="riga-calcolo"><span>Bonus versatilità (${g.ruoli_mantra.length} ruoli)</span><strong>×${g.moltiplicatore_versatilita}</strong></div>` : ""}
      ${g.prezzo_motore !== undefined && g.prezzo_motore !== null
        ? `<div class="riga-calcolo"><span>Prezzo del solo motore</span><strong>${arrotonda(g.prezzo_motore)}</strong></div>
           <div class="riga-calcolo"><span>Dopo l'ancoraggio al mercato</span><strong>${arrotonda(g.prezzo_consigliato)}</strong></div>` : ""}
      <div class="riga-calcolo totale"><span>Prezzo consigliato</span><strong>${arrotonda(g.prezzo_consigliato)} crediti</strong></div>
      ${rigaLive(g.prezzo_consigliato, f)}
      <div class="riga-calcolo" style="border:none"><span>Posizione nel ruolo</span><strong>${g.posizione_ruolo}º ${FRA_I[g.ruolo_classic]}</strong></div>
    </div>`;

  if (g.infortunio) {
    const i = g.infortunio;
    html += `<h3>Indisponibile</h3>
      <p class="spiegazione">${i.descrizione}</p>
      <p class="spiegazione">${i.stima_affidabile
        ? `Il testo dichiara un rientro, quindi ho tolto <strong>circa ${Math.round(i.giornate_stimate)} giornate</strong> dalle presenze attese.`
        : `Il testo non dice quando rientra, quindi <strong>le presenze non sono state ridotte</strong>: valuta tu e, se serve, correggile in <code>data/rettifiche.csv</code>.`}</p>`;
  }

  // Il secondo elenco di indisponibili. Quando la prima fonte non dice niente
  // e la seconda sì è quasi sempre una notizia fresca che deve ancora
  // arrivare di là: le presenze attese non sono state ridotte da nessuno.
  if (g.indisponibile_sos) {
    const i = g.indisponibile_sos;
    const daSos = g.infortunio && g.infortunio.fonte === "sos";
    const gg = i.giornate_saltate;
    html += `<h3>${daSos ? "Fuori secondo SOS Fanta" : "Anche SOS Fanta lo dà fuori"}</h3>
      <p class="spiegazione">${i.descrizione || i.stato}</p>`;
    if (gg === null || gg === undefined || gg < 1) {
      html += `<p class="spiegazione">${gg === 0
        ? "È un dubbio sull'esordio, non un'assenza: rientra già alla 1ª."
        : "Nessuna giornata di rientro dichiarata."} Vale <strong>una giornata su
        38</strong>, quindi le presenze attese non sono state toccate e non prende
        nessuna nota in colonna — a un'asta si comprano 38 giornate.</p>`;
    } else if (daSos) {
      html += `<p class="spiegazione">Dichiara il rientro alla <strong>${gg + 1}ª
        giornata</strong>: sono <strong>${gg} giornate su 38</strong>, già tolte dalle
        presenze attese qui sopra. La pagina infortuni di fantacalcio.it non lo segnala,
        quindi questo numero lo dà una fonte sola.</p>`;
    } else if (g.infortunio) {
      const suo = g.infortunio.giornate_stimate;
      html += `<p class="spiegazione">SOS dichiara il rientro alla <strong>${gg + 1}ª</strong>
        (${gg} giornate), fantacalcio.it ne stima <strong>${Math.round(suo)}</strong>${
        Math.abs(suo - gg) >= 3 ? ", e le due non si somigliano: la prima è una giornata"
          + " letta, la seconda un mese convertito a quattro giornate l'uno" : ""}.
        Le presenze usano ${suo === gg ? "lo stesso numero" : "quella di fantacalcio.it"}.</p>`;
    }
  }

  if (g.rettifica) {
    html += `<h3>Corretto a mano</h3>
      <div class="spiegazione">
        ${g.rettifica.presenze !== undefined ? `<div class="riga-calcolo"><span>Presenze imposte</span><strong>${g.rettifica.presenze}</strong></div>` : ""}
        ${g.rettifica.prezzo !== undefined ? `<div class="riga-calcolo"><span>Prezzo imposto</span><strong>${g.rettifica.prezzo}</strong></div>` : ""}
        ${g.rettifica.nota ? `<p style="margin-top:8px">${g.rettifica.nota}</p>` : ""}
      </div>`;
  }

  const mod = g.contributo_modificatori;
  if (mod && mod.totale) {
    const rm = DATI.riepilogo.modificatori || {};
    html += `<h3>Modificatori di lega</h3>
      <div class="spiegazione">
        <div class="riga-calcolo"><span>Media voto attesa</span><strong>${g.media_voto_attesa.toFixed(2)}</strong></div>
        <div class="riga-calcolo"><span>Prende almeno 6 nel</span><strong>${Math.round((mod.prob_sufficienza || 0) * 100)}% delle partite</strong></div>
        ${mod.rendimento !== undefined
          ? `<div class="riga-calcolo"><span>Vale per il fattore rendimento</span><strong>${mod.rendimento >= 0 ? "+" : ""}${mod.rendimento.toFixed(3)}</strong></div>` : ""}
        ${mod.fairplay !== undefined
          ? `<div class="riga-calcolo"><span>Vale per il fattore fairplay</span><strong>${mod.fairplay >= 0 ? "+" : ""}${mod.fairplay.toFixed(3)}</strong></div>` : ""}
        <div class="riga-calcolo totale"><span>Aggiunto alla fantamedia</span><strong>${mod.totale >= 0 ? "+" : ""}${mod.totale.toFixed(3)}</strong></div>
      </div>
      <p class="spiegazione">Nella tua lega il fattore rendimento paga fino a 3 punti se tutti e
      undici prendono voto pieno, quindi la regolarità vale crediti quanto i bonus. Con
      un'affidabilità media di lega del ${Math.round((rm.affidabilita_media || 0) * 100)}%, ogni
      sufficienza in più vale circa ${(rm.valore_di_una_sufficienza || 0).toFixed(2)} punti:
      questo giocatore ne porta la sua quota. Il fattore fairplay pesa molto meno, ma i
      cartellini tolgono comunque qualcosa.</p>`;
  }

  const conStorico = stagioni.filter((s) => g.storico[s]);
  if (conStorico.length) {
    html += `<h3>Storico in Serie A</h3>
      <table class="tabellina">
        <tr><th>Stagione</th><th>Pres.</th><th>MV</th><th>FM</th><th>Gol</th><th>Ass.</th><th>Amm.</th></tr>
        ${conStorico.map((s) => {
          const d = g.storico[s];
          return `<tr><td>${s}</td><td>${d.pg}</td><td>${d.mv ?? "—"}</td>
            <td><strong>${d.mfv ?? "—"}</strong></td><td>${d.gol}</td><td>${d.assist}</td><td>${d.amm}</td></tr>`;
        }).join("")}
      </table>`;
  }

  if (g.understat) {
    const u = g.understat, d = g.dettaglio_xg;
    html += `<h3>Dati avanzati (${stagioni[0]})</h3>
      <table class="tabellina">
        <tr><th>Minuti</th><th>Gol</th><th>xG</th><th>Assist</th><th>xA</th><th>Tiri</th><th>Pass. chiave</th></tr>
        <tr><td>${u.minuti}</td><td>${u.gol}</td><td>${u.xg.toFixed(1)}</td>
            <td>${u.assist}</td><td>${u.xa.toFixed(1)}</td><td>${u.tiri}</td><td>${u.key_passes}</td></tr>
      </table>`;
    if (d) html += `<p class="spiegazione" style="margin-top:10px">${fraseXg(d)}</p>`;
  }

  if (g.stima) {
    html += `<h3>Stima per un nuovo arrivo</h3>
      <p class="spiegazione">Nessuna presenza in Serie A. La valutazione parte dai dati prodotti
      in <strong>${g.stima.campionato}</strong> con il <strong>${g.stima.squadra_provenienza}</strong>,
      corretti per la differenza fra i due campionati, e viene mediata con la quotazione di listino
      perché sul minutaggio in Serie A non esiste alcun dato. Va letta come indicazione di massima.</p>`;
  } else if (g.fonte_fantamedia === "media_ruolo") {
    html += `<h3>Nessun dato disponibile</h3>
      <p class="spiegazione">Non ha presenze in Serie A né dati nei quattro maggiori campionati europei
      (arriva probabilmente dalla Serie B o da un campionato minore). La valutazione si appoggia
      quasi solo alla quotazione di listino.</p>`;
  }

  const t = g.totali_carriera;
  if (t && t.pg > 0) {
    html += `<h3>Totali nelle stagioni considerate</h3>
      <table class="tabellina">
        <tr><th>Pres.</th><th>Gol</th><th>Assist</th><th>Rig. segnati</th><th>Amm.</th><th>Esp.</th></tr>
        <tr><td>${t.pg}</td><td>${t.gol}</td><td>${t.assist}</td>
            <td>${t.rig_segnati}/${t.rig_calciati}</td><td>${t.amm}</td><td>${t.esp}</td></tr>
      </table>`;
  }

  html += `<h3>Scheda su fantacalcio.it</h3>
    <p class="spiegazione"><a href="${g.url}" target="_blank" rel="noopener" style="color:var(--accento)">Apri la pagina del giocatore ↗</a></p>`;

  document.getElementById("pannello-contenuto").innerHTML = html;
  document.getElementById("pannello").classList.remove("nascosto");
  document.getElementById("velo").classList.remove("nascosto");

  document.querySelectorAll("#pannello [data-azione]").forEach((b) =>
    b.addEventListener("click", () => azioneAsta(g, b.dataset.azione))
  );
  const stella = document.querySelector("#pannello [data-stella-dettaglio]");
  if (stella) {
    stella.addEventListener("click", () => {
      alternaPreferito(g.id);
      apriPannello(g.id);   // ridisegno il pannello per aggiornare la stella
    });
  }
}

// La domanda vera dell'asta non e' quanto vale un giocatore ma quanto serve a
// te, e la risposta cambia a ogni acquisto. Compare solo a rosa avviata: a
// rosa vuota i due tetti coincidono per costruzione e ripeterlo sarebbe rumore.
function sezioneRosa(g, f = 1) {
  if (!rosaDiMovimento().length) return "";
  const mv = valoreMarginale(g);
  if (mv === null) return "";
  const tuo = prezzoPerLaTuaRosa(g);
  const lega = Math.round(vivo(g.prezzo_consigliato, f));
  const scala = scalaRosa();
  const slot = slotMovimento(miaRosa());

  const perche = spiegaMarginale(g);
  let motivo = "";
  if (perche && !perche.entra) {
    motivo = `Nel tuo undici migliore (${perche.modulo}) <strong>non ci entra</strong>:
              le sue caselle sono già occupate da giocatori più forti, e quello che
              paghi resta in panchina.`;
  } else if (perche && perche.spinto) {
    motivo = `Entrerebbe nel tuo ${perche.modulo} <strong>al posto di ${perche.spinto}</strong>,
              quindi quello che ti aggiunge è la differenza fra i due, non il suo valore pieno.`;
  }

  // le due cause si sommano e vanno tenute distinte: una dipende da lui, e
  // dice di cambiare ruolo; l'altra dipende dal tuo portafoglio, e dice di
  // cambiare fascia di prezzo
  const perCasella = mv < g.prezzo_consigliato * 0.75;
  const perBudget = scala < 0.75;
  const cause = [
    perCasella ? (motivo || "La casella che occupa l'hai già coperta.") : "",
    perBudget
      ? `Ti restano <strong>${Math.round(creditiPerMovimento(miaRosa()) / Math.max(1, slot))}
         crediti per slot</strong> contro i ${Math.round(budgetIniziale() / DATI.riepilogo.lega.giocatori_movimento)}
         di partenza: qualunque tetto scende nella stessa proporzione, o resti senza rosa.`
      : "",
  ].filter(Boolean).join(" ");

  const confronto = tuo < lega * 0.75
    ? `<p class="spiegazione i-cattivo">Per la tua rosa vale <strong>${tuo}</strong>, non ${lega}. ${cause}</p>`
    : tuo > lega * 1.3
      ? `<p class="spiegazione i-buono">Per la tua rosa vale <strong>${tuo}</strong>, più dei ${lega}
         di listone: ti restano ${slot} slot e i crediti per permettertelo. È il momento di spendere.</p>`
      : `<p class="spiegazione">Per la tua rosa vale <strong>${tuo}</strong>, in linea con i ${lega}
         di listone: quella casella non l'hai ancora coperta e il portafoglio è in pari.</p>`;

  const alt = ripiego();
  const riga = alt
    ? `<p class="spiegazione tenue">Alla tua media per slot il meglio che trovi è
       <strong>${alt.nome}</strong> a ${alt.costo} crediti: è quello a cui rinunci
       se spendi qui.</p>`
    : "";

  return `<h3>Quanto vale per la tua rosa</h3>
    <div class="cartellini">
      <div class="cartellino">
        <div class="etichetta">Tetto per te</div>
        <div class="valore conviene"><strong>${tuo}</strong></div>
      </div>
      <div class="cartellino">
        <div class="etichetta">Tetto di lega</div>
        <div class="valore tenue">${lega}</div>
      </div>
      <div class="cartellino">
        <div class="etichetta" title="Di quanto alza il valore del tuo undici migliore">Alza l'undici di</div>
        <div class="valore">${Math.round(mv)}</div>
      </div>
    </div>
    ${confronto}
    ${riga}`;
}

function frasePrezzo(g, f = 1) {
  // lo stesso numero che sta nel cartellino Affare: se quello segue la tua
  // rosa deve seguirla anche la frase, altrimenti si contraddicono a vicenda
  const s = scartoDi(g, f);
  if (s === null) return "Nessun prezzo di mercato per il confronto.";
  const per = stato.prezziRosa ? "per la tua rosa " : "";
  // Il premio da scarsita' viene prima del giudizio sull'affare: e' il fatto
  // nuovo, ed e' quello che ribalta la conclusione "aspetto il prossimo".
  const premio = premioScarsita(g, f);
  const scarsita = premio >= 1
    ? `La sua fascia si sta svuotando: sotto si scende parecchio, e chi resta senza non ha
       un'alternativa allo stesso livello. Metti in conto <strong>${Math.round(premio)} crediti
       sopra il listino</strong>, e che aspettare il prossimo costa più che prenderlo adesso. `
    : "";
  const rif = Math.max(g.prezzo_mercato || 0, 8);
  const crediti = Math.abs(Math.round(s));
  if (s > 0.25 * rif)
    return scarsita + `Vale ${per}<strong>${crediti} crediti più di quanto dovrebbe costare</strong>: fin lì
            conviene rilanciare, il mercato te lo lascia a meno.`;
  if (s < -0.2 * rif)
    return scarsita + `Costerà <strong>${crediti} crediti più di quanto rende</strong>${per ? " a te" : ""}: è un nome che
            ${per ? "non ti conviene inseguire" : "il mercato paga più del dovuto"}, meglio lasciarlo agli altri.`;
  // Con un sovrapprezzo in ballo "sono in linea" e' il giudizio di agosto, e
  // contraddice la riga che lo precede: il confronto va rifatto sul costo di
  // adesso, che e' gia' dentro `s`.
  if (premio >= 1 && s < 0)
    return scarsita + `Contando il sovrapprezzo <strong>costa ${Math.abs(Math.round(s))} crediti più
            di quanto vale${per ? " per la tua rosa" : ""}</strong>: è il punto in cui il rilancio si ferma.`;
  return scarsita + `Valore ${per}e prezzo di mercato sono in linea: pagalo quello che costa, senza esagerare.`;
}

// Il tetto dice quanto vale, non quanto puoi permetterti. Compare solo quando
// i due non coincidono: finche' il portafoglio copre il valore non c'e' niente
// da dire, e una riga in piu' su ogni giocatore sarebbe solo rumore.
function fraseOfferta(tetto) {
  if (tetto === null || tetto === undefined) return "";
  if (!Object.keys(asta).length) return "";
  const max = offertaMassima();
  const slot = slotDaRiempire(miaRosa());
  if (slot <= 0) return `<p class="spiegazione i-cattivo">Hai la rosa completa: non ti restano slot da riempire.</p>`;
  if (max <= 0)
    return `<p class="spiegazione i-cattivo">Non puoi rilanciare: i crediti che ti restano bastano
            appena a coprire di un credito i ${slot} slot ancora vuoti.</p>`;
  if (max < tetto)
    return `<p class="spiegazione">Il tuo tetto vero però è <strong>${max}</strong>, non
            ${Math.round(tetto)}: hai ${creditiRimasti(miaRosa())} crediti e ${slot} slot da
            riempire, e ogni altro slot va coperto almeno con un credito.</p>`;
  return "";
}

function fraseXg(d) {
  const s = d.gol_meno_xg;
  if (s >= 3)
    return `Ha segnato <strong>${s.toFixed(1)} gol più di quanti ne suggerissero le occasioni avute</strong>.
            Una finalizzazione così difficilmente si ripete: la fantamedia attesa è stata corretta al ribasso.`;
  if (s <= -3)
    return `Ha segnato <strong>${Math.abs(s).toFixed(1)} gol meno di quanti ne suggerissero le occasioni avute</strong>.
            Se continua a crearsi le stesse situazioni i gol dovrebbero arrivare: la fantamedia attesa è stata corretta al rialzo.`;
  return "Gol realizzati in linea con le occasioni create: rendimento coerente con i dati avanzati.";
}

function chiudiPannello() {
  document.getElementById("pannello").classList.add("nascosto");
  document.getElementById("velo").classList.add("nascosto");
}

// ---------------------------------------------------------------- asta

function caricaAsta() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_ASTA) || "{}"); }
  catch { return {}; }
}
function salvaAsta() {
  try {
    localStorage.setItem(CHIAVE_ASTA, JSON.stringify(asta));
  } catch (e) {
    // Il localStorage puo' rifiutare di scrivere (navigazione privata, spazio
    // finito, permessi del sito). Se il rifiuto passa in silenzio l'acquisto
    // resta a schermo ma non e' salvato da nessuna parte, e te ne accorgi al
    // ricaricamento, cioe' troppo tardi: qui si urla subito, una volta con un
    // dialogo che non si puo' non vedere e poi in pagina.
    const guaio = `<strong>Acquisto non salvato: il browser ha rifiutato di scrivere
      (${e.name}).</strong> Quello che vedi adesso sparisce al prossimo ricaricamento.
      Esporta su file finché è a schermo.`;
    if (!_salvataggioRotto) {
      _salvataggioRotto = true;
      alert("ACQUISTO NON SALVATO\n\nIl browser ha rifiutato di scrivere nella memoria "
            + `locale (${e.name}). Gli acquisti che vedi non sopravvivono al ricaricamento: `
            + "vai su Asta ed esporta subito su file.");
    }
    avvisaAsta(guaio, "brutto");
  }
  // ogni acquisto cambia la rosa, e con la rosa cambia quanto vale per te
  // qualunque altro giocatore: i valori marginali vanno buttati tutti
  invalidaRosa();
}
let _salvataggioRotto = false;

// ------------------------------------------------- copia, esporta, ricarica
//
// Tutto quello che registri all'asta vive nel localStorage di questa origine, e
// da li' puo' sparire in un colpo solo: un "Azzera" premuto per sbaglio, un
// file ricaricato sopra, il browser che pulisce i dati del sito. Non e' un
// guasto come gli altri -- non costa qualche credito, costa l'asta intera --
// quindi ci sono tre reti, in ordine di quanto sono automatiche:
//
//   1. la copia di sicurezza su CHIAVE_COPIA, scritta da sola *prima* di ogni
//      azione distruttiva e mai durante il gioco normale. Cosi' contiene
//      sempre lo stato di un attimo prima del guaio, e non lo stato di un
//      attimo prima dell'ultimo acquisto;
//   2. l'esportazione su file, l'unica che sopravvive al browser;
//   3. la conferma di "Azzera", che dice quanti acquisti stai cancellando
//      invece di chiedere "sei sicuro?".
//
// La copia non sostituisce il file: sta nello stesso cassetto che puo' sparire.

const FORMATO_ASTA = "asta-mantra";
const VERSIONE_ASTA = 1;
const RUOLI_VALIDI = ["P", "D", "C", "A"];

// I numeri piccoli qui capitano davvero -- il primo file che ricarichi ha
// spesso una voce sola -- e un "1 acquisti" in un messaggio che ti sta
// chiedendo di cancellare tutto fa sembrare rotto anche il resto.
function conta(n, uno, molti) { return `${n} ${n === 1 ? uno : molti}`; }

function copiaDiSicurezza(motivo) {
  if (!Object.keys(asta).length) return;   // una copia vuota coprirebbe quella buona
  try {
    localStorage.setItem(CHIAVE_COPIA, JSON.stringify({
      salvato: new Date().toISOString(), motivo, asta,
    }));
  } catch { /* se non c'e' posto, il posto che c'e' va all'originale */ }
}

function copiaSalvata() {
  try {
    const c = JSON.parse(localStorage.getItem(CHIAVE_COPIA) || "null");
    if (!c || !c.asta || typeof c.asta !== "object") return null;
    const voci = Object.keys(c.asta).length;
    return voci ? { asta: c.asta, salvato: c.salvato, motivo: c.motivo, voci } : null;
  } catch { return null; }
}

function esportaAsta() {
  const voci = Object.keys(asta).length;
  if (!voci) { avvisaAsta("Non c'è ancora niente da esportare."); return; }
  const lega = DATI.riepilogo.lega;
  const contenuto = {
    formato: FORMATO_ASTA,
    versione: VERSIONE_ASTA,
    salvato: new Date().toISOString(),
    // serve solo a riconoscere il file di un'altra lega prima di ricaricarlo
    lega: { n_squadre: lega.n_squadre, crediti_iniziali: lega.crediti_iniziali },
    // la riserva cambia ogni tetto: un file che la perde per strada ti
    // rimetterebbe in mano un'asta con i numeri di un'altra strategia
    riserva,
    asta,
    preferiti,
  };
  const nome = nomeFileAsta();
  scarica(nome, JSON.stringify(contenuto, null, 2));
  avvisaAsta(`${voci === 1 ? "Esportato" : "Esportati"}
              <strong>${conta(voci, "acquisto", "acquisti")}</strong> in
              <code>${nome}</code>, dove scarica il browser.`, "buono");
}

function nomeFileAsta() {
  const d = new Date(), n = (x) => String(x).padStart(2, "0");
  return `asta-mantra-${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}`
       + `-${n(d.getHours())}${n(d.getMinutes())}.json`;
}

function scarica(nome, testo) {
  const url = URL.createObjectURL(new Blob([testo], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revocare subito annulla il download appena partito: basta lasciar passare
  // il giro di event loop in cui il browser prende il contenuto
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Legge un file esportato e dice cosa contiene, senza toccare niente. Un file
// sbagliato non deve poter cancellare l'asta in corso: qui si scarta quello che
// non e' una voce valida e si conta, la sostituzione la decide chi legge il
// resoconto.
function leggiEsportazione(testo) {
  let d;
  try { d = JSON.parse(testo); }
  catch { return { errore: "non è un file JSON leggibile." }; }
  if (!d || typeof d !== "object" || d.formato !== FORMATO_ASTA)
    return { errore: "non è un'esportazione dell'asta (manca il formato asta-mantra)." };
  if (!(Number(d.versione) <= VERSIONE_ASTA))
    return { errore: `è in versione ${d.versione}, questa pagina arriva alla ${VERSIONE_ASTA}.` };
  if (!d.asta || typeof d.asta !== "object")
    return { errore: "non contiene nessun acquisto." };

  const nuova = {};
  let scartate = 0, sconosciute = 0;
  for (const [chiave, v] of Object.entries(d.asta)) {
    if (!v || typeof v !== "object" || typeof v.nome !== "string"
        || !RUOLI_VALIDI.includes(v.ruolo)
        || !Number.isFinite(v.prezzo) || v.prezzo < 0) { scartate++; continue; }
    // una voce che non trova piu' il suo giocatore in listone si tiene lo
    // stesso: i crediti li hai spesi comunque, ed e' il conto dei crediti che
    // regge tutti i prezzi. Sparisce solo dal modulo consigliato.
    if (!riconosciuta(chiave)) sconosciute++;
    nuova[chiave] = {
      nome: v.nome, ruolo: v.ruolo, prezzo: Math.round(v.prezzo),
      mio: v.mio === true, stimato: v.stimato === true,
      ...(v.blocco
        ? { blocco: true, portieri: Array.isArray(v.portieri) ? v.portieri : [] }
        : {}),
    };
  }
  if (!Object.keys(nuova).length) return { errore: "nessuna voce leggibile." };

  return {
    asta: nuova,
    preferiti: d.preferiti && typeof d.preferiti === "object" ? d.preferiti : null,
    riserva: Number.isFinite(d.riserva) && d.riserva >= 0 ? Math.round(d.riserva) : null,
    scartate, sconosciute, salvato: d.salvato,
    altraLega: !!d.lega && d.lega.crediti_iniziali !== DATI.riepilogo.lega.crediti_iniziali,
  };
}

function riconosciuta(chiave) {
  if (chiave.startsWith("blocco:"))
    return BLOCCHI.some((b) => "blocco:" + b.squadra === chiave);
  return DATI.giocatori.some((g) => g.id === chiave);
}

function apriFileAsta(file) {
  const lettore = new FileReader();
  lettore.onerror = () => avvisaAsta("Non sono riuscito a leggere il file.", "brutto");
  lettore.onload = () => {
    const esito = leggiEsportazione(String(lettore.result));
    if (esito.errore) {
      avvisaAsta(`<strong>File non caricato:</strong> ${esito.errore}
                  L'asta di adesso non è stata toccata.`, "brutto");
      return;
    }
    const nuove = Object.keys(esito.asta).length;
    const adesso = Object.keys(asta).length;
    const mie = Object.values(esito.asta).filter((v) => v.mio);
    const spesa = mie.reduce((s, v) => s + v.prezzo, 0);

    const note = [];
    if (esito.scartate)
      note.push(esito.scartate === 1 ? "1 voce illeggibile scartata"
                                     : `${esito.scartate} voci illeggibili scartate`);
    if (esito.sconosciute)
      note.push(`${esito.sconosciute} ${esito.sconosciute === 1 ? "non è" : "non sono"}
                 più in listone: ${esito.sconosciute === 1 ? "resta" : "restano"} nel conto
                 dei crediti ma fuori dal modulo`);
    if (esito.altraLega)
      note.push("<strong>il file viene da una lega con crediti diversi da questa</strong>");

    confermaAsta({
      testo: `Il file ha <strong>${conta(nuove, "acquisto", "acquisti")}</strong>
              (${conta(mie.length, "tuo", "tuoi")}, ${spesa} crediti)${
                esito.salvato
                  ? `, ${nuove === 1 ? "salvato" : "salvati"} ${quando(esito.salvato)}`
                  : ""}.
              ${adesso ? `Vanno al posto ${adesso === 1
                            ? "dell'<strong>unico</strong> registrato adesso, che finisce"
                            : `dei <strong>${adesso}</strong> registrati adesso, che finiscono`}
                          nella copia di sicurezza.`
                       : "Adesso non c'è registrato niente, quindi non si perde nulla."}
              ${note.length ? `<span class="tenue">${note.join(" · ")}.</span>` : ""}`,
      etichetta: "Ricarica",
      azione: () => {
        copiaDiSicurezza("ricarica da file");
        asta = esito.asta;
        salvaAsta();
        if (esito.preferiti) { preferiti = esito.preferiti; salvaPreferiti(); }
        if (esito.riserva !== null) { impostaRiserva(esito.riserva); descriviRiserva(); }
        disegna();
        avvisaAsta(`${nuove === 1 ? "Ricaricato" : "Ricaricati"}
                    <strong>${conta(nuove, "acquisto", "acquisti")}</strong> dal file.`, "buono");
      },
    });
  };
  lettore.readAsText(file);
}

function chiediAzzeramento() {
  const voci = Object.keys(asta).length;
  if (!voci) { avvisaAsta("L'asta è già vuota."); return; }
  const rosa = miaRosa();
  const spesa = rosa.reduce((s, v) => s + v.prezzo, 0);
  confermaAsta({
    pericoloso: true,
    testo: `Stai per cancellare <strong>${voci === 1 ? "l'unico acquisto registrato"
                                                    : `${voci} acquisti registrati`}</strong>:
            ${conta(rosa.length, "tuo", "tuoi")} per ${spesa} crediti,
            ${voci - rosa.length} degli altri.
            Ne resta una copia di sicurezza qui sotto — ma è nello stesso browser,
            e l'unica copia che gli sopravvive è il file esportato.`,
    etichetta: voci === 1 ? "Cancella l'acquisto" : `Cancella i ${voci} acquisti`,
    azione: () => {
      copiaDiSicurezza("azzeramento");
      asta = {};
      salvaAsta();
      disegna();
      avvisaAsta("Asta azzerata. La copia di sicurezza è qui sotto, finché non ne arriva un'altra.", "buono");
    },
  });
}

function ripristinaCopia() {
  const c = copiaSalvata();
  if (!c) return;
  const adesso = Object.keys(asta).length;
  confermaAsta({
    testo: `La copia ha <strong>${conta(c.voci, "acquisto", "acquisti")}</strong>,
            di ${quando(c.salvato)} (presa prima di: ${c.motivo}).
            ${adesso ? `Vanno al posto ${adesso === 1
                            ? "dell'unico registrato adesso, che passa a sua volta nella copia"
                            : `dei ${adesso} registrati adesso, che passano a loro volta nella copia`}
                        — così anche questo si può disfare.`
                     : "Adesso non c'è registrato niente."}`,
    etichetta: "Rimetti la copia",
    azione: () => {
      copiaDiSicurezza("ripristino della copia");
      asta = c.asta;
      salvaAsta();
      disegna();
      avvisaAsta(`${c.voci === 1 ? "Rimesso" : "Rimessi"}
                  <strong>${conta(c.voci, "acquisto", "acquisti")}</strong> dalla copia.`, "buono");
    },
  });
}

// I dialoghi dell'asta stanno in pagina, non nel `confirm()` del browser: quello
// dice "sei sicuro?" senza dire di cosa, e non puo' mettere in grassetto quanti
// acquisti stai buttando. Il fuoco parte su Annulla, che e' la scelta giusta per
// chi ha premuto il bottone sbagliato di fretta.
function confermaAsta({ testo, etichetta, azione, pericoloso }) {
  const box = document.getElementById("messaggio-asta");
  box.className = "messaggio-asta" + (pericoloso ? " brutto" : "");
  box.innerHTML = `<p>${testo}</p>
    <div class="azioni-messaggio">
      <button class="secondario ${pericoloso ? "pericolo" : "conferma"}" data-si>${etichetta}</button>
      <button class="secondario" data-no>Annulla</button>
    </div>`;
  box.querySelector("[data-no]").addEventListener("click", svuotaMessaggio);
  box.querySelector("[data-si]").addEventListener("click", () => { svuotaMessaggio(); azione(); });
  box.querySelector("[data-no]").focus();
}

function avvisaAsta(html, tono) {
  const box = document.getElementById("messaggio-asta");
  if (!box) return;
  box.className = "messaggio-asta" + (tono ? " " + tono : "");
  box.innerHTML = `<p>${html}</p>`;
}

function svuotaMessaggio() {
  const box = document.getElementById("messaggio-asta");
  if (box) box.innerHTML = "";
}

function quando(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data sconosciuta";
  return d.toLocaleString("it-IT",
    { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function azioneAsta(g, azione) {
  const base = { nome: g.nome, ruolo: g.ruolo_classic };
  if (azione === "annulla") {
    delete asta[g.id];
    salvaAsta();
    chiudiPannello();
    disegna();
    return;
  }
  const mio = azione !== "altri";
  chiediPrezzo(
    mio ? `A quanto hai preso ${g.nome}?` : `A quanto è andato ${g.nome}?`,
    g.id,
    !mio,
    (p) => registra(g.id, { mio, ...base, ...p })
  );
}

function registra(chiave, voce) {
  asta[chiave] = voce;
  salvaAsta();
  chiudiPannello();
  disegna();
}

// Il prezzo si chiede dentro al pannello, non con un prompt del browser: il
// prompt blocca la pagina, sul telefono e' un dialogo di sistema e soprattutto
// perde il contesto proprio mentre l'asta corre. Qui il campo arriva gia'
// riempito col prezzo atteso e selezionato, quindi Invio conferma e basta.
//
// Il prezzo pagato dagli altri conta quanto il tuo: e' quello che dice quanti
// crediti restano in giro. Chi non lo sa svuota il campo e si tiene la stima,
// marcata come tale, che e' incomparabilmente meglio di uno zero.
function chiediPrezzo(domanda, chiave, ammettiStima, registraVoce) {
  const contenitore = document.getElementById("forma-prezzo");
  if (!contenitore) return;
  // la stessa cifra della colonna Conviene: se il listone dice che l'ultima
  // punta buona andra' a 250, il campo non puo' proporre 190
  const g_ = DATI.giocatori.find((x) => x.id === chiave);
  const f_ = fattoreLive();
  const suggerito = Math.round(
    prezzoAtteso(chiave) * f_ + (g_ ? premioScarsita(g_, f_) : 0));

  contenitore.innerHTML = `
    <form class="forma-prezzo">
      <label for="prezzo-pagato">${domanda}</label>
      <div class="riga-prezzo">
        <input type="number" id="prezzo-pagato" min="0" step="1" inputmode="numeric"
               value="${suggerito}" autocomplete="off">
        <button type="submit" class="primario">Conferma</button>
        <button type="button" class="secondario" data-annulla>Annulla</button>
      </div>
      ${ammettiStima
        ? `<p class="tenue nota-stima">Se non sai a quanto è andato svuota il campo:
           registro una stima e il mercato non si muove.</p>`
        : ""}
    </form>`;

  const campo = contenitore.querySelector("#prezzo-pagato");
  campo.focus();
  campo.select();

  contenitore.querySelector("[data-annulla]")
    .addEventListener("click", () => { contenitore.innerHTML = ""; });

  contenitore.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const testo = campo.value.trim();
    if (testo === "") {
      if (!ammettiStima) { campo.focus(); return; }
      registraVoce({ prezzo: stimaNeutra(chiave), stimato: true });
      return;
    }
    const prezzo = parseInt(testo, 10);
    if (Number.isNaN(prezzo) || prezzo < 0) { campo.select(); return; }
    registraVoce({ prezzo, stimato: false });
  });
}

function azioneBlocco(b, azione) {
  const chiave = "blocco:" + b.squadra;
  const base = {
    nome: "Porta " + b.squadra, ruolo: "P", blocco: true,
    portieri: b.portieri.map((p) => p.nome),
  };
  if (azione === "annulla") {
    delete asta[chiave];
    salvaAsta();
    chiudiPannello();
    disegna();
    return;
  }
  const mio = azione !== "altri";
  chiediPrezzo(
    mio ? `A quanto hai preso il blocco portieri del ${b.squadra}?`
        : `A quanto è andato il blocco portieri del ${b.squadra}?`,
    chiave,
    !mio,
    (p) => registra(chiave, { mio, ...base, ...p })
  );
}

// Messa in cache sullo stesso gancio dei valori marginali. Non e' un vezzo:
// con la rosa accesa `disegna()` la chiamava **1161 volte per un solo
// ridisegno** -- una per riga, dentro `offertaMassima` -- e ognuna riscorreva
// tutti gli acquisti registrati. A meta' asta faceva 200 ms a battuta sulla
// ricerca, e la ricerca ridisegna a ogni tasto premuto.
// Nessun chiamante modifica l'array che esce di qui: verificato uno per uno.
let _rosa = null;

function miaRosa() {
  if (_rosa) return _rosa;
  return (_rosa = Object.entries(asta).filter(([, v]) => v.mio).map(([id, v]) => ({ id, ...v })));
}

// Quanti acquisti ti mancano per chiudere la rosa. In Mantra la composizione e'
// libera: l'unico tetto vero e' il numero di blocchi portieri, il resto sono
// posti che si contendono fra loro.
function slotDaRiempire(rosa) {
  const lega = DATI.riepilogo.lega;
  const blocchiPresi = rosa.filter((v) => v.ruolo === "P").length;
  const movimentoPresi = rosa.length - blocchiPresi;
  return (lega.giocatori_movimento - movimentoPresi) +
         (aBlocchi ? lega.blocchi_per_squadra - blocchiPresi : 0);
}

// I crediti che hai davvero, cioe' al netto della riserva che ti tieni per
// l'asta di riparazione. Sottrarla QUI e in nessun altro posto e' la scelta
// che fa funzionare tutto il resto da solo: offerta massima, media per slot,
// tetti dei blocchi e `scalaRosa` leggono tutti da questa funzione.
//
// E soprattutto: `budgetIniziale()` NON va toccato. Quello resta sui crediti
// pieni della lega, perche' e' il termine di paragone su cui il listone e'
// calibrato -- gli altri nove hanno mille crediti a testa e li spenderanno
// tutti. La riserva deve abbassare i TUOI tetti sotto i prezzi di lega, ed e'
// esattamente quello che succede: con 150 di riserva `scalaRosa` parte da
// 0,84 invece che da 1, e ogni tetto scende del 16%. Sottraendola da tutte e
// due le parti del rapporto si sarebbe semplificata e non avrebbe fatto
// niente, che e' il modo silenzioso in cui questa cosa poteva non funzionare.
function creditiRimasti(rosa) {
  return DATI.riepilogo.lega.crediti_iniziali - riserva
       - rosa.reduce((s, v) => s + v.prezzo, 0);
}

function caricaRiserva() {
  const v = parseInt(localStorage.getItem(CHIAVE_RISERVA) || "0", 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

// Il tetto e' l'offerta massima a rosa vuota: oltre non e' una riserva, e'
// un'asta che non puoi giocare.
function impostaRiserva(v) {
  const lega = DATI.riepilogo.lega;
  const slot = lega.giocatori_movimento + (aBlocchi ? lega.blocchi_per_squadra : 0);
  const massimo = Math.max(0, lega.crediti_iniziali - slot);
  riserva = Math.max(0, Math.min(massimo, Math.round(v) || 0));
  try { localStorage.setItem(CHIAVE_RISERVA, String(riserva)); } catch { /* non e' un acquisto */ }
  invalidaRosa();
  return riserva;
}

// Il massimo che puoi mettere sul piatto per un giocatore solo. Ogni altro
// slot che ti resta va comunque coperto, e all'asta nessuno si prende per
// meno di un credito: quei crediti sono gia' impegnati, anche se sono ancora
// nel portafoglio. Con 20 crediti e due giocatori da prendere l'offerta
// massima e' 19, non 20.
let _offerta = null;

function offertaMassima() {
  if (_offerta !== null) return _offerta;
  const rosa = miaRosa();
  const slot = slotDaRiempire(rosa);
  if (slot <= 0) return (_offerta = 0);
  return (_offerta = Math.max(0, creditiRimasti(rosa) - (slot - 1)));
}

// Cosa fa quel numero, detto in crediti e non in percentuali. La riserva
// abbassa i tetti di tutto il listone in proporzione, e il posto dove si vede
// meglio e' l'offerta massima a rosa vuota: quello e' il numero con cui
// rilanci sul primo giocatore che passa.
function descriviRiserva() {
  const el = document.getElementById("riserva-effetto");
  if (!el) return;
  if (!riserva) {
    el.textContent = "A zero giochi con tutti i crediti, come sempre. "
      + "Mettine da parte una quota e i tetti scendono in proporzione su tutto il listone.";
    el.classList.remove("i-buono");
    document.getElementById("riserva-crediti").value = riserva;
    return;
  }
  const lega = DATI.riepilogo.lega;
  const quota = riserva / lega.crediti_iniziali;
  el.innerHTML = `Giochi con <strong>${lega.crediti_iniziali - riserva}</strong> crediti invece di
    ${lega.crediti_iniziali}: ogni tetto scende del <strong>${Math.round(quota * 100)}%</strong> circa,
    e i ${riserva} restano per gennaio. I prezzi di lega non si toccano — gli altri nove
    li spendono tutti, ed è contro quelli che stai rilanciando.`;
  el.classList.add("i-buono");
}

function aggiornaBarraAsta() {
  const lega = DATI.riepilogo.lega;
  const rosa = miaRosa();
  const rimasti = creditiRimasti(rosa);
  const daPrendere = slotDaRiempire(rosa);
  const blocchiPresi = rosa.filter((v) => v.ruolo === "P").length;

  const elCr = document.getElementById("crediti-rimasti");
  elCr.textContent = rimasti;
  // Un portafoglio ridotto in silenzio a meta' asta e' il modo peggiore di
  // aiutare: se la riserva e' accesa deve vedersi dove guardi i crediti.
  elCr.title = riserva
    ? `${riserva} crediti tenuti da parte per l'asta di riparazione: non sono qui dentro.`
    : "";
  const nota = document.getElementById("riserva-in-barra");
  if (nota) nota.textContent = riserva ? `+${riserva} in riserva` : "";
  document.getElementById("slot-rimasti").textContent = daPrendere;
  document.getElementById("media-slot").textContent =
    daPrendere > 0 ? (rimasti / daPrendere).toFixed(1) : "—";

  const massima = offertaMassima();
  const elMax = document.getElementById("offerta-massima");
  elMax.textContent = daPrendere > 0 ? massima : "—";
  // rosso quando il portafoglio non copre nemmeno un credito per slot: da li'
  // in poi non stai piu' scegliendo, stai solo riempiendo
  elMax.className = daPrendere > 0 && massima <= 0 ? "i-cattivo" : "";

  // In Mantra la composizione e' libera: i conteggi per ruolo sono informativi,
  // l'unico limite vero e' il numero di blocchi portieri.
  const perRuolo = ["D", "C", "A"]
    .map((m) => `${m} ${rosa.filter((v) => v.ruolo === m).length}`)
    .join("  ");
  document.getElementById("rosa-ruoli").textContent = aBlocchi
    ? `Blocchi ${blocchiPresi}/${lega.blocchi_per_squadra}  ·  ${perRuolo}`
    : perRuolo;

  aggiornaTitolariLiberi();
  aggiornaMercato();
  aggiornaModulo();
  programmaMisuraCornice();   // il contenuto qui sopra puo' aver cambiato altezza
}

// Il modulo consigliato sta anche nella barra, perché la domanda "questo
// giocatore mi serve?" viene mentre guardi il listone, non la tua rosa.
function aggiornaModulo() {
  const el = document.getElementById("modulo-consigliato");
  const risultato = moduliMigliori();
  if (!risultato) {
    el.textContent = "—";
    el.title = "Compare dopo il primo acquisto di movimento";
    return;
  }
  const m = risultato.esiti[0];
  el.textContent = m.modulo;
  el.title = `${m.dentro.length} su ${risultato.rosa.length} ci ${m.dentro.length === 1 ? "entra" : "entrano"}` +
    (m.vuote.length ? ` · mancano ${m.vuote.join(", ").toUpperCase()}` : " · undici al completo");
}

// Quanti giocatori da titolare restano ancora da contendere. E' il numero che
// dice se conviene aspettare: finche' ce ne sono in abbondanza il prezzo lo
// fa la concorrenza, quando restano gli ultimi lo fa la disperazione.
function aggiornaTitolariLiberi() {
  const liberi = { D: 0, C: 0, A: 0 };
  const totali = { D: 0, C: 0, A: 0 };
  for (const g of DATI.giocatori) {
    if (!g.titolare_di_lega || totali[g.ruolo_classic] === undefined) continue;
    totali[g.ruolo_classic]++;
    if (!asta[g.id]) liberi[g.ruolo_classic]++;
  }
  document.getElementById("titolari-liberi").innerHTML = ["D", "C", "A"]
    .map((m) => `<span class="conta-ruolo r-${m}" title="${liberi[m]} liberi su ${totali[m]} ${NOMI_MACRO[m].toLowerCase()} da titolare">${m} ${liberi[m]}</span>`)
    .join(" ");
}

function aggiornaMercato() {
  const f = scostamentoMercato();
  const scarti = Math.round((f - 1) * 100);
  const el = document.getElementById("scostamento-mercato");
  el.textContent = scarti === 0 ? "in linea" : `${scarti > 0 ? "+" : ""}${scarti}%`;
  // stessa convenzione della colonna Affare: verde quando conviene a te, e a
  // te conviene che restino pochi crediti a caccia di quello che vuoi tu
  el.className = scarti <= -5 ? "i-buono" : scarti >= 5 ? "i-cattivo" : "";
  el.title = scarti > 0
    ? "In lega restano più crediti di quanto vale la roba ancora libera: quello che manca si pagherà sopra il listone"
    : scarti < 0
      ? "In lega restano meno crediti di quanto vale la roba ancora libera: quello che manca si comprerà a sconto"
      : "Crediti e valore residui sono ancora in equilibrio";
}

// ------------------------------------------------- su quale modulo puntare
//
// Contare i ruoli non basta: un T/A copre due caselle diverse e dove lo metti
// cambia chi ci sta accanto. E' un problema di abbinamento fra giocatori e
// caselle, e va risolto come tale.
//
// I giocatori entrano dal piu' caro al meno caro e ogni volta si prova a
// riorganizzare le assegnazioni gia' fatte per fargli posto (cammino
// aumentante). Prendendoli in quest'ordine l'insieme che ne esce e' quello di
// valore massimo che entra davvero in campo, non una buona approssimazione:
// le caselle assegnabili formano un matroide, e li' il greedy e' esatto.
function _sistema(g, caselle, occupate, visti) {
  for (let i = 0; i < caselle.length; i++) {
    if (visti[i] || !caselle[i].split("/").some((r) => g.ruoli.includes(r))) continue;
    visti[i] = true;
    if (occupate[i] === null || _sistema(occupate[i], caselle, occupate, visti)) {
      occupate[i] = g;
      return true;
    }
  }
  return false;
}

function schieraIn(modulo, rosa) {
  const caselle = MODULI[modulo];
  const occupate = new Array(caselle.length).fill(null);
  const dentro = [];
  for (const g of rosa.slice().sort((a, b) => b.valore - a.valore)) {
    if (_sistema(g, caselle, occupate, new Array(caselle.length).fill(false))) dentro.push(g);
  }
  return {
    modulo,
    dentro,
    valore: dentro.reduce((s, g) => s + g.valore, 0),
    fuori: rosa.filter((g) => !dentro.includes(g)),
    vuote: caselle.filter((_, i) => occupate[i] === null),
  };
}

// La rosa di movimento con i ruoli mantra, che in `asta` non ci sono
let _rosaMov = null;

function rosaDiMovimento() {
  if (_rosaMov) return _rosaMov;
  // il `find` qui dentro costa: senza cache `valoreMarginale` lo rifaceva per
  // ogni giocatore del listone, ed era il primo ridisegno dopo un acquisto a
  // pagarlo tutto insieme (quasi un secondo, misurato)
  const fuori = [];
  for (const v of miaRosa()) {
    if (v.blocco) continue;                    // il portiere e' un blocco a parte
    const g = DATI.giocatori.find((x) => x.id === v.id);
    if (!g) continue;
    fuori.push({
      id: g.id, nome: g.nome, ruoli: g.ruoli_mantra,
      valore: g.prezzo_consigliato || v.prezzo || 1,
      pagato: v.prezzo,
    });
  }
  return (_rosaMov = fuori);
}

function moduliMigliori() {
  const rosa = rosaDiMovimento();
  if (!rosa.length) return null;
  const esiti = Object.keys(MODULI).map((m) => schieraIn(m, rosa));
  // a parita' di valore schierato vince chi ne fa entrare di piu': una rosa
  // che riempie piu' caselle lascia meno buchi da comprare
  esiti.sort((a, b) => (b.valore - a.valore) || (b.dentro.length - a.dentro.length));
  return { rosa, esiti };
}

// Controlli di composizione della rosa. Non sono regole del gioco ma
// convenzioni d'asta documentate, e servono a intercettare i due errori che
// costano di piu': restare corti dietro, dove squalifiche e infortuni ti
// fanno giocare in dieci, e immobilizzare crediti in punte che non
// schiererai mai. Le soglie dipendono dal modulo verso cui stai andando.
function controlliRosa(migliore, rosa) {
  const caselle = MODULI[migliore.modulo];
  const difensori = caselle.filter((c) => ["dd", "ds", "dc", "dc/b"].includes(c)).length;
  const punte = caselle.filter((c) => c.split("/").some((r) => ["a", "pc"].includes(r))).length;
  const conta = (r) => rosa.filter((g) => g.ruoli.includes(r)).length;

  const avvisi = [];

  // dietro si resta corti sempre: il reparto e' quello piu' colpito da
  // squalifiche e infortuni, e un buco li' vale un malus o un uomo in meno
  const centraliServono = difensori >= 4 ? 8 : 7;
  const centrali = conta("dc") + conta("b");
  // A inizio asta non hai difensori perche' non hai ancora comprato niente:
  // dirtelo sarebbe rumore. Vale la pena avvisare quando gli slot che
  // restano non bastano piu' comodamente a coprire il buco.
  const margine = slotDaRiempire(miaRosa()) - (centraliServono - centrali);
  if (centrali < centraliServono && margine < 6) {
    avvisi.push({
      tipo: "manca",
      testo: `Hai <strong>${centrali} difensori centrali</strong>: con una difesa a ${difensori}
              ne servono almeno ${centraliServono}. È il reparto più falcidiato da squalifiche e
              infortuni, e restare corti lì significa regalare malus.`,
    });
  }

  // le punte in eccesso sono crediti fermi in panchina, e tolgono slot altrove
  const tettoPunte = punte >= 2 ? 4 : 3;
  const pc = conta("pc");
  if (pc > tettoPunte) {
    avvisi.push({
      tipo: "troppi",
      testo: `Hai <strong>${pc} punte centrali</strong> e il ${migliore.modulo} ne schiera
              ${punte}: oltre ${tettoPunte} sono crediti fermi in panchina e slot tolti
              agli altri reparti.`,
    });
  }

  // la E e' il ruolo piu' povero del listone: i moduli che ne chiedono due
  // ti espongono a non trovarne una decente per tutta l'asta
  const esterniRichiesti = caselle.filter((c) => c === "e").length;
  if (esterniRichiesti >= 2 && conta("e") < 2) {
    avvisi.push({
      tipo: "rischio",
      testo: `Il ${migliore.modulo} chiede <strong>due E pure</strong> e in tutto il listone
              gli esterni di livello si contano sulle dita: è il modulo più rischioso da
              inseguire se non ne hai già almeno uno.`,
    });
  }
  return avvisi;
}

// -------------------------------------------- quanto vale per la TUA rosa
//
// Il prezzo consigliato dice quanto vale un giocatore in una lega, non quanto
// vale a te. Sono la stessa cosa solo finche' la rosa e' vuota. Il motore
// misura il vantaggio sul sostituto che *la lega* schiererebbe al suo posto,
// ma appena hai preso un PC top il sostituto vero di un secondo PC top sei
// tu: quello che hai gia'. Il vantaggio se lo mangia da solo, e continuare a
// leggere il prezzo generico ti fa pagare due volte la stessa casella.
//
// Quello che conta e' di quanto un giocatore alza l'undici che schiererai, ed
// e' esattamente il problema di abbinamento gia' risolto per il modulo
// consigliato: valore del miglior undici con lui dentro meno quello senza. Se
// le sue caselle sono gia' occupate da gente piu' forte la differenza e' zero,
// e allora vale un credito per te anche se in listone ne vale cento.

let _marginale = new Map();   // id -> di quanto alza il tuo undici
let _baseXI = null;           // valore del tuo undici cosi' com'e'
let _scala = null;            // il cambio fra valore marginale e crediti

// Da chiamare a ogni acquisto: la rosa e' cambiata e tutto va rifatto.
function invalidaRosa() {
  _marginale = new Map();
  _baseXI = null;
  _scala = null;
  _fasceVive = null;   // le bande di prezzo delle fasce sono tetti anche loro
  _premi = null;       // e con gli acquisti cambia quanto si e' svuotata ogni fascia
  _rosa = null;        // la rosa stessa, e tutto quello che si conta sopra
  _rosaMov = null;
  _offerta = null;
}

function valoreXI(rosa) {
  let migliore = 0;
  for (const modulo of Object.keys(MODULI)) {
    const v = schieraIn(modulo, rosa).valore;
    if (v > migliore) migliore = v;
  }
  return migliore;
}

function baseXI() {
  if (_baseXI === null) _baseXI = valoreXI(rosaDiMovimento());
  return _baseXI;
}

function _voce(g) {
  return { id: g.id, nome: g.nome, ruoli: g.ruoli_mantra, valore: g.prezzo_consigliato || 1 };
}

// Di quanto alza il tuo undici, in crediti di valore schierato. Per chi hai
// gia' preso e' quello che ti sta dando adesso, quindi lo tolgo e rimetto.
function valoreMarginale(g) {
  if (g.prezzo_consigliato === null || g.prezzo_consigliato === undefined) return null;
  // Un blocco portieri ha un prezzo ma non e' un giocatore: e' una squadra, non
  // ha ruoli Mantra e in un modulo non ci va. Passarlo al risolutore lo faceva
  // schiantare su `ruoli.includes`, e con l'interruttore acceso la scheda
  // Portieri smetteva di disegnarsi. Qui il valore marginale non ha senso:
  // chi compra un blocco compra la porta per tutte e 38 le giornate.
  if (!Array.isArray(g.ruoli_mantra) || g.acquisto_a_blocchi) return null;
  if (_marginale.has(g.id)) return _marginale.get(g.id);
  const rosa = rosaDiMovimento();
  const mio = rosa.some((v) => v.id === g.id);
  const senza = mio ? valoreXI(rosa.filter((v) => v.id !== g.id)) : baseXI();
  const con = mio ? baseXI() : valoreXI(rosa.concat([_voce(g)]));
  const mv = Math.max(0, con - senza);
  _marginale.set(g.id, mv);
  return mv;
}

// ------------------------------------------- i blocchi portieri, in coppia
//
// Con i blocchi se ne comprano due e ogni giornata se ne schiera uno solo,
// quindi il secondo non vale quanto e' forte: vale quanto e' *complementare*
// al primo. Se hai gia' la porta dell'Atalanta, che e' buona tutte le
// settimane, un secondo blocco entra in campo di rado e ti aggiunge poco; se
// il primo e' di media classifica, il secondo lo alterni davvero e conta.
//
// Il valore di una coppia e' la somma, sulle 38 giornate, del migliore dei
// due: e' la stessa idea dell'undici titolare applicata alla porta. Il valore
// per giornata lo calcola la build dal calendario e dai gol attesi (vedi
// fanta/coppie.py), quindi qui si tratta solo di sommare.

function blocchiMiei() {
  return BLOCCHI.filter((b) => (asta["blocco:" + b.squadra] || {}).mio);
}

function bloccheMancanti() {
  const lega = DATI.riepilogo.lega;
  return Math.max(0, (lega.blocchi_per_squadra || 0) - blocchiMiei().length);
}

function valoreBlocchi(lista) {
  const conCalendario = lista.filter((b) => b.giornate && b.giornate.length);
  if (!conCalendario.length) return 0;
  let somma = 0;
  for (let g = 0; g < conCalendario[0].giornate.length; g++) {
    let migliore = -Infinity;
    for (const b of conCalendario) {
      const v = b.giornate[g] ? b.giornate[g].fm : -Infinity;
      if (v > migliore) migliore = v;
    }
    somma += migliore;
  }
  return somma;
}

// Di quanto un blocco alza il rendimento della tua porta, dati quelli che hai.
function valoreMarginaleBlocco(b) {
  if (!b.giornate || !b.giornate.length) return null;
  const miei = blocchiMiei().filter((x) => x.squadra !== b.squadra);
  return valoreBlocchi(miei.concat([b])) - valoreBlocchi(miei);
}

// La fetta di budget che spetta ai portieri, e quanta ne e' rimasta. La quota
// non la decido qui: la calcola il motore mettendo blocchi e giocatori in
// concorrenza sullo stesso budget, ed e' nel riepilogo.
function quotaBlocchi() {
  const r = DATI.riepilogo;
  const lega = r.lega;
  const quota = lega.crediti_iniziali * (r.quota_budget_portieri || 0);
  const spesi = blocchiMiei().reduce(
    (s, b) => s + (asta["blocco:" + b.squadra].prezzo || 0), 0);
  return { quota, spesi, rimasti: Math.max(0, quota - spesi) };
}

// Quanti crediti per blocco ti restano, rispetto a quanti ne avevi. Stessa
// idea della scala sui giocatori: la quota di budget che spetta ai portieri la
// decide il motore mettendo blocchi e giocatori in concorrenza, e se il primo
// blocco te la mangia tutta il secondo lo devi prendere con gli spiccioli.
// Il conto va fatto sul portafoglio intero, non sulla quota portieri. La quota
// e' l'allocazione che suggerisce il motore, non un muro: se prendi la porta
// dell'Atalanta a 133 hai speso quasi il doppio di quella quota, ma non e' che
// il secondo blocco ti tocchi per forza a un credito -- hai ancora 867 crediti
// e 25 caselle. Misurare sulla quota portava la scala a zero e sparava tutti i
// blocchi a un credito, che e' un consiglio sbagliato.
function scalaBlocchi() {
  const lega = DATI.riepilogo.lega;
  const rosa = miaRosa();
  const slotTotali = lega.giocatori_movimento + (aBlocchi ? lega.blocchi_per_squadra : 0);
  const rimasti = slotDaRiempire(rosa);
  if (rimasti <= 0) return 0;
  const inizio = lega.crediti_iniziali / slotTotali;
  return inizio > 0 ? Math.max(0, (creditiRimasti(rosa) / rimasti) / inizio) : 1;
}

// Il tetto per la tua rosa su un blocco: il prezzo di listino ridotto a quanto
// quel blocco aggiunge davvero alla porta che hai gia', e riscalato sui
// crediti che ti restano per i portieri. E' la stessa forma usata sui
// giocatori, e come li' a rosa vuota i due fattori valgono uno e il tetto
// personale coincide con quello di listino.
//
// Il vantaggio va misurato sul *riferimento*, non sullo zero: un secondo
// blocco non e' facoltativo, ne devi comprare due, quindi l'alternativa non e'
// restare senza ma prendere un altro blocco. Senza questo il secondo blocco
// crollava a un credito qualunque fosse.
function prezzoBloccoPerLaTuaRosa(b) {
  const base = vivo(b.prezzo_consigliato, fattoreLive());
  if (base === null) return null;
  // un blocco gia' assegnato non e' piu' una decisione: resta al prezzo di
  // lega, altrimenti il conto sul valore marginale lo faceva esplodere
  if (asta["blocco:" + b.squadra]) return Math.round(base);

  const mancanti = bloccheMancanti();
  if (mancanti <= 0) return 0;
  const scala = scalaBlocchi();
  const miei = blocchiMiei();
  if (!miei.length) return Math.max(1, Math.round(base * scala));

  const liberi = BLOCCHI.filter((x) => !asta["blocco:" + x.squadra]);
  const valori = liberi
    .map((x) => valoreMarginaleBlocco(x))
    .filter((v) => v !== null)
    .sort((x, y) => y - x);
  const mio = valoreMarginaleBlocco(b);
  if (!valori.length || mio === null || !b.surplus) {
    return Math.max(1, Math.round(base * scala));
  }

  // stesso riferimento del motore: non il peggiore, il migliore ancora libero
  // se quello che vuoi ti sfugge
  const i = Math.min(Math.round((valori.length - 1) * 0.62), valori.length - 1);
  const surplus = Math.max(0, mio - valori[i]);

  // Quanto di quello che valeva ti sta ancora dando, misurato sulla stessa
  // grandezza che il motore usa per prezzarlo: il vantaggio sul blocco di
  // riferimento. Normalizzarlo invece sul migliore disponibile terrebbe i
  // prezzi alti anche quando l'intera scelta e' diventata irrilevante -- e
  // dopo il primo blocco lo diventa, perche' i secondi si giocano cinque
  // fantapunti contro i duecento del primo.
  const quota = surplus / b.surplus;
  return Math.max(1, Math.min(offertaMassima(), Math.round(base * quota * scala)));
}

// Come si sposa con quello che hai gia': i due numeri che si guardano a mano,
// piu' i clean sheet attesi. Serve a controllare che il modello non stia
// dicendo assurdita', e a decidere quando i prezzi si somigliano.
function coppiaCon(b) {
  const miei = blocchiMiei().filter((x) => x.squadra !== b.squadra);
  if (!miei.length || !b.giornate) return null;
  const a = miei[0];
  if (!a.giornate) return null;

  let casa = 0, dure = 0, cs = 0;
  const soglia = 1.3;   // gol attesi oltre i quali la giornata e' scomoda
  for (let i = 0; i < b.giornate.length; i++) {
    const x = a.giornate[i], y = b.giornate[i];
    if (!x || !y) continue;
    if (x.casa || y.casa) casa++;
    if (x.gol_attesi > soglia && y.gol_attesi > soglia) dure++;
    cs += Math.max(x.clean_sheet, y.clean_sheet);
  }
  return { con: a.squadra, casa, dure, clean_sheet: Math.round(cs) };
}

function slotMovimento(rosa) {
  const presi = rosa.filter((v) => v.ruolo !== "P").length;
  return Math.max(0, DATI.riepilogo.lega.giocatori_movimento - presi);
}

// I blocchi portieri vanno comprati comunque: quei crediti non sono
// disponibili per il resto della rosa. Metto da parte il prezzo del blocco
// mediano fra quelli ancora liberi, non del migliore: uno lo prendi di
// sicuro, che sia il migliore rimasto non e' detto.
function creditiPerMovimento(rosa) {
  const lega = DATI.riepilogo.lega;
  const crediti = creditiRimasti(rosa);
  if (!aBlocchi) return crediti;
  const mancanti = Math.max(0, lega.blocchi_per_squadra - rosa.filter((v) => v.ruolo === "P").length);
  if (!mancanti) return crediti;
  const liberi = BLOCCHI.filter((b) => !asta["blocco:" + b.squadra])
    .map((b) => b.prezzo_consigliato).sort((a, b) => a - b);
  const mediano = liberi.length ? liberi[Math.floor(liberi.length / 2)] : 1;
  return Math.max(0, crediti - mancanti * mediano);
}

// Il budget di movimento con cui parti, che e' il termine di paragone di
// tutto: se hai piu' crediti per slot di cosi' puoi permetterti di piu' del
// listone, se ne hai meno devi stare sotto.
function budgetIniziale() {
  const lega = DATI.riepilogo.lega;
  let crediti = lega.crediti_iniziali;
  if (aBlocchi && BLOCCHI.length) {
    const prezzi = BLOCCHI.map((b) => b.prezzo_consigliato).sort((a, b) => a - b);
    crediti -= lega.blocchi_per_squadra * prezzi[Math.floor(prezzi.length / 2)];
  }
  return crediti;
}

// Quanti crediti per slot ti restano, rispetto a quanti ne avevi all'inizio.
//
// E' il pezzo che manca al valore marginale. Un secondo attaccante top puo'
// alzare l'undici quanto il primo -- i moduli con due caselle davanti
// esistono -- ma comprarlo a prezzo pieno lascia ventidue slot da coprire con
// gli spiccioli, e quella rosa la perdi. Il conto e' aritmetica, non
// prudenza: se il tuo budget medio per slot e' sceso da 34 a 20 crediti, il
// tetto su tutto quello che compri e' sceso nella stessa proporzione.
//
// Vale anche al contrario, ed e' li' che si vincono le aste: se sei arrivato
// in fondo con venti giocatori presi per un credito, sui quattro slot che ti
// restano puoi permetterti quello che vuoi.
function scalaRosa() {
  if (_scala !== null) return _scala;
  const rosa = miaRosa();
  const slot = slotMovimento(rosa);
  if (slot <= 0) return (_scala = 0);
  const inizio = budgetIniziale() / DATI.riepilogo.lega.giocatori_movimento;
  const ora = creditiPerMovimento(rosa) / slot;
  let scala = inizio > 0 ? Math.max(0, ora / inizio) : 1;

  // Nel finale d'asta i crediti per slot esplodono -- venti giocatori presi a
  // un credito e quattro slot da riempire -- e moltiplicando alla lettera
  // ogni tetto sfonderebbe l'offerta massima. Schiacciati tutti li' sopra i
  // prezzi smettono di dire quale prendere, che e' l'unica cosa che serve in
  // quel momento. Tengo quindi il migliore disponibile esattamente al tuo
  // massimo e tutti gli altri in proporzione: il tetto resta vero e l'ordine
  // sopravvive.
  const max = offertaMassima();
  let cima = 0;
  for (const g of DATI.giocatori) {
    if (g.acquisto_a_blocchi || asta[g.id]) continue;
    const mv = valoreMarginale(g);
    if (mv !== null && mv > cima) cima = mv;
  }
  if (cima > 0 && cima * scala > max) scala = max / cima;
  return (_scala = scala);
}

// Il giocatore che quello slot comprerebbe comunque, alla tua media per slot:
// e' il metro contro cui giudicare un rilancio, e serve anche a dare un nome
// al confronto invece di lasciarlo astratto.
function ripiego() {
  const rosa = miaRosa();
  const slot = slotMovimento(rosa);
  if (slot <= 0) return null;
  const media = creditiPerMovimento(rosa) / slot;
  const f = fattoreLive();
  let migliore = null;
  for (const g of DATI.giocatori) {
    if (g.acquisto_a_blocchi || asta[g.id]) continue;
    if (g.prezzo_consigliato === null || g.prezzo_consigliato === undefined) continue;
    const costo = (costoAtteso(g, f) ?? g.prezzo_consigliato * f);
    if (costo > media) continue;
    const mv = valoreMarginale(g);
    if (!migliore || mv > migliore.mv) migliore = { nome: g.nome, costo: Math.round(costo), mv };
  }
  return migliore;
}

// Il tetto d'offerta per la tua rosa, in crediti.
//
// E' il valore marginale -- di quanto alza l'undici che schiererai -- portato
// sulla scala dei crediti che ti restano. A rosa vuota i due fattori valgono
// esattamente uno e il tetto personale coincide con quello di listone: e' la
// condizione al contorno giusta, perche' finche' non hai comprato niente la
// tua rosa e' una rosa qualsiasi.
//
// Sopra c'e' comunque l'offerta massima: un tetto che non puoi pagare non e'
// un tetto.
function prezzoPerLaTuaRosa(g) {
  const mv = valoreMarginale(g);
  if (mv === null) return null;
  const max = offertaMassima();
  if (max <= 0) return 0;
  return Math.max(1, Math.min(max, Math.round(mv * scalaRosa())));
}

// Se il tetto personale e' crollato rispetto al listone, il perche' e' una
// domanda concreta con una risposta concreta: quale casella e' gia' occupata
// e da chi. Vale la pena dirlo, perche' e' l'informazione che ti fa scegliere
// un altro ruolo invece di rilanciare per abitudine.
function spiegaMarginale(g) {
  const rosa = rosaDiMovimento().filter((v) => v.id !== g.id);
  if (!rosa.length) return null;
  let senza = null, con = null;
  for (const modulo of Object.keys(MODULI)) {
    const a = schieraIn(modulo, rosa);
    const b = schieraIn(modulo, rosa.concat([_voce(g)]));
    if (!senza || a.valore > senza.valore) senza = a;
    if (!con || b.valore > con.valore) con = b;
  }
  if (!con.dentro.some((x) => x.id === g.id)) {
    return { entra: false, spinto: null, modulo: con.modulo };
  }
  const spinto = senza.dentro.find((x) => !con.dentro.some((y) => y.id === x.id));
  return { entra: true, spinto: spinto ? spinto.nome : null, modulo: con.modulo };
}

function disegnaModuli() {
  const contenitore = document.getElementById("moduli-contenitore");
  const risultato = moduliMigliori();
  if (!risultato) {
    contenitore.innerHTML =
      '<div class="vuoto">Prendi qualche giocatore e qui comparirà il modulo su cui conviene puntare.</div>';
    return;
  }
  const { rosa, esiti } = risultato;
  const migliore = esiti[0];

  // Restare fuori dall'undici non e' di per se' uno spreco: a rosa piena
  // quattordici giocatori su ventiquattro sono panchina per forza. Lo spreco
  // e' aver pagato da titolare uno che titolare non ci va, quindi guardo solo
  // i dieci piu' cari: se uno di loro non entra, quei crediti stanno fermi.
  const piuCari = rosa.slice().sort((a, b) => b.valore - a.valore).slice(0, 10);
  const sprecati = piuCari
    .filter((g) => !migliore.dentro.includes(g))
    .map((g) => ({ ...g, altrove: esiti.filter((e) => e.dentro.includes(g)).length }));

  const conteggio = {};
  for (const casella of migliore.vuote) conteggio[casella] = (conteggio[casella] || 0) + 1;
  const mancanti = Object.entries(conteggio)
    .map(([casella, n]) => `<span class="casella-vuota">${n > 1 ? n + "× " : ""}${casella.toUpperCase()}</span>`)
    .join("");

  contenitore.innerHTML = `
    <div class="modulo-scelto">
      <div>
        <span class="etichetta">Punta al</span>
        <span class="nome-modulo">${migliore.modulo}</span>
      </div>
      <div class="tenue">${migliore.dentro.length} dei tuoi ${rosa.length}
        ${migliore.dentro.length === 1 ? "ci entra" : "ci entrano"}, per
        ${Math.round(migliore.valore)} crediti di valore schierato</div>
      ${migliore.vuote.length
        ? `<div class="mancanti"><span class="etichetta">Ti mancano</span> ${mancanti}</div>`
        : '<div class="mancanti i-buono">Undici al completo: da qui in poi compri solo panchina.</div>'}
    </div>

    ${sprecati.map((g) => `<p class="spiegazione avviso-sprechi">
        <strong>${g.nome}</strong> è fra i tuoi giocatori più cari ma nel ${migliore.modulo}
        non trova posto: ${g.altrove === 0
          ? "e non lo trova in <strong>nessuno</strong> degli undici moduli, insieme al resto della rosa."
          : `entrerebbe in ${g.altrove} moduli su ${esiti.length}, ma nessuno di quelli sfrutta la rosa altrettanto bene.`}</p>`).join("")}

    ${controlliRosa(migliore, rosa).map((a) =>
      `<p class="spiegazione controllo-rosa controllo-${a.tipo}">${a.testo}</p>`).join("")}

    <h3 class="titolo-moduli">Le alternative</h3>
    <table class="tabellina">
      <tr><th>Modulo</th><th>In campo</th><th>Valore</th><th>Caselle da riempire</th></tr>
      ${esiti.slice(0, 5).map((e) => `<tr${e === migliore ? ' class="modulo-migliore"' : ""}>
        <td><strong>${e.modulo}</strong></td>
        <td>${e.dentro.length}/10</td>
        <td>${Math.round(e.valore)}</td>
        <td class="tenue">${e.vuote.length ? e.vuote.join(", ").toUpperCase() : "nessuna"}</td>
      </tr>`).join("")}
    </table>`;
}

// La riga della copia di sicurezza si ridisegna con la rosa, non solo dopo
// l'azione che l'ha creata: serve soprattutto a chi apre la pagina il giorno
// dopo e trova l'asta vuota, e in quel momento il messaggio di allora e' sparito.
function disegnaCopia() {
  const box = document.getElementById("copia-asta");
  const c = copiaSalvata();
  if (!c) { box.innerHTML = ""; return; }
  box.innerHTML = `<span class="tenue">Copia di sicurezza ·
      ${conta(c.voci, "acquisto", "acquisti")} · ${quando(c.salvato)},
      prima di: ${c.motivo}</span>
      <button class="secondario" id="ripristina-copia">Rimetti la copia</button>`;
  document.getElementById("ripristina-copia")
    .addEventListener("click", ripristinaCopia);
}

function disegnaAsta() {
  const lega = DATI.riepilogo.lega;
  const rosa = miaRosa();
  const contenitore = document.getElementById("rosa-contenitore");

  disegnaCopia();

  contenitore.innerHTML = ["P", "D", "C", "A"].map((m) => {
    const voci = rosa.filter((v) => v.ruolo === m);
    const spesa = voci.reduce((s, v) => s + v.prezzo, 0);
    const titolo = m === "P" && aBlocchi ? "Blocchi portieri" : NOMI_MACRO[m];
    // solo i blocchi hanno un tetto: il resto della rosa e' a composizione libera
    const su = m === "P" && aBlocchi ? `/${lega.blocchi_per_squadra}` : "";
    return `<div class="gruppo-rosa">
      <div class="intestazione">${titolo} — ${voci.length}${su} · ${spesa} crediti</div>
      ${voci.length
        ? voci.sort((a, b) => b.prezzo - a.prezzo).map((v) =>
            `<div class="voce-rosa">
               <span>${v.nome}${v.portieri ? `<span class="tenue"> — ${v.portieri.join(", ")}</span>` : ""}</span>
               <span class="prezzo">${v.prezzo}</span>
             </div>`).join("")
        : '<div class="vuoto">nessun giocatore</div>'}
    </div>`;
  }).join("");

  disegnaModuli();

  const altrui = Object.entries(asta).filter(([, v]) => !v.mio);
  const spesoAltrui = altrui.reduce((s, [, v]) => s + (v.prezzo || 0), 0);
  document.getElementById("altrui-contenitore").innerHTML = altrui.length
    ? `<div class="gruppo-rosa">
         <div class="intestazione">${altrui.length} acquisti registrati · ${spesoAltrui} crediti usciti dalla lega</div>
         ${altrui.map(([, v]) => `<div class="voce-rosa">
            <span>${v.nome} <span class="tenue">${NOMI_MACRO[v.ruolo]}</span></span>
            <span class="prezzo ${v.stimato ? "tenue" : ""}" ${v.stimato ? 'title="stima: il prezzo vero non è stato registrato"' : ""}>${v.prezzo || 0}${v.stimato ? "?" : ""}</span>
          </div>`).join("")}
       </div>`
    : '<div class="vuoto">nessuno</div>';
}

avvia();
