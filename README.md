# Vizyto Booking Widget

Osadzalny moduł rezerwacji Vizyto. Jeden tag `<script>`, dowolna strona (Wix,
WordPress, czysty HTML), niezależnie od hostingu. Preact + Shadow DOM (pełna
izolacja od CSS/JS strony hosta), single-file IIFE. Wygląd 1:1 z aplikacją
Vizyto - segmentowany pasek „KROK X Z N”, karty wyboru z radio, lepkie „Dalej”,
sloty pogrupowane (Rano / Południe / Wieczór), widok tydzień/miesiąc, czcionka
Poppins (albo czcionka stylu strony), motyw jasny/ciemny/auto.

Poradnik osadzania: <https://vizyto.com/blog/widget-rezerwacji-na-strone-internetowa>
(link jest też w stopce widgetu pod „Rezerwacje przez Vizyto”).

## Instalacja (na stronie klienta)

```html
<script src="https://widget.vizyto.com/v1/widget.js"
  data-vizyto-business="24"
  data-vizyto-key="pk_live_..."
  data-vizyto-label="Zarezerwuj wizytę"
  data-vizyto-accent="#fd9320"
  data-vizyto-theme="auto"
  defer></script>
```

Domyślnie: pływający przycisk w rogu → modal z kreatorem. Liczba kroków zależy
od tego, co klient rezerwuje (ostatni krok to zawsze „Twoje dane”, po nim
weryfikacja SMS i potwierdzenie):

| rodzina oferty | kroki | ile |
|---|---|---|
| wizyta | Usługa → Specjalista → Termin → Dane | 4, albo 3 bez wyboru specjalisty (jeden wykonawca, przydział automatyczny) |
| zajęcia grupowe | Zajęcia → Termin → Dane | 3 |
| wynajem | Przedmiot → Termin → Dane | 3, albo 2 przy jednej ofercie (trafiony prefill egzemplarza zaczyna od kroku 2) |

Biznes, który sprzedaje więcej niż jedną rodzinę, dostaje przed licznikiem
pytanie „co rezerwujesz” (bez numeru kroku).

Wariant **inline**: wstaw `<div data-vizyto-booking></div>` w miejscu, gdzie
kreator ma się pojawić na stałe (przycisk się wtedy nie pokazuje).

## Jak działa autoryzacja (anty-spam terminów)

Każda rezerwacja gościa jest potwierdzana **kodem SMS** na podany numer - bez
tego nie powstaje wizyta, więc nikt losowy nie zablokuje terminów. Klient z
kontem Vizyto może się zalogować (**e-mail + hasło** lub **Google / Apple /
Facebook**) i **pomija weryfikację SMS**.

Logowanie OAuth na obcej domenie działa przez **popup + `postMessage`**: widget
otwiera okno na `…/api/public/auth/embed/start`, a po zalogowaniu strona-mostek
Vizyto (`…/embed/callback`) odsyła bearer token tylko do originu dozwolonego na
site key.

- Gość: imię, nazwisko, telefon, e-mail → kod SMS (**6 cyfr**; długość podaje
  API w `codeLength`, bez tego pola widget przyjmuje 4; kod ważny 5 min,
  3 próby, ponowne wysłanie co 60 s) → rezerwacja.
- Jeśli e-mail ma już konto Vizyto, kreator automatycznie proponuje logowanie.
- Telefon, który ma już konto Vizyto, dostaje kod logujący do tego konta
  (bez zakładania drugiego konta gościa).
- Strona, która sama jest zalogowaną powierzchnią Vizyto, może podać
  `data-vizyto-token` + `data-vizyto-user` i pominąć cały krok weryfikacji.
- `data-vizyto-turnstile` włącza Cloudflare Turnstile przed wysłaniem SMS-a
  (ochrona przed nadużyciami bramki SMS).

## Atrybuty `data-*`

