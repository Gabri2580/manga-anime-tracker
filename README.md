# Manga & Anime Tracker

Libreria personale e condivisa per **manga, manhwa, novel e anime**: cosa leggi, cosa guardi, cosa possiedi, con copertine, voti e recensioni. Pensata per due persone: ognuna ha il proprio profilo e può modificare solo il proprio, ma vede in sola lettura quello dell'altra. C'è anche una zona comune per consigliarsi titoli.

Sito statico (HTML, CSS e JavaScript, nessuna fase di build) che usa [Supabase](https://supabase.com) per login e dati. Si installa come app sul telefono (PWA) e la libreria resta consultabile **anche senza rete**.

## Funzioni
- **Due profili** con login: ognuno scrive solo sulle proprie righe, l'altro può solo leggere.
- **Quattro tipi**: manga, manhwa, novel, anime. Per ogni titolo: stato, volumi letti o episodi visti, volumi posseduti, voto, recensione, copertina.
- **Ricerca online** su [AniList](https://anilist.co): copertina e numero di volumi o episodi si compilano da soli.
- **Importazione guidata dalle note**: si incolla un elenco anche disordinato (puntini, numeri, caselle, voti, volumi, intestazioni come "Manga" o "Letti", emoji ✅ ❤️). Ogni titolo viene cercato su AniList e si sceglie un abbinamento alla volta (manga, manhwa, novel o anime, copertina, stato, voto). I titoli senza riscontro tornano in un elenco con il testo esatto delle note. L'importazione si può mettere in pausa e riprendere.
- **Consigli automatici "Per te"**: calcolati dai voti, dai preferiti e da cosa hai completato o droppato, con le raccomandazioni degli utenti di AniList, e ogni suggerimento spiega il perché.
- **Preferiti** sempre in cima alla lista.
- **Volumi mancanti** calcolati da posseduti e totale ("Mancano 28 volumi: 13-14, 16-41").
- **In comune**: i titoli che hanno entrambi, con i due voti a confronto.
- **Consigli**: titolo, copertina e nota, filtrabili per tipo e per autore.
- **Statistiche**: titoli per tipo, stato, distribuzione dei voti, aggiunte per mese, collezione.
- **Aggiornamento automatico** delle opere ancora in corso (stato, totale, episodi usciti).
- Tema chiaro e scuro automatico, animazioni che rispettano "riduci movimento", uso da telefono con navigazione in basso.

## Come funziona
| Parte | Dove |
|---|---|
| Interfaccia | `index.html`, `app.js`, `stats.js` (nessuna dipendenza da installare) |
| Importazione dalle note | `notes.js` (lettura del testo e abbinamento, funzioni pure) e `importer.js` (schermate e coda delle copertine) |
| Consigli automatici | `taste.js` (pesi e punteggi, funzioni pure) e `suggest.js` (richieste ad AniList, cache locale, schermata) |
| Login, dati, copertine | Supabase: Auth con email e password, Postgres con Row Level Security, Storage |
| Uso offline | `sw.js` (service worker) e `manifest.webmanifest` |
| Librerie incluse | `vendor/`: supabase-js e i font Outfit e Work Sans, quindi nessun CDN |
| Database | `supabase/schema.sql` (progetto nuovo) e `supabase/migration-2.sql` (aggiunge preferiti e aggiornamenti automatici a un progetto esistente) |
| Manutenzione | `.github/workflows/ping.yml` |

Le copertine e i dati **non** sono in questo repository: stanno nel progetto Supabase.

## Come funzionano i consigli automatici
1. Ogni titolo che hai riceve un peso: voto rispetto alla tua media, +1,5 se è un preferito, un po' per i completati, negativo per i droppati; i "da leggere" non contano.
2. I pesi formano un profilo dei gusti sui generi e sui tag di AniList (con una correzione perché un tag visto una volta sola non pesi troppo).
3. I candidati arrivano dalle raccomandazioni della community per i titoli che ami e dai titoli più popolari per i tuoi tag, escludendo quelli che hai già o hai scartato.
4. Ogni candidato riceve un punteggio (somiglianza di tag, forza delle raccomandazioni, piccolo contributo del voto medio) e la lista viene diversificata per non proporre dieci titoli quasi identici.

Tutto avviene nel browser: ad AniList vanno solo i numeri dei titoli e i tag cercati, nessun voto né dato personale. I risultati si tengono in cache sul dispositivo per qualche giorno. "Non mi interessa" è ricordato solo su quel dispositivo.

## Sicurezza
- In `config.js` ci sono l'URL del progetto e la chiave **publishable** di Supabase. È fatta per stare nel browser: la protezione non dipende dalla sua segretezza ma dalle regole **RLS** dello schema (lettura per gli utenti loggati, scrittura solo sulle proprie righe).
- Le registrazioni pubbliche sono disattivate: gli account si creano dal pannello di Supabase.
- Non inserire mai la chiave `service_role` in questo repository.

## Usarlo con il proprio Supabase
1. Crea un progetto su Supabase.
2. **SQL Editor**: esegui `supabase/schema.sql`.
3. **Authentication → Users**: crea i due utenti (email e password, con *Auto Confirm User*). Poi, in *Sign In / Providers*, disattiva **Allow new users to sign up**.
4. **Project Settings → API**: copia *Project URL* e la chiave *publishable* in `config.js`.
5. Pubblica la cartella con GitHub Pages (branch `main`, cartella root) o con qualsiasi hosting statico in HTTPS.

Per provarlo in locale: `python -m http.server 8000` nella cartella e apri `http://localhost:8000`. Il service worker funziona solo su `localhost` o HTTPS.

## Manutenzione automatica
Il workflow `ping.yml` gira ogni lunedì:
- fa una richiesta al database, così il piano gratuito di Supabase non mette in pausa il progetto per inattività;
- se l'ultimo commit ha 45 giorni o più ne crea uno vuoto, perché GitHub disattiva i workflow programmati dei repository pubblici dopo 60 giorni senza attività.

Se il ping fallisce, GitHub avvisa via email il proprietario del repository.

## Crediti
- Dati e copertine: [AniList](https://anilist.co) (API GraphQL pubblica). Le immagini appartengono ai rispettivi titolari.
- [supabase-js](https://github.com/supabase/supabase-js) (MIT).
- Font [Outfit](https://fonts.google.com/specimen/Outfit) e [Work Sans](https://fonts.google.com/specimen/Work+Sans) (SIL Open Font License 1.1).
- Icone ispirate a [Lucide](https://lucide.dev) (ISC).

Progetto personale, non affiliato ad AniList né a Supabase. Nessuna licenza d'uso è concessa: tutti i diritti riservati.
