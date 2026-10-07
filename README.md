# Vizyto Booking Widget

Osadzalny moduł rezerwacji Vizyto. Jeden tag `<script>`, dowolna strona (Wix,
WordPress, czysty HTML), niezależnie od hostingu. Preact + Shadow DOM (pełna
izolacja od CSS/JS strony hosta), single-file IIFE. Wygląd 1:1 z aplikacją
Vizyto - segmentowany pasek „KROK X Z 4", karty wyboru z radio, lepkie „Dalej",
sloty pogrupowane (Rano / Południe / Wieczór), widok tydzień/miesiąc, czcionka
Poppins, motyw jasny/ciemny/auto.

Poradnik osadzania: <https://vizyto.com/blog/widget-rezerwacji-na-strone-internetowa>
(link jest też w stopce widgetu pod „Rezerwacje przez Vizyto").

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

Domyślnie: pływający przycisk w rogu → modal z kreatorem
(Usługa → Specjalista → Termin → Dane → **weryfikacja SMS** → potwierdzenie).

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

- Gość: imię, nazwisko, telefon, e-mail → kod SMS (4 cyfry, ważny 5 min,
  3 próby, ponowne wysłanie co 60 s) → rezerwacja.
- Jeśli e-mail ma już konto Vizyto, kreator automatycznie proponuje logowanie.
- Strona, która sama jest zalogowaną powierzchnią Vizyto, może podać
  `data-vizyto-token` + `data-vizyto-user` i pominąć cały krok weryfikacji.

## Atrybuty `data-*`

| atrybut | wymagany | opis |
|---|---|---|
| `data-vizyto-business` | tak | id biznesu w Vizyto |
| `data-vizyto-key` | tak | publishable site key z PRO → „Strona WWW” |
| `data-vizyto-api` | nie | origin API (domyślnie `https://api.vizyto.com`; `mock` = tryb testowy bez backendu) |
| `data-vizyto-label` | nie | tekst przycisku |
| `data-vizyto-accent` | nie | kolor akcentu, hex (domyślnie `#fd9320`) |
| `data-vizyto-theme` | nie | `light` (domyślnie), `dark`, lub `auto` (śledzi motyw systemu na żywo) |
| `data-vizyto-font` | no | `off` disables font registration and uses the system font stack |
| `data-vizyto-inline` | nie | wymuś tryb inline bez `<div>` |
| `data-vizyto-token` | nie | bearer token zalogowanego klienta (pomija weryfikację SMS; wymaga też `-user`) |
| `data-vizyto-user` | nie | id zalogowanego klienta (parą z `-token`) |

## Motywy

Tokeny kolorów żyją jako zmienne CSS w Shadow DOM. `data-vizyto-theme="auto"`
ustawia motyw wg `prefers-color-scheme` i reaguje na zmianę motywu systemu w
locie. `--vz-accent` (z `data-vizyto-accent`) działa w obu motywach; odcienie
akcentu liczone są przez `color-mix`, więc dostosowują się automatycznie.

## Site styles (F10)

The existing embed and `mount()` API accept the following additive options. The
widget uses only the sans face of the selected site font pack. Theme remains
`light` by default; `dark` and the existing live `auto` mode are supported.

| Mount option | Script attribute | Behavior |
|---|---|---|
| `fontPackId` | `data-vizyto-font-pack-id` | One of the nine IDs below; unknown IDs use Poppins |
| `accent` | `data-vizyto-accent` | `--vz-accent`, default `#fd9320` |
| `accentLight` | `data-vizyto-accent-light` | `--vz-accent-tint`, default `#ffdca8` |
| `accentDark` | `data-vizyto-accent-dark` | `--vz-accent-strong`, default `#bf700f` |
| `onAccent` | `data-vizyto-on-accent` | `--vz-on-accent`, default `#ffffff` |
| `theme` | `data-vizyto-theme` | `light`, `dark`, or `auto`; invalid values use `light` |
| `font` | `data-vizyto-font` | `off` skips font registration and explicitly uses the system font stack |

| Font pack ID | Widget family |
|---|---|
| `fraunces-manrope-v1` | Manrope |
| `bodoni-moda-outfit-v1` | Outfit |
| `cormorant-garamond-jost-v1` | Jost |
| `oswald-poppins-v1` | Poppins (default) |
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

The same values can be passed to `VizytoBooking.mount({ businessId, siteKey,
fontPackId, theme, accent, accentLight, accentDark, onAccent })`. No family is
inferred from a font: the site renderer supplies its family's `widgetTheme`.
All four colors must match `^#[0-9a-fA-F]{6}$` exactly. Invalid values are ignored,
including short hex, CSS names, CSS fragments and URLs. Contrast is checked only
when the embed supplies a valid `accent` or `onAccent`. After combining those
values with defaults, a contrast below 4.5:1 replaces only `onAccent` with whichever
of `#ffffff` and `#18181b` has higher contrast against the resolved accent. The
supplied accent is preserved. Light/dark accent tokens remain independent.

Without a valid accent/label override, all legacy defaults remain unchanged,
including white `#ffffff` text on `#fd9320`, matching the Vizyto primary button.

### Self-hosted fonts and immutable builds

No Google font stylesheet, preconnect or font request is made. `@font-face` rules
are registered once per pack/manifest in the document, since registration inside
Shadow DOM is unreliable across browsers. Each widget explicitly sets `--vz-font`
inside its own Shadow DOM. `font: 'off'` registers nothing, even if another
instance already registered its fonts.

The build reads the installed approved `@fontsource` packages, uses only normal
WOFF2 files for `latin` and `latin-ext`, and sets `font-display: swap`. Static
weights are 400, 500, 600 and 700. Existing CSS weight 650 uses browser matching
to 700; there is no extra 650 file. Polish letters are covered by the two subsets.
OFL-1.1 license files are distributed alongside the fonts. Font URLs use the
widget script's origin: `<widget-origin>/fonts/<family-slug>/<sha256>.woff2`.
The origin is captured from `document.currentScript.src` during classic script
execution, including dynamically inserted scripts, and retained for later mounts.
Only `http:` and `https:` are accepted; a missing or invalid script URL falls back
to `https://widget.vizyto.com`. Production, staging and local servers must serve
the generated `deploy/fonts/` assets alongside the widget. For example, a script
loaded from `http://127.0.0.1:4391/v1/widget.js` requests fonts from
`http://127.0.0.1:4391/fonts/`, matching CSP `font-src` for that widget origin.

`pnpm build:cdn` emits:

- `deploy/v1/widget.js`: the existing rolling v1 entry point.
- `deploy/v/<widget-sha256>/widget.js`: an immutable URL derived from the exact
  bundle bytes. Use `https://widget.vizyto.com/v/<widget-sha256>/widget.js` to pin
  a published site's widget version. The build prints the actual path.
- `deploy/v/<widget-sha256>/manifest.json`: one release manifest for PRO, SSR
  and the widget. It includes `schemaVersion`, `hash` of the canonical font
  manifest (`JSON.stringify({ schemaVersion, fontPacks })`), `widget` version,
  path and SHA-256, and `capabilities`. `fontPacks[fontPackId]` contains the sans
  `family`, package/version, license path, weights and `files` with paths,
  weights, style, subsets, unicode ranges and SHA-256 hashes. It does not contain
  the site's display or mono fonts. Vite embeds the same font manifest in the
  bundle; runtime registration needs no manifest fetch. `dist/font-manifest.json`
  is the intermediate build input verified by the deploy assembler.
- `deploy/fonts/<family-slug>/*`: hashed WOFF2 files and OFL license text.
- `deploy/_headers` and `deploy/index.html`.

Font, license, immutable widget and manifest responses have
`Cache-Control: public, max-age=31536000, immutable`,
`Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`.
Rolling `/v1/widget.js` retains
`Cache-Control: public, max-age=600, stale-while-revalidate=86400` and its existing
CORS headers. **600 seconds does not guarantee that clients receive an update.**

The assembler preserves previous immutable files already in `deploy/`. Release
packaging must retain previously published `v/` and `fonts/` files across clean
CI deployments so pinned sites and cached rolling bundles keep working. The
existing clean-checkout workflow does not yet restore that archive; archive
retention must be wired before publishing pinned sites. Immutable cache headers
alone do not retain files on the server. F10 does not deploy or change the CI
release workflow.

Verification (no extra test dependencies):

```sh
pnpm exec tsc --noEmit
pnpm build:cdn
bun test tests/site-styles.test.js
grep -r googleapis dist deploy  # no matches, exit status 1
```

## Warunek działania

Klient w PRO → „Strona WWW” generuje **publishable site key** i dodaje **origin
swojej strony** (np. `https://salon-jana.pl`) do dozwolonych domen klucza. Bez
tego dynamiczny CORS odrzuci żądania (przeglądarka nie sfałszuje Origin).
Klucz musi mieć scope `book`.

## Wymagane endpointy API (public)

Widget korzysta z (wszystkie pod `/api/public`, nagłówek `x-vizyto-site-key`,
zapisy dodatkowo `Authorization: Bearer <token>`):

- `GET  /businesses/:id` - dane biznesu (usługi, zasoby, `bookingPolicy`:
  okno bezpłatnego odwołania + „Ważne informacje” pokazywane przed wysłaniem
  formularza).
- `GET  /businesses/:id/service-categories` - grupowanie usług w zakładki.
- `POST /businesses/:id/appointments/availability/cart` - wolne początki łańcucha
  dla koszyka (`items[]`); zwraca `slots`, `itemTimes` (rozpiska pozycji) i
  `totalMinutes`. Z `includeCandidates: true` dokłada `slotCandidates` - kto jest
  wolny w danym slocie (wybór specjalisty po wybraniu godziny).
- `POST /businesses/:id/appointments/availability/cart/counts` - pigułki dni.
- `POST /businesses/:id/appointments/availability/cart/first-free` - najbliższy
  wolny termin (serwer przeczesuje 60 dni).
- `POST /businesses/:id/waitlist` i `GET .../waitlist/check` - lista oczekujących
  (widget wysyła `source: 'web'`).
- `POST /guest/otp/send` `{businessId,phone}` → `{expiresIn,maskedPhone}` - wysyła kod SMS.
- `POST /guest/otp/verify` `{businessId,firstName,lastName,email,phone,otp}` → `{userId,token}` (gość z `phoneVerified`), `409 EMAIL_IN_USE`, `400` przy złym/wygasłym kodzie.
- `POST /guest/login` `{businessId,email,password}` → `{userId,token}` (token w body - cookies są blokowane cross-origin).
- `POST /auth/check-email` `{email}` → `{exists}` - proaktywne wykrycie istniejącego konta.
- `GET  /auth/embed/start?provider&businessId&origin&key` - start OAuth w popupie (302 do dostawcy).
- `GET  /auth/embed/callback` - po OAuth odsyła `{token,userId}` przez `postMessage` do dozwolonego originu.
- `POST /businesses/:id/appointments` - tworzy wizytę (i wysyła SMS-potwierdzenie).
  Kontrakt koszyka: `items[]` w kolejności wykonania, każda pozycja z własnym
  `resourceId` (`null` = Dowolny), `addonIds` i `durationMinutes`. Nagłówek
  `Idempotency-Key` chroni przed dublem przy ponowieniu.

Backend tych endpointów żyje w monorepo Vizyto:
`apps/api/src/modules/auth/routes/public-guest.ts` (reużywa istniejącej infry
SMS, `createGuestCustomer`, tabeli `verifications` i flagi `users.phoneVerified`
- bez migracji DB).

**Egzekwowanie po stronie serwera (kluczowe).** Sama weryfikacja w widgecie nie
wystarcza - atakujący mógłby ją pominąć skryptem. Dlatego endpoint tworzenia
wizyty (`apps/api/src/modules/appointments/routes/public.ts`) dla żądań spoza
pierwszej strony (w tym bez nagłówka `Origin`) wymaga: ważnego site key, sesji
zgodnej z `bookedById` oraz - dla gości - `phoneVerified = true`. Zalogowane
konta Vizyto (nieanonimowe) pomijają warunek telefonu. To sprawia, że „musisz
przejść OTP lub się zalogować” jest twardą regułą serwera, a nie tylko UI.

## Dev

```bash
pnpm install
pnpm dev      # http://localhost:4500 - strona demo z konfiguratorem na żywo
pnpm build    # -> dist/widget.js (jeden plik IIFE)
```

`index.html` to **konfigurator na żywo**: przełączasz motyw (jasny/ciemny/auto),
kolor akcentu, tryb (przycisk/inline), czcionkę i tekst - widget przemontowuje
się od razu, a gotowy snippet `<script>` aktualizuje się do skopiowania.

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
VizytoBooking.open({ serviceId: 1, resourceId: 12 })  // oba -> krok „Termin"
VizytoBooking.open({ resourceId: 12 })                // sam barber -> preselekcja
VizytoBooking.open()                                  // od początku
VizytoBooking.close()
VizytoBooking.unmount()     // usuwa wszystkie instancje
```

### Prefill - trzy rodziny oferty

Widget obsługuje wizyty, **zajęcia grupowe** i **wynajem**. Biznes, który sprzedaje
więcej niż jedną rodzinę, dostaje na wejściu pytanie „co rezerwujesz"; prefill jest
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
```

| klucz | rodzina | znaczenie |
| --- | --- | --- |
| `serviceId` | wizyta | usługa do koszyka; z wariantami zostaje na kroku usługi, żeby je wybrać |
| `resourceId` | wizyta | wykonawca albo egzemplarz z puli; ignorowany, gdy usługa przydziela automatycznie |
| `classId` | zajęcia | kurs; wchodzi od razu na jego grafik |
| `sessionId` | zajęcia | konkretny termin; **pełny termin jest odrzucany** i klient staje na liście |
| `kind` | wszystkie | `'service' \| 'class' \| 'rental'` - jawny wybór rodziny, gdy nie znasz id |

Prefill jest **podpowiedzią, nie rozkazem**: nieistniejący kurs, pełny termin albo
rodzina, której ten biznes nie sprzedaje, cofają klienta o krok zamiast pokazywać
pusty katalog albo obiecywać zapis, który serwer odrzuci.

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
| **`booking_completed`** | **rezerwacja potwierdzona (KONWERSJA)** | `appointmentId`, `value` (PLN), `currency`, kontekst |
| `booking_failed` | błąd zapisu | `code`, `reason` (`network`/`slot_lost`/`verification_required`) |
| `slot_lost` | termin zajęty przed potwierdzeniem | `code`, kontekst |

> Telefon i e-mail nie trafiają do eventów (tylko `maskedPhone`) - żadnego PII.

**Koszyk a starsze integracje.** Wizyta może teraz łączyć kilka usług. Eventy od
`details_started` w dół zachowują dotychczasowe pola `serviceId`/`serviceName`
(wskazują PIERWSZĄ pozycję), więc istniejące konfiguracje GA4/GTM działają bez
zmian, i dokładają obok `serviceIds`, `serviceNames` oraz `itemCount`. `value` w
`booking_completed` to suma całego koszyka.

### Tryb testowy (bez backendu)

Ustaw `data-vizyto-api="mock"` w `index.html`. Wbudowany mock obsługuje cały
przepływ offline:

- kod SMS to zawsze **123456** (logowany też w konsoli),
- e-mail **taken@example.com** → wymusza logowanie (`EMAIL_IN_USE`),
- termin **15:55** → symuluje zajęty slot (recovery „wybierz inny termin”),
- mock respektuje koszyk: dłuższy łańcuch skraca dzień, zwraca `itemTimes` i
  `slotCandidates`, więc multi-usługę i wybór specjalisty do slotu da się
  przeklikać offline,
- usługi **Golenie brzytwą** + **Koloryzacja** nie mają wspólnego wykonawcy -
  para pokazuje tryb „wybierz specjalistę do każdej usługi”,
- logowanie: `taken@example.com` + dowolne hasło → sukces.

### Test na prawdziwym API

Wygeneruj site key (scope `book`) dla originu `http://localhost:4500`, wstaw go w
`index.html` i ustaw `data-vizyto-api="http://127.0.0.1:5454"`. Uruchom backend
Vizyto, a następnie przejdź pełny przepływ (kod przyjdzie SMS-em lub trafi do
logów API w trybie `ENABLE_SMS=false`).

## Deploy (Cloudflare → widget.vizyto.com)

Widget to **static-assets Cloudflare Worker** (taki sam mechanizm jak inne appki
Vizyto: `wrangler deploy`), serwujący `https://widget.vizyto.com/v1/widget.js`.
`pnpm build:cdn` assembles the rolling widget, immutable build and manifest,
self-hosted fonts and `_headers` in `deploy/` (see Site styles above).
Configuration: `wrangler.jsonc`.

**Wydanie** - tag uruchamia CI (`.github/workflows/deploy.yml`):

```bash
git tag v1.0.0 && git push origin v1.0.0   # lub: Actions → Deploy widget → Run
```

Albo lokalnie: `pnpm deploy`.

**Immutable releases:** every deploy runs `scripts/restore-published.mjs` after
`build:cdn`. It reads the live `/releases.json`, restores each listed `/v/<hash>/`
(widget, manifest, referenced fonts and licenses, all hash-checked) into `deploy/` and
writes the list back with the new release. Cloudflare static assets replace the whole
directory on deploy, so without this step older pinned URLs used by Vizyto sites would
disappear. Any fetch or hash error aborts the deploy; only a missing `/releases.json`
(first immutable release) is accepted.

### Jednorazowa konfiguracja

1. **Sekret** `CLOUDFLARE_API_TOKEN` w repo widgetu (`vizyto/vizyto-booking-widget`
   → Settings → Secrets and variables → Actions → New repository secret). Uwaga:
   monorepo jest pod `trupu/vizyto` (konto osobiste), więc token żyje jako sekret
   *tamtego* repo i nie da się go współdzielić ani odczytać. Użyj zapisanej
   wartości tokena albo wygeneruj nowy: Cloudflare → My Profile → API Tokens →
   „Edit Cloudflare Workers". Lokalnie:
   `gh secret set CLOUDFLARE_API_TOKEN -R vizyto/vizyto-booking-widget`.
2. `CLOUDFLARE_ACCOUNT_ID` **nie jest potrzebny** - token jest account-scoped.
3. Domena `widget.vizyto.com` provisionuje się **automatycznie** przy pierwszym
   deployu (`routes.custom_domain` w `wrangler.jsonc`). Gdyby token nie miał
   uprawnień do strefy DNS - usuń `routes` i dodaj domenę ręcznie w ustawieniach
   Workera.

> ⚠️ Widget wymaga, by API (endpointy `guest/otp/*`, `guest/login`,
> `auth/embed/*` oraz wymuszenie `phoneVerified`) było już na produkcji. Najpierw
> `make release-api` w monorepo Vizyto, potem publikacja widgetu.