| atrybut | wymagany | opis |
|---|---|---|
| `data-vizyto-business` | tak | id biznesu w Vizyto |
| `data-vizyto-key` | tak | publishable site key z PRO → „Strona WWW” |
| `data-vizyto-api` | nie | origin API (domyślnie `https://api.vizyto.com`; `mock` = tryb testowy bez backendu) |
| `data-vizyto-label` | nie | tekst przycisku (domyślnie „Zarezerwuj wizytę”) |
| `data-vizyto-launcher` | nie | `hidden` ukrywa pływający przycisk - modal otwierasz przez `VizytoBooking.open()` |
| `data-vizyto-inline` | nie | wymuś tryb inline bez `<div data-vizyto-booking>` |
| `data-vizyto-theme` | nie | `light` (domyślnie), `dark` albo `auto` (śledzi motyw systemu na żywo) |
| `data-vizyto-accent` | nie | kolor akcentu, `#rrggbb` (domyślnie `#fd9320`) |
| `data-vizyto-accent-light` | nie | jasny odcień akcentu, `#rrggbb` (domyślnie `#ffdca8`) |
| `data-vizyto-accent-dark` | nie | ciemny odcień akcentu, `#rrggbb` (domyślnie `#bf700f`) |
| `data-vizyto-on-accent` | nie | kolor tekstu na akcencie, `#rrggbb` (domyślnie `#ffffff`) |
| `data-vizyto-font-pack-id` | nie | pakiet czcionek stylu strony (lista w „Style strony”); nieznany id = Poppins |
| `data-vizyto-font` | nie | `off` = bez rejestracji czcionek, systemowy krój |
| `data-vizyto-datalayer` | nie | `off` = eventy nie trafiają do `window.dataLayer` |
| `data-vizyto-turnstile` | nie | publiczny klucz Cloudflare Turnstile dla ścieżki SMS |
| `data-vizyto-token` | nie | bearer token zalogowanego klienta (pomija weryfikację SMS; wymaga też `-user`) |
| `data-vizyto-user` | nie | id zalogowanego klienta (parą z `-token`) |

## Motywy

Tokeny kolorów żyją jako zmienne CSS w Shadow DOM. `data-vizyto-theme="auto"`
ustawia motyw wg `prefers-color-scheme` i reaguje na zmianę motywu systemu w
locie. `--vz-accent` (z `data-vizyto-accent`) działa w obu motywach; odcienie
akcentu liczone są przez `color-mix`, więc dostosowują się automatycznie.

## Style strony (F10)

Snippet i `mount()` przyjmują opcje stylu strony z kreatora WWW. Widget używa
tylko kroju bezszeryfowego (sans) wybranego pakietu. Motyw domyślnie jest
jasny; działają też `dark` i `auto`.

| opcja `mount()` | atrybut | działanie |
|---|---|---|
| `fontPackId` | `data-vizyto-font-pack-id` | jeden z dziewięciu id poniżej; nieznany = Poppins |
| `accent` | `data-vizyto-accent` | `--vz-accent`, domyślnie `#fd9320` |
| `accentLight` | `data-vizyto-accent-light` | `--vz-accent-tint`, domyślnie `#ffdca8` |
| `accentDark` | `data-vizyto-accent-dark` | `--vz-accent-strong`, domyślnie `#bf700f` |
| `onAccent` | `data-vizyto-on-accent` | `--vz-on-accent`, domyślnie `#ffffff` |
| `theme` | `data-vizyto-theme` | `light`, `dark` albo `auto`; inna wartość = `light` |
| `font` | `data-vizyto-font` | `off` pomija rejestrację czcionek i jawnie ustawia krój systemowy |

| id pakietu | krój w widgecie |
|---|---|
| `fraunces-manrope-v1` | Manrope |
| `bodoni-moda-outfit-v1` | Outfit |
| `cormorant-garamond-jost-v1` | Jost |
| `oswald-poppins-v1` | Poppins (domyślny) |
| `anton-ibm-plex-sans-v1` | IBM Plex Sans |
| `barlow-condensed-barlow-v1` | Barlow |
| `archivo-black-archivo-space-mono-v1` | Archivo |
| `montserrat-roboto-v1` | Roboto |
| `archivo-inter-v1` | Inter |

```html
<script src="https://widget.vizyto.com/v1/widget.js"
  data-vizyto-business="24"
  data-vizyto-key="pk_live_..."
  data-vizyto-font-pack-id="oswald-poppins-v1"
  data-vizyto-theme="dark"
  data-vizyto-accent="#C24A3A"
  data-vizyto-accent-light="#DD7361"
  data-vizyto-accent-dark="#96382B"
  data-vizyto-on-accent="#FFFFFF"
  defer></script>
```

Te same wartości przyjmuje `VizytoBooking.mount({ businessId, siteKey,
fontPackId, theme, accent, accentLight, accentDark, onAccent })`. Widget nie
zgaduje rodziny kroju z czcionki: renderer strony podaje `widgetTheme` swojej
rodziny. Każdy z czterech kolorów musi pasować dokładnie do
`^#[0-9a-fA-F]{6}$`; inne wartości (krótki hex, nazwy CSS, fragmenty CSS, adresy
URL) są ignorowane. Kontrast sprawdzamy tylko wtedy, gdy osadzenie podaje
poprawny `accent` albo `onAccent`: jeśli po połączeniu z domyślnymi wynosi mniej
niż 4,5:1, podmieniamy wyłącznie `onAccent` na ten z `#ffffff` i `#18181b`,
który ma wyższy kontrast z akcentem. Podany akcent zostaje bez zmian. Jasny i
ciemny odcień akcentu są niezależne.

