# Listone

Listone per l'asta di fantacalcio, in tutti e due i formati: **Classic** e
**Mantra**. 531 giocatori con un prezzo di riferimento, le presenze attese e le
statistiche avanzate (xG, xA, tiri, passaggi chiave), più tre strumenti per
usarlo durante l'asta.

La prima cosa che chiede è in che formato giochi, e non è una preferenza
grafica: **i prezzi dei due formati sono diversi**, perché sono diverse le
quotazioni ufficiali, i ruoli e la forma della rosa. Si cambia quando si vuole
dalla testata, e le due aste restano separate — quello che segni in Classic non
compare in Mantra.

- **Listone** — tutti i giocatori, ordinabili e filtrabili per ruolo, squadra e
  prezzo. La colonna *Conviene* dice se il prezzo a cui sta andando è basso o
  alto rispetto a quanto vale.
- **La tua rosa** — segna chi compri e a quanto: tiene il conto dei crediti
  spesi, degli slot che restano e di come sta venendo la rosa.
- **Su quale modulo puntare** — con i giocatori che hai preso, quali moduli ti
  restano praticabili.
- **Presi dagli altri** — segna i giocatori che vanno agli avversari, così
  spariscono dal listone e vedi cosa è ancora sul mercato.

## Come aprirlo

**[clauszin2.github.io/listone-mantra](https://clauszin2.github.io/listone-mantra/)**

Non serve installare niente e non serve un account: è una pagina, si apre e
funziona. Va bene anche da telefono.

Quello che segni resta nel browser con cui l'hai aperto. Se cambi dispositivo,
usa *Esporta su file* e poi *Ricarica da file* dall'altra parte. Il file di un
formato non si ricarica nell'altro: i giocatori sarebbero anche gli stessi, ma
i prezzi e la forma della rosa no.

### Farlo girare in locale

Se preferisci averlo sul tuo computer, senza dipendere dalla rete: clona il
repo e servilo. Il doppio clic su `web/index.html` **non** basta — il browser
blocca la lettura del file dei dati e vedresti la pagina vuota.

```bash
git clone https://github.com/clauszin2/listone-mantra
cd listone-mantra
python3 -m http.server 8777
```

Poi apri `http://localhost:8777/web/`. Per chiudere, `Ctrl+C` nel terminale.

## I due formati, in breve

|  | Classic | Mantra |
| --- | --- | --- |
| Ruoli | P, D, C, A | dodici, dal braccetto alla punta centrale |
| Rosa | fissa: 3 + 8 + 8 + 6 | libera: 24 di movimento |
| Portieri | uno per uno, con un prezzo loro | a blocchi, due per squadra |
| Modificatore di difesa | acceso | spento |
| Quotazioni | colonna FVM Classic | colonna FVM Mantra |

Nel Classic è acceso anche il **modificatore di difesa**: paga la media voto del
portiere e dei tre difensori migliori, quindi lì conta il voto e non i bonus, e
un centrale che porta a casa 6,5 tutte le domeniche vale più di uno che alterna
5,5 e un gol. Sposta il 10% del budget verso i portieri e il 4% verso i
difensori. Le soglie sono quelle più comuni su fantacalcio.it — **controlla il
regolamento della tua lega**, perché ognuna se le tara come vuole.

Da qui esce tutto il resto. In Classic gli otto difensori li compri comunque,
quindi ogni reparto ha la sua asticella e un difensore forte vale molto di più
di quanto valga in Mantra, dove se i difensori rendono poco ne schieri uno in
meno. In Mantra invece conta coprire le caselle, e chi ne copre due vale un
premio.

## Il tetto sui difensori

In questa lega **per un difensore non si va sopra 130 crediti**, ed è scritto nel
motore: sopra quella cifra il prezzo consigliato viene tagliato. Non è una
correzione al modello, è un fatto sul mercato che il modello non può sapere — un
prezzo che nessuno sborsa non è un consiglio, è un numero che non verrà mai
messo alla prova. I crediti tagliati non spariscono: tornano sugli altri
giocatori, perché la spesa di una lega è fissa e quei crediti verranno spesi da
qualche altra parte. Al 6 settembre 2026 tocca un giocatore solo, Dimarco (296 →
130 in Classic, 204 → 130 in Mantra). Il tetto si cambia — o se ne aggiungono per
altri ruoli — da `lega.tetti_per_ruolo` in `config.json`.

## I prezzi, in breve

I prezzi non sono quelli di listino: sono una stima di quanto vale ogni
giocatore in questa lega, costruita sulle quotazioni, sulle presenze attese e
sulle ultime quattro stagioni. Azzeccano poco più della metà delle volte —
correlazione 0,49 con quello che succede davvero, errore tipico ~60 crediti sui
giocatori che compri. Servono per sapere **quando fermarti** in un rilancio, non
per decidere al posto tuo.

### Dal 6 settembre 2026 i prezzi sono del motore

Prima erano per l'85% quelli di un'app esterna, riportati sulla scala della
lega: la correlazione con i loro era 0,995, cioè il listone *era* il loro
listone. Adesso il prezzo lo fa il motore, con un solo corrimano — un terzo di
FVM ufficiale, che è pubblico e sempre aggiornato — e la correlazione col
mercato è scesa a 0,88. È lì che la colonna *Conviene* comincia a dire qualcosa:
contro un mercato che stai copiando le occasioni non esistono per definizione.

Il motore ha guadagnato due correzioni misurate al posto di quella copia. La
prima: il vantaggio sul sostituto non diventa crediti uno a uno, ma con un
esponente di 0,8. Il motore stima bene la fantamedia (pendenza 0,96) e male il
prezzo (0,47): esce due volte più disperso del vero, e il sesto più caro dei
giocatori che compri viene prezzato 158 quando ne rende 85. Comprimere migliora
ogni singola colonna del backtest. La seconda: su chi non ha storico in Serie A
il listino adesso corregge anche la fantamedia, non solo le presenze — il
prezzo nasce da `(fantamedia − sostituto) × presenze`, e correggere solo le
presenze non ancorava niente.

Quel che resta dell'app esterna è **l'XPV**, la percentuale di partite in cui si
aspettano che uno prenda voto. Non è un prezzo, è un dato sulle presenze, ed è
la migliore delle tre fonti che ci sono (correlazione 0,72 con le presenze vere
contro 0,61 delle probabili formazioni). Si spegne da `peso_presenze_xpv`.
