# Listone Mantra

Listone per l'asta di fantacalcio Mantra: 504 giocatori con un prezzo di
riferimento, le presenze attese e le statistiche avanzate (xG, xA, tiri,
passaggi chiave), più tre strumenti per usarlo durante l'asta.

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
usa *Esporta su file* e poi *Ricarica da file* dall'altra parte.

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

## I prezzi, in breve

I prezzi non sono quelli di listino: sono una stima di quanto vale ogni
giocatore in questa lega, costruita sulle quotazioni, sulle presenze attese e
sulle ultime quattro stagioni. Azzeccano poco più della metà delle volte —
correlazione 0,49 con quello che succede davvero, errore tipico ~60 crediti sui
giocatori che compri. Servono per sapere **quando fermarti** in un rilancio, non
per decidere al posto tuo.