Bez poprawnego akcentu ani etykiety wszystkie dotychczasowe wartości domyślne
zostają bez zmian, w tym biały `#ffffff` na `#fd9320`, jak główny przycisk
Vizyto.

### Własne czcionki i niezmienne wydania

Widget nie pobiera żadnego arkusza ani czcionki z Google (bez preconnect).
Reguły `@font-face` rejestrujemy raz na pakiet i manifest w dokumencie, bo
rejestracja wewnątrz Shadow DOM działa w przeglądarkach nierówno. Każda instancja
jawnie ustawia `--vz-font` w swoim Shadow DOM. `font: 'off'` nie rejestruje
niczego, nawet jeśli inna instancja zarejestrowała już swoje czcionki.

Build czyta zainstalowane, zatwierdzone pakiety `@fontsource`, bierze tylko
zwykłe pliki WOFF2 dla `latin` i `latin-ext` i ustawia `font-display: swap`.
Grubości statyczne: 400, 500, 600 i 700; istniejąca w CSS grubość 650 trafia w
700 dopasowaniem przeglądarki, bez osobnego pliku. Polskie znaki pokrywają oba
podzbiory. Pliki licencji OFL-1.1 jadą razem z czcionkami. Adresy czcionek
biorą się z originu skryptu widgetu: `<origin-widgetu>/fonts/<rodzina>/<sha256>.woff2`.
Origin odczytujemy z `document.currentScript.src` podczas wykonania klasycznego
skryptu (także wstawionego dynamicznie) i zapamiętujemy na późniejsze
`mount()`. Przyjmujemy tylko `http:` i `https:`; brak lub błędny adres skryptu
oznacza `https://widget.vizyto.com`. Produkcja, staging i serwery lokalne muszą
serwować wygenerowane `deploy/fonts/` obok widgetu. Przykład: skrypt z
`http://127.0.0.1:4391/v1/widget.js` pobiera czcionki z
`http://127.0.0.1:4391/fonts/`, zgodnie z CSP `font-src` dla originu widgetu.

`pnpm build:cdn` składa:

- `deploy/v1/widget.js`: kroczący punkt wejścia v1.
- `deploy/v/<widget-sha256>/widget.js`: niezmienny adres wyliczony z bajtów
  paczki. Strona opublikowana z kreatora przypina wersję przez
  `https://widget.vizyto.com/v/<widget-sha256>/widget.js`; build wypisuje
  faktyczną ścieżkę.
- `deploy/v/<widget-sha256>/manifest.json`: jeden manifest wydania dla PRO, SSR
  i widgetu. Zawiera `schemaVersion`, `hash` kanonicznego manifestu czcionek
  (`JSON.stringify({ schemaVersion, fontPacks })`), wersję `widget`, ścieżkę i
  SHA-256 oraz `capabilities`. `fontPacks[fontPackId]` opisuje krój sans
  (`family`, pakiet i wersja, ścieżka licencji, grubości oraz `files` ze
  ścieżkami, grubościami, stylem, podzbiorami, zakresami unicode i SHA-256).
  Nie ma w nim krojów display ani mono strony. Vite osadza ten sam manifest w
  paczce, więc rejestracja w przeglądarce nie pobiera manifestu.
  `dist/font-manifest.json` to pośredni plik builda sprawdzany przez skrypt
  składający `deploy/`.
- `deploy/fonts/<rodzina>/*`: pliki WOFF2 z hashem w nazwie i tekst licencji OFL.
- `deploy/_headers` i `deploy/index.html`.

Czcionki, licencje, niezmienny widget i manifest mają
`Cache-Control: public, max-age=31536000, immutable`,
`Access-Control-Allow-Origin: *` i `Cross-Origin-Resource-Policy: cross-origin`.
Kroczący `/v1/widget.js` zachowuje
`Cache-Control: public, max-age=600, stale-while-revalidate=86400` i swoje
nagłówki CORS. **600 sekund nie gwarantuje, że klient dostanie nową wersję.**

Nagłówki cache nie przechowują plików na serwerze: Cloudflare przy każdym
deployu zastępuje cały katalog. Dlatego każdy deploy (CI i `pnpm run deploy`)
uruchamia `scripts/restore-published.mjs` - szczegóły w „Deploy”.

Weryfikacja (bez dodatkowych zależności testowych):

```sh
pnpm exec tsc --noEmit
pnpm build:cdn
bun test
grep -r googleapis dist deploy  # brak trafień, kod wyjścia 1
```

