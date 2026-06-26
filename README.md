# Vizyto Booking Widget

Osadzalny moduł rezerwacji Vizyto. Jeden tag `<script>`, dowolna strona (Wix,
WordPress, czysty HTML), niezależnie od hostingu. Preact + Shadow DOM (pełna
izolacja od CSS/JS strony hosta), single-file IIFE.

## Instalacja (na stronie klienta)

```html
<script src="https://widget.vizyto.com/v1/widget.js"
  data-vizyto-business="24"
  data-vizyto-key="pk_live_..."
  data-vizyto-label="Zarezerwuj wizytę"
  data-vizyto-accent="#fd9320"
  defer></script>
```

Domyślnie: pływający przycisk w rogu → modal z kreatorem (Usługa → Barber →
Termin → Dane → potwierdzenie). Klient rezerwuje bez konta Vizyto.

Wariant **inline**: wstaw `<div data-vizyto-booking></div>` w miejscu, gdzie
kreator ma się pojawić na stałe (przycisk się wtedy nie pokazuje).

## Atrybuty `data-*`

| atrybut | wymagany | opis |
|---|---|---|
| `data-vizyto-business` | tak | id biznesu w Vizyto |
| `data-vizyto-key` | tak | publishable site key z PRO → "Strona WWW" |
| `data-vizyto-api` | nie | origin API (domyślnie `https://api.vizyto.com`) |
| `data-vizyto-label` | nie | tekst przycisku |
| `data-vizyto-accent` | nie | kolor akcentu, hex (domyślnie `#fd9320`) |
| `data-vizyto-inline` | nie | wymuś tryb inline bez `<div>` |

## Warunek działania

Klient w PRO → "Strona WWW" generuje **publishable site key** i dodaje **origin
swojej strony** (np. `https://salon-jana.pl`) do dozwolonych domen klucza. Bez
tego dynamiczny CORS odrzuci żądania (przeglądarka nie sfałszuje Origin).

## Dev

```bash
pnpm install
pnpm dev      # http://localhost:4500 (test embed na index.html)
pnpm build    # -> dist/widget.js (jeden plik IIFE)
```

Do dev-testu: wygeneruj site key dla originu `http://localhost:4500` i wstaw go w
`index.html` (`data-vizyto-key`), `data-vizyto-api="http://127.0.0.1:5454"`.

## Deploy

`pnpm build` → wrzuć `dist/widget.js` na CDN pod wersjonowany URL
(`https://widget.vizyto.com/v1/widget.js`). Wszystkie osadzone strony ładują ten
sam, centralnie utrzymywany plik.
