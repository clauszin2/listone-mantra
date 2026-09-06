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
| Quotazioni | colonna FVM Classic | colonna FVM Mantra |

Da qui esce tutto il resto. In Classic gli otto difensori li compri comunque,
quindi ogni reparto ha la sua asticella e un difensore forte vale molto di più
di quanto valga in Mantra, dove se i difensori rendono poco ne schieri uno in
meno. In Mantra invece conta coprire le caselle, e chi ne copre due vale un
premio.

## I prezzi, in breve

I prezzi non sono quelli di listino: sono una stima di quanto vale ogni
giocatore in questa lega, costruita sulle quotazioni, sulle presenze attese e
sulle ultime quattro stagioni. Azzeccano poco più della metà delle volte —
correlazione 0,49 con quello che succede davvero, errore tipico ~60 crediti sui
giocatori che compri. Servono per sapere **quando fermarti** in un rilancio, non
per decidere al posto tuo.

Quella misura viene dal Mantra, che è il formato su cui il motore è stato
tarato. **Sul Classic non c'è un backtest.** I prezzi li calcola lo stesso
motore, ma l'ancoraggio al mercato è diverso: in Mantra tira verso i prezzi di
Algo (all'85%), che è una seconda valutazione; in Classic Algo non c'è — i suoi
numeri sono prezzi Mantra e non si applicano — quindi si tira verso il FVM
ufficiale, e al 70%, perché un listino copiato più stretto di così è solo il
listino.