## Warunek działania

Klient w PRO → „Strona WWW” generuje **publishable site key** i dodaje **origin
swojej strony** (np. `https://salon-jana.pl`) do dozwolonych domen klucza. Bez
tego dynamiczny CORS odrzuci żądania (przeglądarka nie sfałszuje Origin).
Klucz musi mieć scope `book`.

## Kanały rezerwacji (vizyto #680)

Firma decyduje w PRO, czy i co przyjmuje w każdym kanale. Widget rezerwuje w
kanale `widget` („Twoja strona WWW” - ten sam kanał co strona z kreatora). API
odrzuca zapis, którego kanał nie przyjmuje, odpowiedzią 409
`CHANNEL_BOOKING_DISABLED` albo `CHANNEL_ACTION_DISABLED`.

Widget czyta politykę z profilu biznesu, który i tak pobiera
(`bookingChannels.widget` i `hasWebsiteReservationsEnabled` z
`GET /businesses/:id`), przez `src/channel.ts` - wierną kopię
`publicChannelAllows` z `packages/shared/src/utils/bookingChannels.ts` w
monorepo. Tak samo jak CLIENT i WEB:

- wizyty są dostępne przy akcji `book`, zajęcia przy `groupClasses`, wynajem
  przy `rentals`, przycisk listy oczekujących przy `waitlist`; rodziny, której
  kanał nie przyjmuje, nie ma w kreatorze;
- gdy nie zostaje nic do zarezerwowania, zamiast kroków widget pokazuje stan
  „Rezerwacje online są teraz wyłączone” z numerem telefonu firmy (jeśli go
  podała); przycisk pływający dalej otwiera modal z tą informacją;
- prefill rodziny, której kanał nie przyjmuje (np. `classId` przy wyłączonych
  zapisach na zajęcia), pokazuje stan zamknięcia tej rodziny z przejściem do
  pozostałych;
- 409 `CHANNEL_*` przy zapisie (firma wyłączyła kanał już po wczytaniu strony)
  prowadzi do tego samego stanu, a nie do „Ten termin właśnie zniknął”. Sam kod
  nie mówi, ile zamknięto (`CHANNEL_BOOKING_DISABLED` przy wizycie znaczy i
  „rezerwacje online wyłączone”, i „cały kanał wyłączony”), więc widget od razu
  pobiera profil firmy ponownie. Świeże `bookingChannels.widget` decyduje o
  wyjściach ze stanu zamknięcia i o każdym kolejnym otwarciu (ponownie otwarty
  modal, nowe `open()`), więc zamknięta akcja nie wraca do kreatora. Stan
  zamknięcia na ekranie zostaje; gdy nic już nie jest otwarte, obejmuje cały
  widget.

