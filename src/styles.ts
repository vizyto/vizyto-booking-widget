// All styling lives inside the widget's Shadow DOM, so host-page CSS can never
// touch it and these class names can never collide. Two themes (light/dark) are
// expressed as a CSS custom-property token layer on .vz-root; index.ts flips
// .vz-root[data-theme="dark"]. Tokens + chrome mirror the real Vizyto app
// (segmented stepper, option tiles, sticky "Dalej" bar). Accent (--vz-accent)
// and font (--vz-font) stay overridable from the embed.
//
// The look is the app's booking wizard "Czysty miesiąc" (vizyto #1168): fills
// instead of frames. Every tile is a borderless --vz-fill surface with a large
// radius (round day cells and hour pills); a picked one carries a 2px accent
// outline on the accent tint (--vz-selected), never a solid fill. Every colour
// of that language is derived from --vz-accent, so it holds for any embed.
export const css = `
:host { all: initial; }
* { box-sizing: border-box; }

/* ---- TOKENS (light defaults) ------------------------------------------- */
.vz-root {
  --vz-font: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  --vz-accent: #fd9320;
  --vz-accent-strong: #bf700f;
  --vz-accent-tint: #ffdca8;
  --vz-on-accent: #ffffff;

  --vz-success: #22c55e;
  --vz-error: #ef4444;
  --vz-warning: #f59e0b;

  --vz-bg: #fafafa;
  --vz-surface: #ffffff;
  --vz-surface-2: #f4f4f5;
  /* Tiles are fills without a frame, so the fill sits a clear step under the surface. */
  --vz-fill: #f0f0f1;
  --vz-border: #e8e8ea;
  --vz-text: #18181b;
  --vz-text-muted: #8a8a93;
  --vz-input-bg: #ffffff;
  --vz-ring: #a3a3a3;
  --vz-selected: color-mix(in srgb, var(--vz-accent) 10%, var(--vz-surface));
  /* Availability bar of a calendar day: three levels, told apart by length too. */
  --vz-avail-high: #6fcf97;
  --vz-avail-medium: #f2c063;
  --vz-avail-low: #ee8b8b;

  --vz-r-sm: 10px;
  --vz-r-md: 16px;
  --vz-r-lg: 20px;
  --vz-r-xl: 24px;
  --vz-r-pill: 999px;

  --vz-ease-out: cubic-bezier(.22,1,.36,1);
  --vz-dur-in: 280ms;
  --vz-dur-out: 160ms;

  --vz-shadow-modal: 0 30px 80px rgba(0,0,0,.32);
  --vz-shadow-launcher: 0 8px 30px rgba(0,0,0,.28);

  font-family: var(--vz-font);
  color: var(--vz-text);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.vz-root[data-theme="dark"] {
  --vz-bg: #0a0a0a;
  --vz-surface: #161616;
  --vz-surface-2: #1f1f1f;
  --vz-fill: #242424;
  --vz-border: #2a2a2a;
  --vz-text: #fafafa;
  --vz-text-muted: #a1a1aa;
  --vz-input-bg: #1f1f1f;
  --vz-ring: #3f3f46;
  --vz-selected: color-mix(in srgb, var(--vz-accent) 15%, var(--vz-surface));
  --vz-shadow-modal: 0 30px 80px rgba(0,0,0,.6);
  --vz-shadow-launcher: 0 10px 34px rgba(0,0,0,.55);
}

/* ---- LAUNCHER ---------------------------------------------------------- */
.vz-launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 22px; border: 0; border-radius: var(--vz-r-pill);
  background: var(--vz-accent); color: var(--vz-on-accent);
  font-family: var(--vz-font); font-size: 15px; font-weight: 600;
  cursor: pointer; box-shadow: var(--vz-shadow-launcher);
  transition: transform var(--vz-dur-in) var(--vz-ease-out), filter var(--vz-dur-out);
}
.vz-launcher:hover { transform: translateY(-1px); filter: brightness(1.04); }
.vz-launcher:active { transform: scale(.97); }

/* ---- OVERLAY + PANEL --------------------------------------------------- */
.vz-overlay {
  position: fixed; inset: 0; z-index: 2147483001;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(8,8,10,.55); backdrop-filter: blur(5px);
  animation: vz-fade var(--vz-dur-in) var(--vz-ease-out);
}
@keyframes vz-fade { from { opacity: 0 } to { opacity: 1 } }

.vz-panel {
  position: relative; display: flex; flex-direction: column;
  width: 100%; max-width: 460px; max-height: min(92vh, 820px);
  background: var(--vz-surface); color: var(--vz-text);
  border: 1px solid var(--vz-border); border-radius: 28px;
  box-shadow: var(--vz-shadow-modal); overflow: hidden;
  animation: vz-pop var(--vz-dur-in) var(--vz-ease-out);
}
@keyframes vz-pop { from { opacity: 0; transform: translateY(14px) scale(.985) } to { opacity: 1; transform: none } }
.vz-inline { position: relative; }
.vz-inline .vz-panel { box-shadow: none; max-width: none; animation: none; max-height: none; }

/* ---- HEADER ------------------------------------------------------------ */
.vz-head {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 14px; border-bottom: 1px solid var(--vz-border);
  background: var(--vz-surface); flex: 0 0 auto;
}
.vz-head-spacer { width: 36px; height: 36px; flex: 0 0 auto; }
.vz-title { flex: 1 1 auto; text-align: center; font-size: 16px; font-weight: 600; letter-spacing: .01em; }
.vz-iconbtn {
  width: 36px; height: 36px; flex: 0 0 auto; border: 0; background: transparent;
  border-radius: 50%; cursor: pointer; color: var(--vz-text);
  display: flex; align-items: center; justify-content: center;
  transition: background var(--vz-dur-out);
}
.vz-iconbtn:hover { background: var(--vz-surface-2); }

.vz-body { padding: 18px 18px 22px; overflow-y: auto; flex: 1 1 auto; }

.vz-powered {
  display: flex; align-items: center; justify-content: center;
  padding: 11px 0; border-top: 1px solid var(--vz-border); flex: 0 0 auto;
  background: var(--vz-surface);
}
.vz-powered-link { display: inline-flex; align-items: center; gap: 6px; color: var(--vz-text); text-decoration: none; }
.vz-powered-cap { font-size: 11px; color: var(--vz-text-muted); }
.vz-powered svg { height: 13px; width: auto; opacity: .9; transition: opacity var(--vz-dur-out); }
.vz-powered-link:hover svg { opacity: 1; }
.vz-powered-link:hover .vz-powered-cap { color: var(--vz-text); }

/* ---- PROGRESS (KROK X Z N) --------------------------------------------- */
.vz-prog { margin-bottom: 20px; }
.vz-prog-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.vz-prog-krok { font-size: 13px; font-weight: 600; color: var(--vz-accent); letter-spacing: .04em; }
.vz-prog-name { font-size: 12px; font-weight: 500; color: var(--vz-text-muted); letter-spacing: .06em; text-transform: uppercase; text-align: right; }
.vz-prog-bars { display: flex; gap: 8px; }
.vz-prog-bar { flex: 1 1 0; height: 5px; border-radius: 3px; background: var(--vz-border); transition: background var(--vz-dur-in) var(--vz-ease-out); }
.vz-prog-bar.on { background: var(--vz-accent); }

/* ---- OPTION TILES (radio) ---------------------------------------------- */
/* A fill without a frame; the picked tile carries the accent outline on the tint. */
.vz-list { display: grid; gap: 10px; }
.vz-card {
  display: flex; align-items: center; gap: 14px; text-align: left; width: 100%; min-height: 76px;
  padding: 10px 14px; border: 2px solid transparent; border-radius: var(--vz-r-xl);
  background: var(--vz-fill); color: var(--vz-text); cursor: pointer;
  font-family: var(--vz-font); transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
@media (hover: hover) {
  .vz-card:not(.is-disabled):not(.selected):hover { border-color: color-mix(in srgb, var(--vz-accent) 40%, transparent); }
}
/* Karta jest divem z rolą, więc obrys fokusu trzeba narysować samemu -
   przeglądarka nie da go za darmo. */
.vz-card:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-card:not(.is-disabled):active { transform: scale(.99); }
.vz-card.is-disabled { cursor: not-allowed; color: var(--vz-text-muted); filter: grayscale(1); }
.vz-card.selected { background: var(--vz-selected); border-color: var(--vz-accent); }
/* A card with a band across its foot (a worker's promotion): the card clips the
   band edge to edge and its body keeps the padding in a row of its own. */
.vz-card.has-foot { flex-direction: column; align-items: stretch; gap: 0; padding: 0; overflow: hidden; }
.vz-card-row { display: flex; align-items: center; gap: 14px; min-height: 72px; padding: 10px 14px; }
.vz-card-av {
  width: 52px; height: 52px; flex: 0 0 auto; border-radius: 50%; overflow: hidden;
  background: var(--vz-surface); display: flex; align-items: center; justify-content: center;
  color: var(--vz-text-muted); font-weight: 500; font-size: 19px;
}
.vz-card-av img { width: 100%; height: 100%; object-fit: cover; }
.vz-card.selected .vz-card-av { color: var(--vz-text); }
/* Kwadratowa miniatura (zajęcia, oferta) albo litera zastępcza. */
.vz-card-thumb {
  width: 64px; height: 64px; flex: 0 0 auto; border-radius: var(--vz-r-md); overflow: hidden;
  background: var(--vz-surface); display: flex; align-items: center; justify-content: center;
  color: var(--vz-text-muted); font-weight: 500; font-size: 22px;
}
.vz-card-thumb img { width: 100%; height: 100%; object-fit: cover; }
.vz-card-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vz-card-title { font-size: 15.5px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
.vz-card-sub { font-size: 13.5px; color: var(--vz-text-muted); line-height: 1.4; }
/* Plain, clamped description (2 lines). */
.vz-card-desc { font-size: 13.5px; color: var(--vz-text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Price over duration at the end of a tile, shown only when the choices differ in it. */
.vz-card-trail { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; white-space: nowrap; font-size: 14px; }
.vz-card-trail .vz-price { font-weight: 500; }
.vz-trail-sub { font-size: 12.5px; color: var(--vz-text-muted); }
@media (max-width: 400px) {
  .vz-card { padding: 10px 12px; gap: 12px; }
  .vz-card.has-foot { padding: 0; gap: 0; }
  .vz-card-row { padding: 10px 12px; gap: 12px; }
  .vz-card-av { width: 46px; height: 46px; font-size: 17px; }
  .vz-card-thumb { width: 56px; height: 56px; font-size: 20px; }
}

/* ---- SERVICE ROWS ------------------------------------------------------ */
/* The app's BookingServiceRow: no frame and no fill, the name over its duration,
   the price on the right, then round controls. Only a row that is in the visit
   carries the accent outline on the tint; its variant and add-ons sit inside it.
   The negative side margin keeps the text on the step's left edge while the
   outline of a picked row stands outside it. */
.vz-svc-list { display: grid; gap: 4px; margin: 0 -10px; container-type: inline-size; }
.vz-svc {
  padding: 8px 10px; border: 2px solid transparent; border-radius: var(--vz-r-xl);
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-svc.selected { border-color: var(--vz-accent); background: var(--vz-selected); }
@media (hover: hover) {
  .vz-svc:not(.selected):has(.vz-svc-hit:hover) { background: color-mix(in srgb, var(--vz-fill) 60%, transparent); }
}
.vz-svc:not(.selected):has(.vz-svc-hit:active) { background: var(--vz-fill); }
.vz-svc-row { display: flex; align-items: center; gap: 12px; }
.vz-svc-hit {
  display: flex; align-items: center; gap: 12px; flex: 1 1 auto; min-width: 0; min-height: 44px;
  text-align: left; cursor: pointer; border-radius: var(--vz-r-md);
}
.vz-svc-hit:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 4px; }
.vz-svc-thumb {
  width: 56px; height: 56px; flex: 0 0 auto; border-radius: var(--vz-r-md); overflow: hidden;
  background: var(--vz-fill); display: flex; align-items: center; justify-content: center;
  color: var(--vz-text-muted); font-weight: 500; font-size: 20px;
}
.vz-svc.selected .vz-svc-thumb { background: var(--vz-surface); }
.vz-svc-thumb img { width: 100%; height: 100%; object-fit: cover; }
.vz-svc-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.vz-svc-name { font-size: 15.5px; font-weight: 500; line-height: 1.35; overflow-wrap: anywhere; }
/* One muted line of the description, only where the row is wide enough for it. */
.vz-svc-desc { display: none; font-size: 13.5px; line-height: 1.45; color: var(--vz-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@container (min-width: 520px) { .vz-svc-desc { display: block; } }
.vz-svc-meta { font-size: 13.5px; line-height: 1.45; color: var(--vz-text-muted); }
.vz-svc-notes { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 4px; }
.vz-svc-price { flex: 0 0 auto; font-size: 15.5px; font-weight: 500; white-space: nowrap; }
.vz-svc-ctrls { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
/* A round 40px control at the end of a service row; its ::after stretches the
   hit area to 44px. */
.vz-rowbtn {
  position: relative; flex: 0 0 auto; width: 40px; height: 40px; display: grid; place-items: center;
  border: 0; border-radius: 50%; padding: 0; cursor: pointer; color: var(--vz-text);
  background: var(--vz-fill); transition: transform var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-rowbtn::after { content: ""; position: absolute; inset: -2px; }
.vz-rowbtn:active { transform: scale(.94); }
.vz-rowbtn:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-rowbtn.edit { background: var(--vz-surface); color: var(--vz-text-muted); }
.vz-rowbtn.remove { background: var(--vz-surface); color: var(--vz-error); }
.vz-svc-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 0 2px; }
@media (max-width: 400px) {
  .vz-svc-row, .vz-svc-hit { gap: 10px; }
  .vz-svc-thumb { width: 48px; height: 48px; font-size: 18px; }
  .vz-svc-ctrls { gap: 6px; }
}

/* ---- SZCZEGÓŁY USŁUGI (galeria + pełny opis) --------------------------- */
/* Układ 1:1 z arkuszem "service/Details" na stronie: tytuł, poziomy pasek
   kwadratowych zdjęć, pełny opis, a na dole cena z czasem i akcja. */
.vz-det { display: flex; flex-direction: column; gap: 14px; }
.vz-det-title { margin: 0; font-size: 20px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
.vz-det-gal { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.vz-det-gal::-webkit-scrollbar { display: none; }
.vz-det-shot {
  flex: 0 0 auto; width: 112px; aspect-ratio: 1 / 1; padding: 0; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; border-radius: var(--vz-r-lg); background: var(--vz-fill);
  transition: transform var(--vz-dur-out), border-color var(--vz-dur-out);
}
.vz-det-shot:hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-det-shot:active { transform: scale(.98); }
.vz-det-shot:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-det-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vz-det-desc { margin: 0; font-size: 14px; line-height: 1.6; color: var(--vz-text-muted); overflow-wrap: anywhere; }
.vz-det-foot {
  display: flex; align-items: center; gap: 12px; margin-top: 2px;
  padding-top: 14px; border-top: 1px solid var(--vz-border);
}
.vz-det-foot-t { flex: 1 1 auto; min-width: 0; }
.vz-det-price { display: block; font-size: 18px; font-weight: 650; line-height: 1.2; }
.vz-det-dur { display: inline-flex; align-items: center; gap: 5px; margin-top: 2px; font-size: 13px; color: var(--vz-text-muted); }
/* Podwójna klasa nie z upodobania: .vz-btn stoi niżej w arkuszu i inaczej
   wygrywa swoje width:100% oraz margin-top. */
.vz-btn.vz-det-cta { flex: 0 1 auto; width: auto; margin-top: 0; padding: 13px 22px; white-space: nowrap; }

/* Powiększone zdjęcie. Pozycja fixed wystarczy: nakładka panelu niesie
   backdrop-filter, więc i tak jest blokiem zawierającym dla potomków fixed. */
.vz-lightbox {
  position: fixed; inset: 0; z-index: 2147483003;
  display: flex; align-items: center; justify-content: center; padding: 28px 16px;
  background: rgba(8,8,10,.94); animation: vz-fade var(--vz-dur-out) var(--vz-ease-out);
}
.vz-lb-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--vz-r-md); }
.vz-lb-btn {
  position: absolute; width: 40px; height: 40px; display: grid; place-items: center;
  border: 0; border-radius: 50%; background: rgba(255,255,255,.14); color: #fff;
  cursor: pointer; padding: 0; transition: background var(--vz-dur-out);
}
.vz-lb-btn:hover { background: rgba(255,255,255,.26); }
.vz-lb-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.vz-lb-btn.close { top: 12px; right: 12px; }
.vz-lb-btn.prev { top: 50%; left: 10px; transform: translateY(-50%); }
.vz-lb-btn.next { top: 50%; right: 10px; transform: translateY(-50%); }
.vz-lb-count { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,.8); font-size: 13px; }

.vz-card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; font-size: 13.5px; margin-top: 4px; }
/* Czas trwania jako plakietka na powierzchni, bez ramki. */
.vz-card-meta .vz-dur {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: var(--vz-r-pill);
  background: var(--vz-surface); color: var(--vz-text-muted); font-size: 12.5px;
}
.vz-card-meta .vz-price { font-weight: 500; }
/* A reference-price line takes its own row under the meta. */
.vz-card-meta .vz-lowest-price { flex: 1 0 100%; }
/* Discreet "Dla stałych klientów" chip on whitelist-locked services. Not an
   error - logging in may unlock the service, so it stays calm and selectable. */
.vz-lock-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: var(--vz-r-pill); border: 1px solid var(--vz-border); background: var(--vz-surface);
  color: var(--vz-text-muted); font-size: 11px; font-weight: 500; white-space: nowrap;
}
.vz-lock-chip.warning {
  color: var(--vz-warning); border-color: currentColor;
  background: color-mix(in srgb, var(--vz-warning) 10%, var(--vz-surface));
}
.vz-lock-chip svg { flex: 0 0 auto; }
/* The radio mark: an empty ring, or the accent ring with a surface core. */
.vz-radio {
  width: 24px; height: 24px; flex: 0 0 auto; border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--vz-text-muted) 40%, transparent);
  display: flex; align-items: center; justify-content: center; color: var(--vz-on-accent);
  transition: background var(--vz-dur-out), border-color var(--vz-dur-out), border-width var(--vz-dur-out);
}
.vz-radio.on { border: 7px solid var(--vz-accent); background: var(--vz-surface); }
.vz-radio.square.on { border-width: 2px; background: var(--vz-accent); }

.vz-radio.square { border-radius: 8px; }

/* ---- CART (multi-service) ---------------------------------------------- */
/* Plakietka wariantu/dodatku w obrysie wybranego wiersza. Tekst zostaje w kolorze
   treści na powierzchni: sam akcent bywa nadpisany przez osadzenie i na jasnym
   motywie potrafi zniknąć na własnym rozcieńczeniu. */
.vz-tag {
  display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
  border: 0; border-radius: var(--vz-r-pill); font-family: var(--vz-font);
  background: var(--vz-surface); color: var(--vz-text); font-size: 12px; font-weight: 500; line-height: 1.4;
}
.vz-tag-x { opacity: .7; font-variant-numeric: tabular-nums; }
.vz-tag.err { background: color-mix(in srgb, var(--vz-error) 16%, var(--vz-surface)); color: var(--vz-error); cursor: pointer; }
/* Nic jeszcze nie wybrano, choć jest z czego - zaproszenie zamiast pustki. */
.vz-chip-add {
  display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 5px;
  border: 0; border-radius: var(--vz-r-pill); font-family: var(--vz-font);
  background: var(--vz-surface);
  color: var(--vz-text); font-size: 12.5px; font-weight: 500; cursor: pointer;
  transition: background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-chip-add:hover { background: color-mix(in srgb, var(--vz-accent) 12%, var(--vz-surface)); }
.vz-chip-add:active { transform: scale(.97); }
.vz-chip-plus { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--vz-accent); color: var(--vz-on-accent); }
.vz-chip-add.err { background: color-mix(in srgb, var(--vz-error) 14%, var(--vz-surface)); color: var(--vz-error); }
.vz-chip-add.err .vz-chip-plus { background: var(--vz-error); color: #fff; }

/* Search over the offer - only rendered for longer service lists. A fill pill. */
.vz-search {
  display: flex; align-items: center; gap: 10px; margin: 0 0 12px;
  padding: 0 16px; border: 2px solid transparent; border-radius: var(--vz-r-pill);
  background: var(--vz-fill); transition: border-color var(--vz-dur-out);
}
.vz-search:focus-within { border-color: var(--vz-accent); }
.vz-search-ico { color: var(--vz-text-muted); display: flex; flex: 0 0 auto; }
.vz-search-input {
  flex: 1 1 auto; min-width: 0; padding: 11px 0; border: 0; background: none;
  color: var(--vz-text); font-family: inherit; font-size: 14px;
}
.vz-search-input:focus { outline: none; }
.vz-search-input::placeholder { color: var(--vz-text-muted); }
.vz-search-input::-webkit-search-cancel-button { -webkit-appearance: none; }

/* Who performs which position, when nobody covers the whole cart. */
.vz-perf { margin: 8px 0 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
.vz-perf li { font-size: 12px; line-height: 1.5; }

/* ---- PROVIDER ASSIGNMENTS (kto wykona którą usługę) --------------------- */
/* One row per cart position: the service, and a chip with its own answer that
   opens the list scoped to that service. */
.vz-assign { display: grid; gap: 10px; margin: 2px 0 2px; }
.vz-assign-row { padding: 14px 16px; border-radius: var(--vz-r-lg); background: var(--vz-fill); }
.vz-assign-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.vz-assign-name { font-size: 14px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.vz-assign-dur { flex: 0 0 auto; font-size: 12px; color: var(--vz-text-muted); }
.vz-assign-opts { margin-top: 10px; }
/* Tiles nested in a fill row stand on the surface, or they would vanish in it. */
.vz-assign-row .vz-card:not(.selected) { background: var(--vz-surface); }
.vz-assign-row .vz-card:not(.selected) .vz-card-av { background: var(--vz-fill); }

.vz-chip {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 10px;
  padding: 5px 12px 5px 5px; border: 2px solid transparent; border-radius: var(--vz-r-pill);
  background: var(--vz-surface); color: var(--vz-text); font-family: inherit; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-chip:not([disabled]):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-chip:not([disabled]):active { transform: scale(.98); }
.vz-chip[disabled] { cursor: default; opacity: .7; }
.vz-chip.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-chip-av {
  width: 28px; height: 28px; flex: 0 0 auto; border-radius: 50%; overflow: hidden;
  background: var(--vz-fill); color: var(--vz-text-muted);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;
}
.vz-chip-av img { width: 100%; height: 100%; object-fit: cover; }
.vz-chip-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vz-chip-cv { flex: 0 0 auto; color: var(--vz-text-muted); transition: transform var(--vz-dur-out); }
.vz-chip.on .vz-chip-cv, .vz-who-chip.on .vz-chip-cv { transform: rotate(180deg); }

/* Overlapping avatars of everybody pinned across the cart. */
.vz-avstack { display: inline-flex; align-items: center; flex: 0 0 auto; }
.vz-avstack .vz-card-av {
  width: 28px; height: 28px; font-size: 12px; border: 2px solid var(--vz-surface);
}
.vz-avstack .vz-card-av + .vz-card-av { margin-left: -10px; }

/* Who the hours belong to, above the calendar: a full-width fill field - avatars,
   a muted "Specjalista" over the name, a chevron to change it. */
.vz-who { margin-bottom: 18px; }
.vz-who-chip {
  display: flex; align-items: center; gap: 12px; width: 100%; min-height: 64px;
  padding: 10px 16px 10px 12px; border: 2px solid transparent; border-radius: var(--vz-r-xl);
  background: var(--vz-fill); color: var(--vz-text); font-family: inherit;
  cursor: pointer; text-align: left; transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-who-chip:not([disabled]):active { transform: scale(.99); }
.vz-who-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.vz-who-cap { font-size: 12.5px; font-weight: 400; line-height: 1.3; color: var(--vz-text-muted); }
@media (hover: hover) {
  .vz-who-chip:not([disabled]):not(.on):hover { border-color: color-mix(in srgb, var(--vz-accent) 40%, transparent); }
}
.vz-who-chip[disabled] { cursor: default; }
.vz-who-chip.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-who-chip:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-who-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 500; line-height: 1.35; }
.vz-who-chip .vz-avstack .vz-card-av { width: 40px; height: 40px; font-size: 15px; background: var(--vz-surface); border-color: var(--vz-fill); }
.vz-who-chip.on .vz-avstack .vz-card-av { border-color: var(--vz-selected); }
.vz-who-chip .vz-chip-cv { color: var(--vz-text-muted); }
.vz-who .vz-assign { margin-top: 10px; }

/* Chain plan under the picked slot ("10:00 Strzyżenie, 10:45 Broda"). */
.vz-chain { margin-top: 18px; padding: 14px 16px; border-radius: var(--vz-r-lg); background: var(--vz-fill); }
.vz-chain-h { font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--vz-text-muted); margin-bottom: 8px; }
.vz-chain-row { display: flex; align-items: baseline; gap: 10px; font-size: 13.5px; padding: 2px 0; }
.vz-chain-time { font-variant-numeric: tabular-nums; font-weight: 600; flex: 0 0 auto; }
.vz-chain-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vz-chain-dur { flex: 0 0 auto; font-size: 12px; color: var(--vz-text-muted); }
.vz-slotpick { display: flex; flex-wrap: wrap; gap: 8px; }
.vz-slotpick-b {
  padding: 8px 14px; border-radius: var(--vz-r-pill); border: 2px solid transparent;
  background: var(--vz-surface); color: var(--vz-text); font-family: inherit; font-size: 13px;
  font-weight: 500; cursor: pointer; transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
@media (hover: hover) {
  .vz-slotpick-b:not(.on):hover { border-color: color-mix(in srgb, var(--vz-accent) 40%, transparent); }
}
.vz-slotpick-b.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-slotpick-p { font-weight: 500; opacity: .8; }
.vz-chain-total { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vz-border); font-size: 12px; color: var(--vz-text-muted); }

/* ---- CONFIGURE (variants + add-ons) ------------------------------------ */
.vz-cfg-section { margin-bottom: 20px; }
.vz-cfg-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--vz-text-muted); }
.vz-cfg-hint { font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 12px; }
.vz-opt {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 13px 16px; border: 2px solid transparent; border-radius: var(--vz-r-lg);
  background: var(--vz-fill); color: var(--vz-text); cursor: pointer; font-family: var(--vz-font);
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-opt + .vz-opt { margin-top: 8px; }
.vz-opt:not([disabled]):not(.locked):not(.on):hover { border-color: color-mix(in srgb, var(--vz-accent) 40%, transparent); }
.vz-opt:not([disabled]):not(.locked):active { transform: scale(.99); }
.vz-opt.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-opt[disabled], .vz-opt.locked { opacity: .45; cursor: default; }
.vz-opt-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vz-opt-name { font-size: 14.5px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
.vz-opt-desc { font-size: 12px; color: var(--vz-text-muted); line-height: 1.4; }
.vz-opt-price { font-size: 13.5px; font-weight: 600; white-space: nowrap; }
.vz-opt-tick {
  width: 24px; height: 24px; flex: 0 0 auto; border: 2px solid color-mix(in srgb, var(--vz-text-muted) 40%, transparent);
  display: flex; align-items: center; justify-content: center; color: var(--vz-on-accent);
  transition: background var(--vz-dur-out), border-color var(--vz-dur-out);
}
.vz-opt-tick.round { border-radius: 50%; }
.vz-opt-tick.square { border-radius: 7px; }
.vz-opt-tick.on { background: var(--vz-accent); border-color: var(--vz-accent); }
/* One of a group is a radio: the accent ring with a surface core, like the option tiles. */
.vz-opt-tick.round.on { border: 7px solid var(--vz-accent); background: var(--vz-surface); }
.vz-opt-tick.round svg { display: none; }
.vz-cfg-total { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px; font-size: 15px; font-weight: 600; }

/* Configure recap chip on the selected service (in the CTA summary). */
.vz-cta-cfg { display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; }
.vz-cta-cfg .vz-link { font-size: 12px; }

/* ---- DATE: the month calendar ------------------------------------------ */
/* A whole month of round day cells on the fill, no frames, no week strip and no
   view tabs (ui/MonthCalendar). */
.vz-mon { display: flex; flex-direction: column; gap: 12px; }
.vz-mon-head { display: flex; align-items: center; gap: 8px; }
.vz-mon-title { flex: 1 1 auto; min-width: 0; font-size: 18px; font-weight: 600; line-height: 1.3; letter-spacing: -.01em; }
.vz-mon-nav {
  width: 44px; height: 44px; flex: 0 0 auto; display: grid; place-items: center; padding: 0;
  border: 0; border-radius: 50%; background: var(--vz-fill); color: var(--vz-text); cursor: pointer;
  transition: transform var(--vz-dur-out), color var(--vz-dur-out);
}
.vz-mon-nav:not([disabled]):active { transform: scale(.95); }
.vz-mon-nav[disabled] { color: color-mix(in srgb, var(--vz-text-muted) 40%, transparent); cursor: default; }
.vz-mon-nav:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-mon-dow { display: grid; grid-template-columns: repeat(7, 1fr); }
.vz-mon-dow span { text-align: center; font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--vz-text-muted); }
.vz-mon-grid { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 6px; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
/* Never wider than its column: on a 320px screen a seventh is under 44px. */
.vz-mday {
  position: relative; margin: 0 auto; width: 100%; max-width: 44px; aspect-ratio: 1 / 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  padding: 2px 0 0; border: 2px solid transparent; border-radius: 50%;
  background: var(--vz-fill); color: var(--vz-text); cursor: pointer;
  font-family: var(--vz-font); font-size: 14px; font-weight: 500; line-height: 1;
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
/* A day that cannot be picked is greyed by colour and loses its fill, never by
   opacity: a number at 30% of an unknown host colour is not legible. */
.vz-mday[disabled] { background: transparent; color: color-mix(in srgb, var(--vz-text-muted) 60%, transparent); cursor: default; }
@media (hover: hover) {
  .vz-mday:not([disabled]):not(.active):hover { border-color: color-mix(in srgb, var(--vz-accent) 50%, transparent); }
}
.vz-mday.active:not([disabled]) { border-color: var(--vz-accent); background: var(--vz-selected); }
/* A day that died under the customer's finger must not keep looking like a live choice. */
.vz-mday.active[disabled] { border-color: var(--vz-border); }
.vz-mday:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-mday-bar { display: flex; align-items: center; justify-content: center; height: 4px; }
.vz-mday-bar i { display: block; height: 4px; border-radius: 999px; }
.vz-mday-bar .high { width: 16px; background: var(--vz-avail-high); }
.vz-mday-bar .medium { width: 12px; background: var(--vz-avail-medium); }
.vz-mday-bar .low { width: 6px; background: var(--vz-avail-low); }
/* A promoted day: an accent dot on the cell's corner, ringed with the surface. */
.vz-mday-promo { position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--vz-surface); background: var(--vz-accent); }
.vz-mon .vz-promo-caption { margin-top: 0; }
/* The calendar as one question among several (rental: after the length pills). */
.vz-field.vz-cal-field { margin-top: 18px; gap: 10px; }
/* The picked day by name, with the number of its free starts. */
.vz-dayhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 22px; }
.vz-dayhead-t { min-width: 0; font-size: 15px; font-weight: 600; line-height: 1.35; }
.vz-dayhead-n { flex: 0 0 auto; font-size: 12.5px; color: var(--vz-text-muted); }

/* ---- SLOT GROUPS ------------------------------------------------------- */
/* Hour pills under "Rano / Popołudnie / Wieczór": four columns in a panel, more
   as the widget's container widens (an inline embed in a wide column). */
.vz-slot-group { margin-top: 18px; container-type: inline-size; }
.vz-slot-group-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--vz-text-muted); font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; }
/* Presets picked before the calendar (czas wynajmu, liczba osób). Wrapping row
   of compact fill pills. */
.vz-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.vz-pill {
  appearance: none; cursor: pointer; font: inherit; font-size: 13.5px; font-weight: 500;
  min-height: 40px; padding: 8px 14px; border-radius: 999px; color: var(--vz-text);
  background: var(--vz-fill); border: 2px solid transparent;
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-pill small { font-weight: 400; color: var(--vz-text-muted); }
@media (hover: hover) {
  .vz-pill:not(.on):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
}
.vz-pill:active { transform: scale(.98); }
.vz-pill.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-pill.on small { color: var(--vz-text); }
/* "Dłużej" opens the rest of the durations - a way in, not an answer, so it
   never carries the selected state the real options compete for. */
.vz-pill-more { background: transparent; border: 2px dashed var(--vz-border); color: var(--vz-text-muted); }
.vz-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@container (min-width: 520px) { .vz-slots { grid-template-columns: repeat(6, 1fr); } }
@container (min-width: 760px) { .vz-slots { grid-template-columns: repeat(8, 1fr); } }
.vz-slot {
  position: relative; display: flex; align-items: center; justify-content: center; height: 48px; padding: 0;
  border: 2px solid transparent; border-radius: var(--vz-r-pill);
  background: var(--vz-fill); color: var(--vz-text); cursor: pointer; font-family: var(--vz-font);
  font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; text-align: center;
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
@media (hover: hover) {
  .vz-slot:not([disabled]):not(.selected):hover { border-color: color-mix(in srgb, var(--vz-accent) 50%, transparent); }
}
.vz-slot:not([disabled]):active { transform: scale(.97); }
.vz-slot.selected { border-color: var(--vz-accent); background: var(--vz-selected); }
/* A start without a table for this party (#903): shown, muted and struck through,
   not tappable - never dimmed by opacity. */
.vz-slot[disabled] { background: var(--vz-surface-2); color: var(--vz-text-muted); text-decoration: line-through; cursor: not-allowed; }
/* "ostatnie wejście 21:00" at the right end of a period header; a long
   period name ellipsizes instead of pushing it past the card edge. */
.vz-slot-group-h .vz-slot-group-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vz-slot-group-h .vz-slot-group-aside { flex: 0 0 auto; margin-left: auto; text-transform: none; letter-spacing: 0; font-size: 12.5px; font-weight: 400; }
/* Stacked preset rows (Dorośli / Dzieci / Strefa). */
.vz-stack { display: grid; gap: 18px; }
/* A grid with a promoted slot: room above the first row and between rows for
   the corner badges. */
.vz-slots.has-promo { padding-top: 10px; row-gap: 16px; }

/* ---- STICKY CTA BAR ---------------------------------------------------- */
.vz-cta { flex: 0 0 auto; border-top: 1px solid var(--vz-border); background: var(--vz-surface); padding: 12px 16px 14px; }
.vz-cta-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.vz-cta-left { min-width: 0; }
.vz-cta-svc { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-cta-meta { font-size: 12.5px; color: var(--vz-text-muted); margin-top: 1px; }
.vz-cta-meta b { color: var(--vz-text); font-weight: 600; }
.vz-cta-who { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.vz-cta-who span { font-size: 13px; font-weight: 500; }
.vz-cta-who .vz-card-av { width: 34px; height: 34px; font-size: 14px; background: var(--vz-fill); }

/* ---- STEP HEADING (auth sub-steps) ------------------------------------- */
.vz-h { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
.vz-h h2 { font-size: inherit; font-weight: inherit; margin: 0; outline: none; }

/* ---- SUMMARY CARD ------------------------------------------------------ */
/* One fill card of label / value rows divided by hairlines (the app's BookingSummaryCard). */
.vz-summary {
  border-radius: var(--vz-r-xl); background: var(--vz-fill);
  padding: 0 16px; margin-bottom: 18px; font-size: 14px;
}
.vz-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 14px 0; }
.vz-row + .vz-row { border-top: 1px solid var(--vz-border); }
.vz-row > span:first-child { color: var(--vz-text-muted); }
.vz-row > span:last-child { font-weight: 500; text-align: right; }
.vz-row.total > span { font-weight: 600; font-size: 15px; color: var(--vz-text); }

/* ---- PROMOTIONS -------------------------------------------------------- */
/* Promotion badge in the .vz-chip idiom: text in the body colour, the brand only
   as a background (hosts override the accent with anything). Always in flow,
   never pinned over another label, never below 12px. */
.vz-promo-badge {
  display: inline-flex; align-items: center; width: max-content; max-width: 100%;
  padding: 2px 8px; border-radius: var(--vz-r-pill);
  background: color-mix(in srgb, var(--vz-accent) 20%, var(--vz-surface));
  color: var(--vz-text); font-family: var(--vz-font); font-size: 12px; font-weight: 500; line-height: 1.4;
  letter-spacing: 0; text-transform: none; white-space: nowrap;
}
/* The reference-price line: helper text like .vz-opt-desc. */
.vz-lowest-price { display: block; color: var(--vz-text-muted); font-size: 12px; font-weight: 400; line-height: 1.4; letter-spacing: 0; text-transform: none; }
.vz-promo-value { display: inline-flex; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; gap: 0 6px; }
.vz-price-before { color: var(--vz-text-muted); font-weight: 400; text-decoration: line-through; }
/* A price row carrying a promotion: value + badge on the right, note under the row. */
.vz-row-promo { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 4px 8px; }
.vz-row.has-note { flex-wrap: wrap; row-gap: 4px; }
.vz-row.has-note > span:nth-child(2) { text-align: right; }
.vz-row-note { flex: 1 0 100%; }
.vz-quote { border-top: 1px solid var(--vz-border); }
.vz-quote.first { border-top: 0; }
.vz-quote-head { display: flex; align-items: center; gap: 8px; padding-top: 14px; font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--vz-text-muted); }
.vz-quote-note { margin-top: -4px; padding-bottom: 10px; }
/* Day and time tiles (owner's mockup): the badge sits on the tile's top-right
   edge, straddling the border, opaque so the border does not run through it.
   It grows leftwards and never truncates the value. */
.vz-promo-badge.corner {
  position: absolute; top: -9px; right: 6px; z-index: 1; max-width: none; pointer-events: none;
  padding: 0 6px; line-height: 16px;
  background: color-mix(in srgb, var(--vz-accent) 15%, var(--vz-surface));
  border: 1px solid color-mix(in srgb, var(--vz-accent) 35%, var(--vz-surface));
  color: var(--vz-text); font-size: 12px; font-weight: 500; letter-spacing: 0;
}
/* The caption under the month grid names the corner dot of a promoted day. */
.vz-promo-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--vz-accent); }
.vz-promo-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; color: var(--vz-text-muted); line-height: 1.4; }
/* An add-on's promotion under its helper lines. */
.vz-opt-promo { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 4px; }
/* Promotion of the chosen rental length, under the pills. */
/* Session list: the day's common value in the header, the price in .vz-price weight. */
.vz-slot-group-promo { margin-left: -2px; letter-spacing: 0; text-transform: none; color: var(--vz-text); }
.vz-session-note { margin: -4px 0 10px; }
/* A worker's own promotion: a band across the specialist card's foot (owner's
   mockup) - accent hairline on top, an accent tint a step stronger than the
   selected card's wash, a tag icon, the headline in 500, when it applies plain
   on its own line, the note and the reference price in 12px. Text stays in the
   body colours. */
.vz-staff-band {
  display: flex; align-items: flex-start; gap: 10px; padding: 11px 16px 12px;
  border-top: 1px solid color-mix(in srgb, var(--vz-accent) 25%, var(--vz-surface));
  background: color-mix(in srgb, var(--vz-accent) 12%, var(--vz-surface));
  color: var(--vz-text); font-size: 13.5px; line-height: 1.4;
}
.vz-card.selected .vz-staff-band { background: color-mix(in srgb, var(--vz-accent) 20%, var(--vz-surface)); }
.vz-staff-band-icon { flex: 0 0 auto; margin-top: 2px; color: var(--vz-accent); }
.vz-staff-band-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.vz-staff-band-entry, .vz-staff-band-text { display: flex; flex-direction: column; gap: 2px; }
.vz-staff-band-line { font-weight: 500; }
.vz-staff-band-note { font-size: 12px; color: color-mix(in srgb, var(--vz-text-muted) 70%, var(--vz-text)); }
@media (max-width: 400px) {
  .vz-staff-band { padding: 10px 13px 11px; }
}

/* ---- FIELDS / INPUTS --------------------------------------------------- */
.vz-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.vz-field { display: flex; flex-direction: column; gap: 6px; position: relative; }
.vz-field.full { grid-column: 1 / -1; }
.vz-label { font-size: 12px; font-weight: 500; color: var(--vz-text-muted); padding-left: 2px; }
.vz-input {
  width: 100%; padding: 13px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md);
  font-family: var(--vz-font); font-size: 16px; outline: 0; color: var(--vz-text); background: var(--vz-input-bg);
  transition: border-color var(--vz-dur-out), box-shadow var(--vz-dur-out);
}
.vz-input::placeholder { color: var(--vz-text-muted); opacity: .7; }
.vz-input:focus { border-color: var(--vz-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vz-accent) 22%, transparent); }
.vz-input.invalid { border-color: var(--vz-error); }
.vz-field-err { font-size: 11.5px; color: var(--vz-error); padding-left: 2px; }

/* ---- INPUT ICON + PHONE (country code) --------------------------------- */
.vz-input-wrap { position: relative; }
.vz-input-wrap.has-icon .vz-input { padding-right: 42px; }
.vz-input-icon { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); display: flex; color: var(--vz-text-muted); pointer-events: none; }

.vz-phone { display: flex; align-items: stretch; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md); background: var(--vz-input-bg); overflow: hidden; transition: border-color var(--vz-dur-out), box-shadow var(--vz-dur-out); }
.vz-phone:focus-within { border-color: var(--vz-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vz-accent) 22%, transparent); }
.vz-phone.invalid { border-color: var(--vz-error); }
.vz-phone-cc { display: flex; align-items: center; gap: 6px; padding: 0 9px 0 13px; border: 0; border-right: 1.5px solid var(--vz-border); background: transparent; color: var(--vz-text); font-family: var(--vz-font); font-size: 15px; cursor: pointer; transition: background var(--vz-dur-out); }
.vz-phone-cc:hover { background: var(--vz-surface-2); }
.vz-flag { font-size: 18px; line-height: 1; }
.vz-dial { font-weight: 500; font-variant-numeric: tabular-nums; }
.vz-cc-caret { display: flex; color: var(--vz-text-muted); transform: rotate(90deg); transition: transform var(--vz-dur-out); }
.vz-cc-caret.up { transform: rotate(-90deg); }
.vz-phone-num { flex: 1; min-width: 0; padding: 13px; border: 0; outline: 0; background: transparent; color: var(--vz-text); font-family: var(--vz-font); font-size: 16px; }
.vz-phone-num::placeholder { color: var(--vz-text-muted); opacity: .7; }

.vz-cc-pop { position: absolute; z-index: 50; left: 0; right: 0; top: calc(100% + 6px); background: var(--vz-surface); border: 1px solid var(--vz-border); border-radius: var(--vz-r-md); box-shadow: var(--vz-shadow-modal); overflow: hidden; animation: vz-fade var(--vz-dur-out) var(--vz-ease-out); }
.vz-cc-pop.up { top: auto; bottom: calc(100% + 6px); }
.vz-cc-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--vz-border); color: var(--vz-text-muted); }
.vz-cc-search-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--vz-text); font-family: var(--vz-font); font-size: 14px; }
.vz-cc-search-input::placeholder { color: var(--vz-text-muted); opacity: .8; }
.vz-cc-list { max-height: 240px; overflow-y: auto; padding: 6px; }
.vz-cc-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: var(--vz-r-sm); background: transparent; color: var(--vz-text); font-family: var(--vz-font); font-size: 14px; text-align: left; cursor: pointer; }
.vz-cc-item:hover { background: var(--vz-surface-2); }
.vz-cc-item.on { background: var(--vz-selected); }
.vz-cc-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vz-cc-dial { color: var(--vz-text-muted); font-variant-numeric: tabular-nums; }
.vz-cc-empty { padding: 16px; text-align: center; color: var(--vz-text-muted); font-size: 13px; }

/* ---- OTP INPUT --------------------------------------------------------- */
.vz-otp-wrap { position: relative; display: flex; justify-content: center; margin: 8px 0 4px; }
.vz-otp-input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; background: transparent; font-size: 16px; letter-spacing: 1em; text-align: center; caret-color: transparent; cursor: text; }
.vz-otp-boxes { display: flex; justify-content: center; gap: 8px; width: 100%; pointer-events: none; }
/* Six digits since vizyto#309: boxes shrink on narrow embeds instead of overflowing. */
.vz-otp-box {
  flex: 0 1 52px; min-width: 0; height: 60px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md);
  display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 600;
  background: var(--vz-input-bg); color: var(--vz-text); transition: border-color var(--vz-dur-out), box-shadow var(--vz-dur-out);
}
.vz-otp-box.filled { border-color: var(--vz-accent); }
.vz-otp-box.cursor { border-color: var(--vz-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vz-accent) 22%, transparent); }
.vz-otp-wrap.invalid .vz-otp-box { border-color: var(--vz-error); }

/* ---- BUTTONS ----------------------------------------------------------- */
.vz-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
  padding: 15px 22px; border: 0; border-radius: var(--vz-r-pill); background: var(--vz-accent);
  color: var(--vz-on-accent); font-family: var(--vz-font); font-size: 16px; font-weight: 600;
  cursor: pointer; transition: transform var(--vz-dur-out), filter var(--vz-dur-out); margin-top: 16px;
}
.vz-cta .vz-btn { margin-top: 0; }
.vz-btn.mt { margin-top: 18px; }
a.vz-btn { text-decoration: none; }
.vz-btn:hover { filter: brightness(1.05); }
.vz-btn:active { transform: scale(.985); }
.vz-btn[disabled] { opacity: .5; cursor: default; filter: none; }
.vz-btn.ghost { background: transparent; color: var(--vz-text); border: 1.5px solid var(--vz-border); margin-top: 10px; }
.vz-btn.ghost:hover { background: var(--vz-surface-2); filter: none; }
.vz-link { background: 0; border: 0; padding: 0; color: var(--vz-accent); font-family: var(--vz-font); font-size: 13.5px; font-weight: 500; cursor: pointer; text-decoration: none; }
.vz-link:hover { color: var(--vz-accent-strong); }
.vz-link[disabled] { color: var(--vz-text-muted); cursor: default; }
.vz-or { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: var(--vz-text-muted); font-size: 12px; }
.vz-or::before, .vz-or::after { content: ""; flex: 1; height: 1px; background: var(--vz-border); }

.vz-vizyto-card { margin: 0 0 16px; padding: 15px 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--vz-accent) 13%, var(--vz-surface)), color-mix(in srgb, var(--vz-accent) 5%, var(--vz-surface))); border: 1px solid color-mix(in srgb, var(--vz-accent) 26%, var(--vz-border)); border-radius: var(--vz-r-md); }
.vz-vizyto-brand { display: flex; margin-bottom: 10px; }
.vz-vizyto-brand svg { display: block; }
.vz-vizyto-title { font-family: var(--vz-font); font-size: 14px; font-weight: 600; color: var(--vz-text); line-height: 1.25; margin-bottom: 13px; }
.vz-vizyto-perks { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 8px; }
.vz-vizyto-perks li { display: flex; align-items: center; gap: 9px; font-family: var(--vz-font); font-size: 12.5px; color: var(--vz-text); line-height: 1.35; }
.vz-vizyto-tick { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: none; border-radius: 50%; background: color-mix(in srgb, var(--vz-accent) 18%, var(--vz-surface)); color: var(--vz-accent); }
.vz-vizyto-cta { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; padding: 10px 14px; background: var(--vz-surface); color: var(--vz-accent); border: 1px solid color-mix(in srgb, var(--vz-accent) 45%, var(--vz-border)); border-radius: var(--vz-r-sm); font-family: var(--vz-font); font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background .15s var(--vz-ease-out), border-color .15s var(--vz-ease-out), box-shadow .15s var(--vz-ease-out); }
.vz-vizyto-cta:hover { background: color-mix(in srgb, var(--vz-accent) 10%, var(--vz-surface)); border-color: var(--vz-accent); box-shadow: 0 2px 10px color-mix(in srgb, var(--vz-accent) 16%, transparent); }
.vz-vizyto-cta svg { color: currentColor; }

.vz-oauth-list { display: grid; gap: 10px; }
.vz-oauth {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
  padding: 12px 14px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md);
  background: var(--vz-surface); color: var(--vz-text); font-family: var(--vz-font);
  font-size: 14.5px; font-weight: 500; cursor: pointer;
  transition: background var(--vz-dur-out), border-color var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-oauth:hover { background: var(--vz-surface-2); }
a.vz-oauth { text-decoration: none; }
.vz-oauth:active { transform: scale(.99); }
.vz-oauth[disabled] { opacity: .55; cursor: default; }
.vz-oauth .vz-spin { width: 16px; height: 16px; border-top-color: var(--vz-text); }

/* ---- HELPERS ----------------------------------------------------------- */
.vz-note { font-size: 11.5px; color: var(--vz-text-muted); margin-top: 12px; line-height: 1.5; text-align: center; }
.vz-err { color: var(--vz-error); font-size: 13px; margin-top: 14px; padding: 11px 13px; border-radius: var(--vz-r-md); background: color-mix(in srgb, var(--vz-error) 10%, var(--vz-surface)); }
.vz-muted { color: var(--vz-text-muted); font-size: 13.5px; }
.vz-lead { color: var(--vz-text-muted); font-size: 13.5px; margin: 0 0 16px; line-height: 1.55; }
.vz-hint { font-size: 12.5px; color: var(--vz-text-muted); text-align: center; margin-top: 14px; }
.vz-hint b { color: var(--vz-text); font-weight: 500; }
.vz-spin { width: 18px; height: 18px; border: 2px solid color-mix(in srgb, var(--vz-text-muted) 35%, transparent); border-top-color: var(--vz-accent); border-radius: 50%; animation: vz-rot .7s linear infinite; flex: 0 0 auto; }
.vz-btn .vz-spin { border-color: color-mix(in srgb, var(--vz-on-accent) 45%, transparent); border-top-color: var(--vz-on-accent); }
@keyframes vz-rot { to { transform: rotate(360deg) } }
.vz-center { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px 0; color: var(--vz-text-muted); font-size: 14px; }

/* ---- DONE -------------------------------------------------------------- */
.vz-done { text-align: center; padding: 10px 0 4px; }
.vz-check { width: 64px; height: 64px; border-radius: 50%; margin: 4px auto 16px; background: color-mix(in srgb, var(--vz-success) 16%, var(--vz-surface)); color: var(--vz-success); display: flex; align-items: center; justify-content: center; animation: vz-pop-check 360ms var(--vz-ease-out); }
.vz-check svg { width: 32px; height: 32px; }
/* Warning-tinted variant (access-restricted screens). */
.vz-check.warn { background: color-mix(in srgb, var(--vz-warning) 14%, var(--vz-surface)); color: var(--vz-warning); }
.vz-check.warn svg { width: 28px; height: 28px; }
/* The closed-channel state (#680): a business decision, not a warning. */
.vz-check.calm { background: var(--vz-surface-2); color: var(--vz-text-muted); animation: none; }
.vz-check.calm svg { width: 28px; height: 28px; }
@keyframes vz-pop-check { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.vz-done-title { font-size: 22px; font-weight: 600; }
.vz-done-sub { color: var(--vz-text-muted); font-size: 13.5px; margin-top: 6px; line-height: 1.5; }

/* ---- ENTER ANIMATION --------------------------------------------------- */
.vz-fade-in { animation: vz-step-in var(--vz-dur-in) var(--vz-ease-out); }
@keyframes vz-step-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.vz-stagger > * { animation: vz-step-in var(--vz-dur-in) var(--vz-ease-out) backwards; }

/* ---- MOBILE BOTTOM SHEET ----------------------------------------------- */
@media (max-width: 560px) {
  .vz-overlay { padding: 0; align-items: flex-end; }
  .vz-panel { max-width: none; max-height: 94vh; border-radius: 28px 28px 0 0; border-bottom: 0; animation: vz-sheet-up var(--vz-dur-in) var(--vz-ease-out); }
  @keyframes vz-sheet-up { from { transform: translateY(100%) } to { transform: none } }
  .vz-grab { display: block; }
  /* An inline embed sits inside a page, not at the screen's bottom edge: it stays a closed card. */
  .vz-inline .vz-panel { max-height: none; border-radius: 28px; border-bottom: 1px solid var(--vz-border); animation: none; }
  .vz-inline .vz-grab { display: none; }
}
.vz-grab { display: none; width: 38px; height: 4px; border-radius: 999px; background: var(--vz-border); margin: 8px auto 0; }

/* ---- CATEGORY TABS ----------------------------------------------------- */
.vz-cats { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 0 14px; padding-bottom: 2px; }
.vz-cats::-webkit-scrollbar { display: none; }
/* The app's FilterChip: a 36px outlined pill, the pressed one in the accent on its tint. */
.vz-cats { gap: 8px; margin: 0 0 16px; }
.vz-cat { flex: 0 0 auto; height: 36px; padding: 0 14px; border-radius: var(--vz-r-pill); border: 1px solid var(--vz-border); background: var(--vz-surface); color: var(--vz-text); font-family: inherit; font-size: 14px; font-weight: 400; cursor: pointer; white-space: nowrap; transition: background var(--vz-dur-out), color var(--vz-dur-out), border-color var(--vz-dur-out), transform var(--vz-dur-out); }
.vz-cat:active { transform: scale(.97); }
.vz-cat:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
@media (hover: hover) { .vz-cat:not(.on):hover { background: var(--vz-surface-2); } }
.vz-cat.on { background: color-mix(in srgb, var(--vz-accent) 6%, var(--vz-surface)); color: var(--vz-accent-strong); border-color: var(--vz-accent); }

/* ---- TEST-MODE NOTICE -------------------------------------------------- */
.vz-notice { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 16px; padding: 12px 14px; border-radius: var(--vz-r-md); background: color-mix(in srgb, var(--vz-warning) 12%, var(--vz-surface)); border: 1px solid color-mix(in srgb, var(--vz-warning) 34%, var(--vz-border)); }
.vz-notice-ico { color: var(--vz-warning); flex: 0 0 auto; margin-top: 1px; display: flex; }
.vz-notice-title { font-size: 13px; font-weight: 600; color: var(--vz-text); }
.vz-notice-body { font-size: 12px; color: var(--vz-text-muted); margin-top: 3px; line-height: 1.5; }
/* Neutral variant: booking terms are not a warning. */
.vz-notice.plain { background: var(--vz-fill); border-color: transparent; }
.vz-notice.plain .vz-notice-ico { color: var(--vz-text-muted); }
/* Business-authored text: plain, so its own line breaks are all the formatting. */
.vz-notice-pre { white-space: pre-line; overflow-wrap: anywhere; }
.vz-terms { display: grid; gap: 10px; margin-top: 16px; }
.vz-terms .vz-notice { margin: 0; }

/* ---- NOTES TEXTAREA ---------------------------------------------------- */
.vz-notes { display: block; margin-top: 14px; }
.vz-notes-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--vz-text-muted); margin-bottom: 6px; }
.vz-textarea { width: 100%; resize: vertical; min-height: 72px; padding: 11px 13px; border-radius: var(--vz-r-md); border: 1.5px solid var(--vz-border); background: var(--vz-input-bg); color: var(--vz-text); font-family: inherit; font-size: 14px; line-height: 1.5; }
.vz-textarea:focus { outline: none; border-color: var(--vz-accent); }
.vz-textarea::placeholder { color: var(--vz-text-muted); }

/* ---- WAITLIST FORM ----------------------------------------------------- */
.vz-wl-label { font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--vz-text-muted); margin-bottom: 8px; }
.vz-wl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.vz-wl-opt { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; text-align: left; border-radius: var(--vz-r-lg); border: 2px solid transparent; background: var(--vz-fill); color: var(--vz-text); font-family: inherit; cursor: pointer; transition: background var(--vz-dur-out), border-color var(--vz-dur-out); }
.vz-wl-opt:not(.on):hover { border-color: color-mix(in srgb, var(--vz-accent) 40%, transparent); }
.vz-wl-opt.on { background: var(--vz-selected); border-color: var(--vz-accent); }
.vz-wl-opt-t { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; }
.vz-wl-opt-t svg { color: var(--vz-accent); }
.vz-wl-opt-s { font-size: 11.5px; color: var(--vz-text-muted); }
.vz-wl-link { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; margin-top: 20px; padding: 11px; border: 0; border-top: 1px solid var(--vz-border); background: transparent; color: var(--vz-text-muted); font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: color var(--vz-dur-out); }
.vz-wl-link:hover { color: var(--vz-accent); }
.vz-wl-link svg { color: var(--vz-accent); }

/* ---- LOYALTY (#471 F37) ------------------------------------------------ */
/* Screen-reader only: the chosen reward's price, announced after the tap. */
.vz-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.vz-rw { display: grid; gap: 16px; }
.vz-rw-opt { display: grid; gap: 8px; }
.vz-rw-price { flex: 1 0 100%; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--vz-text); }
.vz-card.is-disabled .vz-rw-price { color: inherit; }
.vz-rw-notes { flex: 1 0 100%; display: grid; gap: 2px; font-size: 12.5px; color: var(--vz-text-muted); line-height: 1.45; }
/* A price still on its way: a quiet bar, never a fake number. */
.vz-skel { display: inline-block; width: 56px; height: 12px; border-radius: var(--vz-r-pill); background: color-mix(in srgb, var(--vz-text) 12%, var(--vz-surface-2)); vertical-align: middle; animation: vz-skel 1.1s var(--vz-ease-out) infinite alternate; }
@keyframes vz-skel { from { opacity: .45 } to { opacity: 1 } }
.vz-rw-fail { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 0 4px; font-size: 13px; color: var(--vz-text); }
.vz-rw-section { display: grid; gap: 10px; }
.vz-rw-h { font-size: 14px; font-weight: 600; }
.vz-rw-err { margin-top: 0; }
.vz-rw-claim { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: var(--vz-r-xl); background: var(--vz-fill); }
.vz-rw-claim-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.vz-mini-btn { flex: 0 0 auto; padding: 8px 16px; border-radius: var(--vz-r-pill); border: 1.5px solid var(--vz-accent); background: var(--vz-surface); color: var(--vz-text); font-family: var(--vz-font); font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background var(--vz-dur-out), transform var(--vz-dur-out); }
.vz-mini-btn:hover { background: var(--vz-selected); }
.vz-mini-btn:active { transform: scale(.97); }
.vz-mini-btn:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-mini-btn[disabled] { opacity: .5; cursor: default; transform: none; }
.vz-rw-confirm { padding: 16px; border-radius: var(--vz-r-xl); border: 2px solid var(--vz-accent); background: var(--vz-selected); }
.vz-rw-confirm .vz-summary { margin: 12px 0 0; background: var(--vz-surface); }
.vz-rw-confirm-title { outline: none; }
.vz-rw-blocked { display: grid; gap: 8px; }
.vz-rw-bname { font-size: 14px; font-weight: 600; }
.vz-rw-brow { display: grid; gap: 3px; padding: 12px 16px; border-radius: var(--vz-r-lg); background: var(--vz-fill); font-size: 13.5px; }
.vz-rw-brow-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.vz-rw-badge { flex: 0 0 auto; padding: 2px 8px; border-radius: var(--vz-r-pill); border: 1px solid var(--vz-border); background: var(--vz-surface-2); color: var(--vz-text-muted); font-size: 12px; font-weight: 500; line-height: 1.4; white-space: nowrap; }
.vz-lp { display: grid; gap: 10px; margin-top: 2px; }
.vz-lp-h { font-size: 15px; font-weight: 600; }
.vz-lp-intro { margin: 0; font-size: 13.5px; color: var(--vz-text-muted); line-height: 1.55; }
.vz-lp-muted { margin: 0; font-size: 12.5px; color: var(--vz-text-muted); line-height: 1.5; }
.vz-lp-progress { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.vz-lp-progress li { padding: 4px 11px; border-radius: var(--vz-r-pill); border: 1px solid var(--vz-border); background: var(--vz-surface-2); font-size: 12.5px; font-weight: 500; color: var(--vz-text); }
.vz-lp-rules { margin: 0; display: grid; gap: 10px; }
.vz-lp-rule dt { font-size: 13px; font-weight: 600; color: var(--vz-text); }
.vz-lp-rule dd { margin: 2px 0 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.vz-lp-value { flex: 0 0 auto; color: var(--vz-text); font-weight: 600; }
/* Collapsed sections on the native disclosure. */
.vz-details { border-radius: var(--vz-r-lg); background: var(--vz-fill); }
.vz-details > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; font-size: 13.5px; font-weight: 600; color: var(--vz-text); cursor: pointer; border-radius: var(--vz-r-lg); }
.vz-details > summary::-webkit-details-marker { display: none; }
.vz-details > summary:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-details > summary svg { flex: 0 0 auto; color: var(--vz-text-muted); transition: transform var(--vz-dur-out) var(--vz-ease-out); }
.vz-details[open] > summary svg { transform: rotate(180deg); }
.vz-details-body { display: grid; gap: 10px; padding: 0 16px 16px; font-size: 13px; color: var(--vz-text-muted); line-height: 1.5; }
.vz-details-body p { margin: 0; }
.vz-details-body .vz-details { background: var(--vz-surface); }

/* ---- REDUCED MOTION ---------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .vz-root *, .vz-root *::before, .vz-root *::after {
    animation-duration: .001ms !important; animation-delay: 0ms !important; transition-duration: .001ms !important;
  }
}
`
