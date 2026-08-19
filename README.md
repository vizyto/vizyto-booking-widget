# Vizyto Booking Widget

Osadzalny moduł rezerwacji Vizyto. Jeden tag `<script>`, dowolna strona (Wix,
WordPress, czysty HTML), niezależnie od hostingu. Preact + Shadow DOM (pełna
izolacja od CSS/JS strony hosta), single-file IIFE. Wygląd 1:1 z aplikacją
Vizyto — segmentowany pasek „KROK X Z 4", karty wyboru z radio, lepkie „Dalej",
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

Każda rezerwacja gościa jest potwierdzana **kodem SMS** na podany numer — bez
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
| `data-vizyto-font` | nie | `off` wyłącza ładowanie Poppins (czcionka systemowa, np. przy restrykcyjnym CSP) |
| `data-vizyto-inline` | nie | wymuś tryb inline bez `<div>` |
| `data-vizyto-token` | nie | bearer token zalogowanego klienta (pomija weryfikację SMS; wymaga też `-user`) |
| `data-vizyto-user` | nie | id zalogowanego klienta (parą z `-token`) |

## Motywy

Tokeny kolorów żyją jako zmienne CSS w Shadow DOM. `data-vizyto-theme="auto"`
ustawia motyw wg `prefers-color-scheme` i reaguje na zmianę motywu systemu w
locie. `--vz-accent` (z `data-vizyto-accent`) działa w obu motywach; odcienie
akcentu liczone są przez `color-mix`, więc dostosowują się automatycznie.

## Warunek działania

Klient w PRO → „Strona WWW” generuje **publishable site key** i dodaje **origin
swojej strony** (np. `https://salon-jana.pl`) do dozwolonych domen klucza. Bez
tego dynamiczny CORS odrzuci żądania (przeglądarka nie sfałszuje Origin).
Klucz musi mieć scope `book`.

## Wymagane endpointy API (public)

Widget korzysta z (wszystkie pod `/api/public`, nagłówek `x-vizyto-site-key`,
zapisy dodatkowo `Authorization: Bearer <token>`):

- `GET  /businesses/:id` — dane biznesu (usługi, zasoby, `bookingPolicy`:
  okno bezpłatnego odwołania + „Ważne informacje” pokazywane przed wysłaniem
  formularza).
- `GET  /businesses/:id/service-categories` - grupowanie usług w zakładki.
- `POST /businesses/:id/appointments/availability/cart` - wolne początki łańcucha
  dla koszyka (`items[]`); zwraca `slots`, `itemTimes` (rozpiska pozycji) i
  `totalMinutes`. Z `includeCandidates: true` dokłada `slotCandidates` — kto jest
  wolny w danym slocie (wybór specjalisty po wybraniu godziny).
- `POST /businesses/:id/appointments/availability/cart/counts` - pigułki dni.
- `POST /businesses/:id/appointments/availability/cart/first-free` - najbliższy
  wolny termin (serwer przeczesuje 60 dni).
- `POST /businesses/:id/waitlist` i `GET .../waitlist/check` - lista oczekujących
  (widget wysyła `source: 'web'`).
- `POST /guest/otp/send` `{businessId,phone}` → `{expiresIn,maskedPhone}` — wysyła kod SMS.
- `POST /guest/otp/verify` `{businessId,firstName,lastName,email,phone,otp}` → `{userId,token}` (gość z `phoneVerified`), `409 EMAIL_IN_USE`, `400` przy złym/wygasłym kodzie.
- `POST /guest/login` `{businessId,email,password}` → `{userId,token}` (token w body — cookies są blokowane cross-origin).
- `POST /auth/check-email` `{email}` → `{exists}` — proaktywne wykrycie istniejącego konta.
- `GET  /auth/embed/start?provider&businessId&origin&key` — start OAuth w popupie (302 do dostawcy).
- `GET  /auth/embed/callback` — po OAuth odsyła `{token,userId}` przez `postMessage` do dozwolonego originu.
- `POST /businesses/:id/appointments` — tworzy wizytę (i wysyła SMS-potwierdzenie).
  Kontrakt koszyka: `items[]` w kolejności wykonania, każda pozycja z własnym
  `resourceId` (`null` = Dowolny), `addonIds` i `durationMinutes`. Nagłówek
  `Idempotency-Key` chroni przed dublem przy ponowieniu.

Backend tych endpointów żyje w monorepo Vizyto:
`apps/api/src/modules/auth/routes/public-guest.ts` (reużywa istniejącej infry
SMS, `createGuestCustomer`, tabeli `verifications` i flagi `users.phoneVerified`
— bez migracji DB).