Starsze API bez `bookingChannels`: wizyty idą za
`hasWebsiteReservationsEnabled`, reszta zostaje otwarta (jak przed #680).

## Wymagane endpointy API (public)

Widget korzysta z (wszystkie pod `/api/public`, nagłówek `x-vizyto-site-key`,
zapisy i odczyty spersonalizowane dodatkowo `Authorization: Bearer <token>`):

Biznes i oferta:

- `GET  /businesses/:id` - dane biznesu (usługi, zasoby, godziny otwarcia,
  `bookingPolicy`: okno bezpłatnego odwołania + „Ważne informacje”,
  `bookingAccess`, `bookingChannels`, `hasWebsiteReservationsEnabled`).
- `GET  /businesses/:id/service-categories` - grupowanie usług w zakładki.
- `GET  /businesses/:id/booking-access` - czy zalogowany klient może rezerwować
  (biała lista; `businessServiceId` dla konkretnej usługi).

Wizyty:

- `POST /businesses/:id/appointments/availability/cart` - wolne początki łańcucha
  dla koszyka (`items[]`); zwraca `slots`, `itemTimes` (rozpiska pozycji) i
  `totalMinutes`. Z `includeCandidates: true` dokłada `slotCandidates` - kto jest
  wolny w danym slocie (wybór specjalisty po wybraniu godziny).
- `POST /businesses/:id/appointments/availability/cart/counts` - pigułki dni.
- `POST /businesses/:id/appointments/availability/cart/first-free` - najbliższy
  wolny termin (serwer przeczesuje 60 dni).
- `POST /businesses/:id/appointments/quote` - cena koszyka w wybranym terminie
  (promocje, ceny klienta).
- `POST /businesses/:id/appointments/promo-badges` - oznaczenia promocji dni i godzin.
- `POST /businesses/:id/appointments` - tworzy wizytę (i wysyła SMS-potwierdzenie).
  Kontrakt koszyka: `items[]` w kolejności wykonania, każda pozycja z własnym
  `resourceId` (`null` = Dowolny), `addonIds` i `durationMinutes`. Nagłówek
  `Idempotency-Key` chroni przed dublem przy ponowieniu.

Zajęcia grupowe:

- `GET  /businesses/:id/group-classes` - kursy (pojemność, tryb zapisu).
- `GET  /businesses/:id/group-class-sessions/timetable?from&to` - terminy w oknie
  6 tygodni.
- `POST /businesses/:id/group-class-sessions/:sessionId/register` - zapis na
  termin (`Idempotency-Key`).

Wynajem:

- `GET  /businesses/:id/rentals/availability-counts` - pigułki dni.
- `GET  /businesses/:id/rentals/day-slots` - godziny odbioru (wynajem godzinowy)
  albo `mode: 'range'` (doby, tygodnie, miesiące).
- `GET  /businesses/:id/rentals/availability` - czy dany okres jest wolny.
- `POST /businesses/:id/rentals/quote` i `POST .../rentals/promo-badges` - cena i
  oznaczenia promocji.
- `POST /businesses/:id/rentals` - rezerwacja wynajmu (`Idempotency-Key`).

Promocje i lista oczekujących:

- `GET  /businesses/:id/promotions/summary` - promocje do kart oferty.
- `GET  /businesses/:id/waitlist/check` i `POST /businesses/:id/waitlist` -
  lista oczekujących (widget wysyła `source: 'web'`).

Tożsamość:

- `POST /guest/otp/send` `{businessId,phone}` → `{expiresIn,maskedPhone,mode,codeLength}` - wysyła kod SMS.
- `POST /guest/otp/verify` `{businessId,firstName,lastName,email,phone,otp}` → `{userId,token}` (gość z `phoneVerified`), `409 EMAIL_IN_USE`, `400` przy złym/wygasłym kodzie.
- `POST /guest/login` `{businessId,email,password}` → `{userId,token}` (token w body - cookies są blokowane cross-origin).
- `POST /auth/check-email` `{email}` → `{exists}` - proaktywne wykrycie istniejącego konta.
- `GET  /auth/embed/start?provider&businessId&origin&key` - start OAuth w popupie (302 do dostawcy).
- `GET  /auth/embed/callback` - po OAuth odsyła `{token,userId}` przez `postMessage` do dozwolonego originu.

Backend tych endpointów żyje w monorepo Vizyto (m.in.
`apps/api/src/modules/auth/routes/public-guest.ts` dla gości - reużywa
istniejącej infrastruktury SMS, `createGuestCustomer`, tabeli `verifications` i
flagi `users.phoneVerified`).

**Egzekwowanie po stronie serwera (kluczowe).** Sama weryfikacja w widgecie nie
wystarcza - atakujący mógłby ją pominąć skryptem. Dlatego endpoint tworzenia
wizyty (`apps/api/src/modules/appointments/routes/public.ts`) dla żądań spoza
pierwszej strony (w tym bez nagłówka `Origin`) wymaga: ważnego site key, sesji
zgodnej z `bookedById` oraz - dla gości - `phoneVerified = true`. Zalogowane
konta Vizyto (nieanonimowe) pomijają warunek telefonu. To sprawia, że „musisz
przejść OTP lub się zalogować” jest twardą regułą serwera, a nie tylko UI. Tak
samo serwer, nie widget, egzekwuje politykę kanałów.

## Dev

```bash
pnpm install
pnpm dev      # http://localhost:4500 - strona demo z konfiguratorem na żywo
pnpm build    # -> dist/widget.js (jeden plik IIFE)
pnpm exec tsc --noEmit
pnpm build:cdn && bun test   # testy jednostkowe (style strony, kanały rezerwacji)
```

`index.html` to **konfigurator na żywo**: przełączasz motyw (jasny/ciemny/auto),
kolor akcentu, tryb (przycisk/inline), czcionkę i tekst - widget przemontowuje
się od razu, a gotowy snippet `<script>` aktualizuje się do skopiowania.

`scripts/step-smoke.mjs` przeklikuje kreator w przeglądarce na zbudowanej paczce
w trybie testowym (`scripts/mock-harness.html`); instrukcja uruchomienia jest w
nagłówku skryptu.

## API programistyczne

Plik wystawia `window.VizytoBooking`:

```js
const host = VizytoBooking.mount({
  businessId: 24,
  siteKey: 'pk_live_...',
  theme: 'auto',            // 'light' | 'dark' | 'auto'
  accent: '#fd9320',
  label: 'Zarezerwuj wizytę',
  font: 'on',               // 'off' = czcionka systemowa
  inline: '#booking',       // selektor/element/true; pominięcie => pływający przycisk
  showLauncher: false,      // ukryj pływający przycisk - otwierasz własnym CTA
})

// Otwórz modal z własnego przycisku (gdy showLauncher: false). Prefill skacze
// od razu do specjalisty/terminu:
VizytoBooking.open({ serviceId: 1, resourceId: 12 })  // oba -> krok „Termin”
VizytoBooking.open({ resourceId: 12 })                // sam barber -> preselekcja
VizytoBooking.open()                                  // od początku
VizytoBooking.close()
VizytoBooking.unmount()     // usuwa wszystkie instancje
```

### Prefill - trzy rodziny oferty

Widget obsługuje wizyty, **zajęcia grupowe** i **wynajem**. Biznes, który sprzedaje
więcej niż jedną rodzinę, dostaje na wejściu pytanie „co rezerwujesz”; prefill jest
odpowiedzią na to pytanie z góry, więc klik w grafik na stronie klubu nie każe
szukać tych zajęć drugi raz.

```js
// wizyta
VizytoBooking.open({ serviceId: 1, resourceId: 12 })

// zajęcia grupowe - kurs z listą jego terminów
VizytoBooking.open({ classId: 41 })
// konkretny termin z grafiku (sam `sessionId` wystarcza - kurs dobieramy sami)
VizytoBooking.open({ classId: 41, sessionId: 901 })

// wynajem - od katalogu przedmiotów
VizytoBooking.open({ kind: 'rental' })
// wynajem konkretnego egzemplarza (karta pojazdu na stronie wypożyczalni);
// sam `resourceId` egzemplarza wystarcza, `kind` jest tu opcjonalny
VizytoBooking.open({ resourceId: 31 })
```

| klucz | rodzina | znaczenie |
| --- | --- | --- |
| `serviceId` | wizyta | usługa do koszyka; z wariantami zostaje na kroku usługi, żeby je wybrać |
| `resourceId` | wizyta, wynajem | wizyta: wykonawca albo egzemplarz z puli, ignorowany, gdy usługa przydziela automatycznie; wynajem: egzemplarz - pomija listę i wchodzi od razu na jego kalendarz, także bez `kind` (egzemplarz z puli albo zdjęty z oferty zostawia listę) |
| `classId` | zajęcia | kurs; wchodzi od razu na jego grafik |
| `sessionId` | zajęcia | konkretny termin; **pełny termin jest odrzucany** i klient staje na liście |
| `kind` | wszystkie | `'service' \| 'class' \| 'rental'` - jawny wybór rodziny, gdy nie znasz id |

Prefill jest **podpowiedzią, nie rozkazem**: nieistniejący kurs, pełny termin albo
rodzina, której ten biznes nie sprzedaje, cofają klienta o krok zamiast pokazywać
pusty katalog albo obiecywać zapis, który serwer odrzuci. Rodzina, którą biznes
sprzedaje, ale której nie przyjmuje na stronie WWW, pokazuje stan zamknięcia
(„Kanały rezerwacji”).

Tag `<script>` z atrybutami `data-*` woła `mount()` automatycznie po załadowaniu.
`data-vizyto-launcher="hidden"` ukrywa przycisk (otwierasz przez `open()`).

## Eventy (konwersje, analityka)

Widget emituje event po każdym kroku lejka, więc strona-host może liczyć
konwersje (GA4 / GTM / Meta Pixel / własny backend) bez wiedzy o naszym kodzie.
Każdy event dociera **czterema** kanałami - podłącz się tym, który już masz:

```js
// 1) Subskrypcja programistyczna (zwraca funkcję odpinającą)
const offAll = VizytoBooking.on('*', (e) => console.log(e.type, e))
VizytoBooking.on('booking_completed', (e) => {
  gtag('event', 'purchase', { value: e.value, currency: e.currency, transaction_id: e.appointmentId })
})

// 2) Globalny CustomEvent na window: 'vizyto:<type>' oraz zbiorczy 'vizyto:event'
window.addEventListener('vizyto:booking_completed', (ev) => console.log(ev.detail))

// 3) Callback w mount()
VizytoBooking.mount({ businessId: 24, siteKey: 'pk_live_...', onEvent: (e) => {/* ... */} })

// 4) window.dataLayer (GTM/GA) - push { event: 'vizyto_<type>', ... } automatycznie.
//    Wyłącz: mount({ dataLayer: false }) lub data-vizyto-datalayer="off".
```

Każdy payload niesie `type`, `businessId`, `ts` (epoch ms) + pola właściwe dla
kroku. Lejek:

| Event | Kiedy | Kluczowe pola |
|---|---|---|
| `ready` | biznes wczytany, widget gotowy | `mode` |
| `open` / `close` | otwarcie/zamknięcie modala (launcher) | `source` (`launcher`/`api`) |
| `service_selected` | dodanie usługi do koszyka | `serviceId`, `serviceName`, `price` (grosze), `durationMin`, `itemCount` |
| `service_removed` | usunięcie usługi z koszyka | `serviceId`, `serviceName`, `itemCount` |
| `specialist_selected` | wybór specjalisty | `resourceId` (`null` = bez preferencji), `resourceName`; przy wyborze per usługa dodatkowo `serviceId` i `perService: true` |
| `datetime_selected` | wybór terminu | `date`, `time`, `slotKey`, `startDate` |
| `details_started` | wejście w krok danych | kontekst rezerwacji |
| `otp_sent` | wysłany kod SMS | `maskedPhone`, `resend` |
| `otp_verified` | poprawny kod | `userId` |
| `authenticated` | zalogowanie | `method` (`otp`/`password`/`google`/…), `userId` |
| `booking_submitted` | start zapisu rezerwacji | kontekst + `userId` |
| **`booking_completed`** | **rezerwacja potwierdzona (KONWERSJA)** | `appointmentId` (wizyta), `attendeeId` (zajęcia) albo `rentalId` (wynajem), `value` (PLN), `currency`, kontekst |
| `booking_failed` | błąd zapisu | `code`, `reason` (`network` / `slot_lost` / `verification_required` / `access_restricted` / `register_refused` / `rental_refused` / `channel_closed`) |
| `slot_lost` | termin zajęty przed potwierdzeniem | `code`, kontekst |
| `channel_closed` | firma nie przyjmuje tej rezerwacji na stronie WWW (#680) | `action` (`book`/`groupClasses`/`rentals`/`waitlist`/`all`), `stage` (`load` - zamknięte od wejścia, `submit` - 409 przy zapisie), przy `submit` także `code` i kontekst |
| `booking_access_denied` | biała lista: zalogowany klient nie może rezerwować online | `userId`, `serviceId`, `stage` |
| `waitlist_started` / `waitlist_joined` / `waitlist_failed` | lista oczekujących | `serviceId`, zakres dat i godzin; `code` przy błędzie |

> Telefon i e-mail nie trafiają do eventów (tylko `maskedPhone`) - żadnego PII.

**Koszyk a starsze integracje.** Wizyta może teraz łączyć kilka usług. Eventy od
`details_started` w dół zachowują dotychczasowe pola `serviceId`/`serviceName`
(wskazują PIERWSZĄ pozycję), więc istniejące konfiguracje GA4/GTM działają bez
zmian, i dokładają obok `serviceIds`, `serviceNames` oraz `itemCount`. `value` w
`booking_completed` to suma całego koszyka.

### Tryb testowy (bez backendu)

Ustaw `data-vizyto-api="mock"` w `index.html`. Wbudowany mock obsługuje cały
przepływ offline:

- kod SMS to zawsze **123456** (6 cyfr, logowany też w konsoli),
- e-mail **taken@example.com** → wymusza logowanie (`EMAIL_IN_USE`),
- termin z minutami **:55** (w siatce mocka jeden na dzień, 15:55 latem,
  14:55 zimą) → symuluje zajęty slot (recovery „wybierz inny termin”),
- mock respektuje koszyk: dłuższy łańcuch skraca dzień, zwraca `itemTimes` i
  `slotCandidates`, więc multi-usługę i wybór specjalisty do slotu da się
  przeklikać offline,
- usługi **Golenie brzytwą** + **Koloryzacja** nie mają wspólnego wykonawcy -
  para pokazuje tryb „wybierz specjalistę do każdej usługi”,
- logowanie: `taken@example.com` + dowolne hasło → sukces,
- kanały rezerwacji (#680) wybierasz id biznesu (`data-vizyto-business`):
  - **680** - kanał strony WWW wyłączony: stan zamknięcia zamiast kroków,
  - **681** - zajęcia i lista oczekujących wyłączone, wizyty i wynajem otwarte,
  - **682** - profil mówi „otwarte”, ale firma wyłącza cały kanał już po
    wczytaniu strony: każdy zapis nowej rezerwacji dostaje 409
    `CHANNEL_BOOKING_DISABLED` (tak odpowiada API przy wyłączonym kanale), a
    kolejne pobranie profilu pokazuje kanał zamknięty,
  - **683** - profil mówi „otwarte”, ale firma wyłącza akcje pojedynczo: każdy
    zapis dostaje 409 `CHANNEL_ACTION_DISABLED`, a kolejne pobranie profilu
    pokazuje zamkniętą tylko tę akcję.

`scripts/mock-harness.html` przyjmuje te same dźwignie w adresie:
`?business=680`, `?signedIn=1` (sesja bez kodu SMS), `?prefillClass=41`,
`?prefillSession=901`, `?prefillService=1`, `?prefillResource=31`, `?prefillKind=rental`,
`?onlyServices=1`.

### Test na prawdziwym API

Wygeneruj site key (scope `book`) dla originu `http://localhost:4500`, wstaw go w
`index.html` i ustaw `data-vizyto-api="http://127.0.0.1:5454"`. Uruchom backend
Vizyto, a następnie przejdź pełny przepływ (kod przyjdzie SMS-em lub trafi do
logów API w trybie `ENABLE_SMS=false`).

## Deploy (Cloudflare → widget.vizyto.com)

Widget to **static-assets Cloudflare Worker** (taki sam mechanizm jak inne appki
Vizyto: `wrangler deploy`), serwujący `https://widget.vizyto.com/v1/widget.js`.
`pnpm build:cdn` składa w `deploy/` kroczący widget, niezmienne wydanie z
manifestem, własne czcionki i `_headers` (zob. „Style strony”). Konfiguracja:
`wrangler.jsonc`.

**Wydanie** - tag uruchamia CI (`.github/workflows/deploy.yml`):

```bash
make release V=1.2.0   # tylko z main: tag v1.2.0 + push
```

Ręcznie: Actions → „Deploy widget” → Run, **wyłącznie z gałęzi `main`** (inna
gałąź kończy przebieg błędem). Albo lokalnie: `pnpm run deploy` (`make deploy`).
Zawsze `pnpm run deploy`, nie `pnpm deploy`: w pnpm 9 (CI) to wbudowane
polecenie workspace, które nie uruchamia skryptu z `package.json`.

CI po kolei: `pnpm install --frozen-lockfile` → `pnpm exec tsc --noEmit` →
`pnpm build:cdn` → `bun test` → `restore-published.mjs` → `wrangler deploy`.
Dwa deploye nigdy nie biegną naraz (grupa `concurrency`): jeden trwa, najwyżej
jeden czeka, a nowszy przebieg zastępuje ten czekający. Zastąpione wydanie nie
trafia do `/v/<hash>/` ani do `releases.json` - jeśli ma tam być, uruchom
ponownie przebieg jego taga.

**Niezmienne wydania:** każdy deploy (CI i `pnpm run deploy`) uruchamia po
`build:cdn` skrypt `scripts/restore-published.mjs`. Czyta on z produkcji
`/releases.json`, odtwarza w `deploy/` każde wymienione `/v/<hash>/` (widget,
manifest, użyte czcionki i licencje - wszystko ze sprawdzeniem hashy) i zapisuje
listę z powrotem z nowym wydaniem. Cloudflare static assets przy deployu
zastępują cały katalog, więc bez tego kroku starsze przypięte adresy stron
Vizyto by znikały. Każdy błąd pobrania albo hasha przerywa deploy; akceptowany
jest tylko brak `/releases.json` (pierwsze niezmienne wydanie).

### Jednorazowa konfiguracja

1. **Sekret** `CLOUDFLARE_API_TOKEN` w repo widgetu (`vizyto/vizyto-booking-widget`
   → Settings → Secrets and variables → Actions → New repository secret). Uwaga:
   monorepo jest pod `trupu/vizyto` (konto osobiste), więc token żyje jako sekret
   *tamtego* repo i nie da się go współdzielić ani odczytać. Użyj zapisanej
   wartości tokena albo wygeneruj nowy: Cloudflare → My Profile → API Tokens →
   „Edit Cloudflare Workers”. Lokalnie:
   `gh secret set CLOUDFLARE_API_TOKEN -R vizyto/vizyto-booking-widget`.
2. `CLOUDFLARE_ACCOUNT_ID` **nie jest potrzebny** - token jest account-scoped.
3. Domena `widget.vizyto.com` provisionuje się **automatycznie** przy pierwszym
   deployu (`routes.custom_domain` w `wrangler.jsonc`). Gdyby token nie miał
   uprawnień do strefy DNS - usuń `routes` i dodaj domenę ręcznie w ustawieniach
   Workera.

> ⚠️ Widget wymaga, by API (endpointy `guest/otp/*`, `guest/login`,
> `auth/embed/*` oraz wymuszenie `phoneVerified`) było już na produkcji. Najpierw
> `make release-api` w monorepo Vizyto, potem publikacja widgetu.
