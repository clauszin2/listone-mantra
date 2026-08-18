# Listone Mantra

Listone per l'asta di fantacalcio Mantra: 504 giocatori con un prezzo di
riferimento, le presenze attese e le statistiche avanzate (xG, xA, tiri,
passaggi chiave), piu' tre strumenti per usarlo durante l'asta.

- **Listone** — tutti i giocatori, ordinabili e filtrabili per ruolo, squadra e
  prezzo. La colonna *Conviene* dice se il prezzo a cui sta andando e' basso o
  alto rispetto a quanto vale.
- **La tua rosa** — segna chi compri e a quanto: tiene il conto dei crediti
  spesi, degli slot che restano e di come sta venendo la rosa.
- **Su quale modulo puntare** — con i giocatori che hai preso, quali moduli ti
  restano praticabili.
- **Presi dagli altri** — segna i giocatori che vanno agli avversari, cosi'
  spariscono dal listone e vedi cosa e' ancora sul mercato.

Quello che segni resta nel tuo browser (non va da nessuna parte). Con *Esporta
su file* / *Ricarica da file* te lo porti su un altro computer, o lo recuperi se
il browser si azzera.

## Come aprirlo

Serve Python 3 — su Linux e Mac c'e' già. Il sito **non** funziona
aprendo `index.html` col doppio clic: il browser blocca la lettura del file dei
dati, e vedresti la pagina vuota. Va servito, e sono due righe.

Dalla cartella del progetto:

```bash
python3 -m http.server 8777
```

Poi apri nel browser:

```
http://localhost:8777/web/
```

Per chiudere, `Ctrl+C` nel terminale. Non serve installare niente e non esce
niente dal tuo computer: gira tutto in locale.

## I prezzi, in breve

I prezzi non sono quelli di listino: sono una stima di quanto vale ogni
giocatore in questa lega, costruita sulle quotazioni, sulle presenze attese e
sulle ultime quattro stagioni. Azzeccano poco piu' della metà delle volte —
correlazione 0,49 con quello che succede davvero, errore tipico ~60 crediti sui
giocatori che compri. Servono per sapere **quando fermarti** in un rilancio, non
per decidere al posto tuo.