**Egzekwowanie po stronie serwera (kluczowe).** Sama weryfikacja w widgecie nie
wystarcza — atakujący mógłby ją pominąć skryptem. Dlatego endpoint tworzenia
wizyty (`apps/api/src/modules/appointments/routes/public.ts`) dla żądań spoza
pierwszej strony (w tym bez nagłówka `Origin`) wymaga: ważnego site key, sesji
zgodnej z `bookedById` oraz — dla gości — `phoneVerified = true`. Zalogowane
konta Vizyto (nieanonimowe) pomijają warunek telefonu. To sprawia, że „musisz
przejść OTP lub się zalogować” jest twardą regułą serwera, a nie tylko UI.

## Dev

```bash
pnpm install
pnpm dev      # http://localhost:4500 — strona demo z konfiguratorem na żywo
pnpm build    # -> dist/widget.js (jeden plik IIFE)
```

`index.html` to **konfigurator na żywo**: przełączasz motyw (jasny/ciemny/auto),
kolor akcentu, tryb (przycisk/inline), czcionkę i tekst — widget przemontowuje
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
  showLauncher: false,      // ukryj pływający przycisk — otwierasz własnym CTA
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
Każdy event dociera **czterema** kanałami — podłącz się tym, który już masz:

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

// 4) window.dataLayer (GTM/GA) — push { event: 'vizyto_<type>', ... } automatycznie.
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

> Telefon i e-mail nie trafiają do eventów (tylko `maskedPhone`) — żadnego PII.

**Koszyk a starsze integracje.** Wizyta może teraz łączyć kilka usług. Eventy od
`details_started` w dół zachowują dotychczasowe pola `serviceId`/`serviceName`
(wskazują PIERWSZĄ pozycję), więc istniejące konfiguracje GA4/GTM działają bez
zmian, i dokładają obok `serviceIds`, `serviceNames` oraz `itemCount`. `value` w
`booking_completed` to suma całego koszyka.

### Tryb testowy (bez backendu)

Ustaw `data-vizyto-api="mock"` w `index.html`. Wbudowany mock obsługuje cały
przepływ offline:

- kod SMS to zawsze **1234** (logowany też w konsoli),
- e-mail **taken@example.com** → wymusza logowanie (`EMAIL_IN_USE`),
- termin **15:55** → symuluje zajęty slot (recovery „wybierz inny termin”),
- mock respektuje koszyk: dłuższy łańcuch skraca dzień, zwraca `itemTimes` i
  `slotCandidates`, więc multi-usługę i wybór specjalisty do slotu da się
  przeklikać offline,
- usługi **Golenie brzytwą** + **Koloryzacja** nie mają wspólnego wykonawcy —
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
`pnpm build:cdn` składa katalog `deploy/` (`v1/widget.js` + `_headers` z CORS i
krótkim cache — `/v1/` to ruchomy wskaźnik najnowszej wersji v1). Konfiguracja:
`wrangler.jsonc`.

**Wydanie** — tag uruchamia CI (`.github/workflows/deploy.yml`):

```bash
git tag v1.0.0 && git push origin v1.0.0   # lub: Actions → Deploy widget → Run
```

Albo lokalnie: `pnpm deploy`.

### Jednorazowa konfiguracja

1. **Sekret** `CLOUDFLARE_API_TOKEN` w repo widgetu (`vizyto/vizyto-booking-widget`
   → Settings → Secrets and variables → Actions → New repository secret). Uwaga:
   monorepo jest pod `trupu/vizyto` (konto osobiste), więc token żyje jako sekret
   *tamtego* repo i nie da się go współdzielić ani odczytać. Użyj zapisanej
   wartości tokena albo wygeneruj nowy: Cloudflare → My Profile → API Tokens →
   „Edit Cloudflare Workers". Lokalnie:
   `gh secret set CLOUDFLARE_API_TOKEN -R vizyto/vizyto-booking-widget`.
2. `CLOUDFLARE_ACCOUNT_ID` **nie jest potrzebny** — token jest account-scoped.
3. Domena `widget.vizyto.com` provisionuje się **automatycznie** przy pierwszym
   deployu (`routes.custom_domain` w `wrangler.jsonc`). Gdyby token nie miał
   uprawnień do strefy DNS — usuń `routes` i dodaj domenę ręcznie w ustawieniach
   Workera.

> ⚠️ Widget wymaga, by API (endpointy `guest/otp/*`, `guest/login`,
> `auth/embed/*` oraz wymuszenie `phoneVerified`) było już na produkcji. Najpierw
> `make release-api` w monorepo Vizyto, potem publikacja widgetu.
