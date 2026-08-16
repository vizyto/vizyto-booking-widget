// All styling lives inside the widget's Shadow DOM, so host-page CSS can never
// touch it and these class names can never collide. Two themes (light/dark) are
// expressed as a CSS custom-property token layer on .vz-root; index.ts flips
// .vz-root[data-theme="dark"]. Tokens + chrome mirror the real Vizyto app
// (segmented stepper, radio cards, sticky "Dalej" bar). Accent (--vz-accent)
// and font (--vz-font) stay overridable from the embed.
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
  --vz-border: #e8e8ea;
  --vz-text: #18181b;
  --vz-text-muted: #8a8a93;
  --vz-input-bg: #ffffff;
  --vz-ring: #a3a3a3;
  --vz-selected: color-mix(in srgb, var(--vz-accent) 11%, var(--vz-surface));

  --vz-r-sm: 8px;
  --vz-r-md: 12px;
  --vz-r-lg: 16px;
  --vz-r-xl: 20px;
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
  border: 1px solid var(--vz-border); border-radius: 22px;
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

/* ---- SELECT CARDS (radio) ---------------------------------------------- */
.vz-list { display: grid; gap: 10px; }
.vz-card {
  display: flex; align-items: center; gap: 14px; text-align: left; width: 100%;
  padding: 16px; border: 1.5px solid transparent; border-radius: var(--vz-r-xl);
  background: var(--vz-surface-2); color: var(--vz-text); cursor: pointer;
  font-family: var(--vz-font); transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-card:hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
/* Karta jest divem z rolą (nosi własny przycisk "Szczegóły"), więc obrys
   fokusu trzeba narysować samemu - przeglądarka nie da go za darmo. */
.vz-card:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }
.vz-card:active { transform: scale(.99); }
.vz-card.selected { background: var(--vz-selected); border-color: var(--vz-accent); }
.vz-card-av {
  width: 56px; height: 56px; flex: 0 0 auto; border-radius: 50%; overflow: hidden;
  background: var(--vz-surface); display: flex; align-items: center; justify-content: center;
  color: var(--vz-text-muted); font-weight: 600; font-size: 20px;
}
.vz-card-av img { width: 100%; height: 100%; object-fit: cover; }
.vz-card.selected .vz-card-av { background: color-mix(in srgb, var(--vz-accent) 18%, var(--vz-surface)); color: var(--vz-accent); }
/* Rounded-square service photo (or letter placeholder), aligned with avatars. */
.vz-card-thumb {
  width: 56px; height: 56px; flex: 0 0 auto; border-radius: var(--vz-r-md); overflow: hidden;
  background: var(--vz-surface); display: flex; align-items: center; justify-content: center;
  color: var(--vz-text-muted); font-weight: 600; font-size: 20px;
}
.vz-card-thumb img { width: 100%; height: 100%; object-fit: cover; }
.vz-card.selected .vz-card-thumb { background: color-mix(in srgb, var(--vz-accent) 18%, var(--vz-surface)); color: var(--vz-accent); }
.vz-card-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.vz-card-title { font-size: 16px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.vz-card-sub { font-size: 13px; color: var(--vz-text-muted); }
/* Plain, clamped service description (2 lines). */
.vz-card-desc { font-size: 12.5px; color: var(--vz-text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* "i" na karcie usługi - wejście w szczegóły (galeria + pełny opis). Dyskretne,
   bo wybór usługi zostaje główną akcją karty. */
.vz-card-info {
  flex: 0 0 auto; width: 32px; height: 32px; display: grid; place-items: center;
  border: 1px solid var(--vz-border); border-radius: 50%; background: var(--vz-surface);
  color: var(--vz-text-muted); cursor: pointer; padding: 0;
  transition: color var(--vz-dur-out), border-color var(--vz-dur-out);
}
.vz-card-info:hover { color: var(--vz-accent); border-color: var(--vz-accent); }
.vz-card-info:focus-visible { outline: 2px solid var(--vz-accent); outline-offset: 2px; }

/* ---- SZCZEGÓŁY USŁUGI (galeria + pełny opis) --------------------------- */
.vz-det { display: flex; flex-direction: column; gap: 14px; }
.vz-det-gallery { display: flex; flex-direction: column; gap: 8px; }
.vz-det-photo {
  width: 100%; aspect-ratio: 16 / 10; border-radius: var(--vz-r-xl); overflow: hidden;
  background: var(--vz-surface-2);
}
.vz-det-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vz-det-thumbs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.vz-det-thumb {
  flex: 0 0 auto; width: 56px; height: 56px; padding: 0; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; border-radius: var(--vz-r-md); background: var(--vz-surface-2);
}
.vz-det-thumb.on { border-color: var(--vz-accent); }
.vz-det-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vz-det-title { margin: 0; font-size: 19px; font-weight: 650; line-height: 1.25; }
.vz-det-meta { display: flex; align-items: center; gap: 12px; font-size: 14px; margin-top: -6px; }
.vz-det-desc { margin: 0; font-size: 14px; line-height: 1.6; color: var(--vz-text-muted); overflow-wrap: anywhere; }
.vz-det-cta { margin-top: 4px; }
.vz-card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; font-size: 13.5px; margin-top: 2px; }
.vz-card-meta .vz-dur { color: var(--vz-text-muted); display: inline-flex; align-items: center; gap: 4px; }
.vz-card-meta .vz-price { font-weight: 600; }
/* Discreet "Dla stałych klientów" chip on whitelist-locked services. Not an
   error - logging in may unlock the service, so it stays calm and selectable. */
.vz-lock-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: var(--vz-r-pill); border: 1px solid var(--vz-border); background: var(--vz-surface);
  color: var(--vz-text-muted); font-size: 11px; font-weight: 500; white-space: nowrap;
}
.vz-lock-chip svg { flex: 0 0 auto; }
.vz-radio {
  width: 26px; height: 26px; flex: 0 0 auto; border-radius: 50%; border: 2px solid var(--vz-border);
  display: flex; align-items: center; justify-content: center; color: var(--vz-on-accent);
  transition: background var(--vz-dur-out), border-color var(--vz-dur-out);
}
.vz-radio.on { background: var(--vz-accent); border-color: var(--vz-accent); }

.vz-radio.square { border-radius: 8px; }

/* ---- CART (multi-service) ---------------------------------------------- */
/* A cart row is the service card plus, when the position is configured, a small
   recap line tucked under it - so the list stays scannable while still showing
   what each position actually is. */
.vz-cart-row { display: flex; flex-direction: column; }
.vz-cart-recap {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
  margin: -2px 0 0; padding: 7px 14px 9px 14px;
  border: 1.5px solid var(--vz-accent); border-top: 0;
  border-radius: 0 0 var(--vz-r-md) var(--vz-r-md);
  background: var(--vz-selected);
  font-size: 12.5px; color: var(--vz-text-muted);
}
.vz-cart-recap-t { flex: 1 1 auto; min-width: 0; }
/* The card above a recap must not keep its own rounded bottom. */
.vz-cart-row:has(.vz-cart-recap) .vz-card { border-radius: var(--vz-r-md) var(--vz-r-md) 0 0; }

/* Search over the offer - only rendered for longer service lists. */
.vz-search {
  display: flex; align-items: center; gap: 8px; margin: 0 0 12px;
  padding: 0 12px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md);
  background: var(--vz-input-bg);
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
.vz-assign-row { padding: 12px 14px; border: 1px solid var(--vz-border); border-radius: var(--vz-r-md); background: var(--vz-surface); }
.vz-assign-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.vz-assign-name { font-size: 14px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.vz-assign-dur { flex: 0 0 auto; font-size: 12px; color: var(--vz-text-muted); }
.vz-assign-opts { margin-top: 10px; }

.vz-chip {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 10px;
  padding: 5px 12px 5px 5px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-pill);
  background: var(--vz-surface); color: var(--vz-text); font-family: inherit; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-chip:not([disabled]):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-chip:not([disabled]):active { transform: scale(.98); }
.vz-chip[disabled] { cursor: default; opacity: .7; }
.vz-chip.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-chip-av {
  width: 28px; height: 28px; flex: 0 0 auto; border-radius: 50%; overflow: hidden;
  background: var(--vz-surface-2); color: var(--vz-text-muted);
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

/* Summary chip above the calendar - who the hours belong to. */
.vz-who { margin-bottom: 14px; }
.vz-who-chip {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 12px 7px 7px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-pill);
  background: var(--vz-surface); color: var(--vz-text); font-family: inherit; font-size: 13.5px; font-weight: 500;
  cursor: pointer; text-align: left; transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-who-chip:not([disabled]):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-who-chip[disabled] { cursor: default; }
.vz-who-chip.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-who-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vz-who .vz-assign { margin-top: 10px; }

/* Chain plan under the picked slot ("10:00 Strzyżenie, 10:45 Broda"). */
.vz-chain { margin-top: 18px; padding: 12px 14px; border-radius: var(--vz-r-md); background: var(--vz-selected); border: 1px solid color-mix(in srgb, var(--vz-accent) 30%, var(--vz-border)); }
.vz-chain-h { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--vz-text-muted); margin-bottom: 8px; }
.vz-chain-row { display: flex; align-items: baseline; gap: 10px; font-size: 13.5px; padding: 2px 0; }
.vz-chain-time { font-variant-numeric: tabular-nums; font-weight: 600; flex: 0 0 auto; }
.vz-chain-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vz-chain-dur { flex: 0 0 auto; font-size: 12px; color: var(--vz-text-muted); }
/* A card with a recap glued to it must not scale away from it while pressed. */
.vz-cart-row:has(.vz-cart-recap) .vz-card:active { transform: none; }

.vz-slotpick { display: flex; flex-wrap: wrap; gap: 8px; }
.vz-slotpick-b {
  padding: 8px 12px; border-radius: var(--vz-r-pill); border: 1.5px solid var(--vz-border);
  background: var(--vz-surface); color: var(--vz-text); font-family: inherit; font-size: 13px;
  font-weight: 600; cursor: pointer; transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-slotpick-b:hover { border-color: var(--vz-accent); }
.vz-slotpick-b.on { border-color: var(--vz-accent); background: var(--vz-selected); color: var(--vz-accent); }
.vz-slotpick-p { font-weight: 500; opacity: .8; }
.vz-chain-total { margin-top: 8px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--vz-accent) 22%, var(--vz-border)); font-size: 12px; color: var(--vz-text-muted); }

/* ---- CONFIGURE (variants + add-ons) ------------------------------------ */
.vz-cfg-section { margin-bottom: 20px; }
.vz-cfg-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; font-size: 12.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--vz-text-muted); }
.vz-cfg-hint { font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 12px; }
.vz-opt {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 13px 14px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md);
  background: var(--vz-surface-2); color: var(--vz-text); cursor: pointer; font-family: var(--vz-font);
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-opt + .vz-opt { margin-top: 8px; }
.vz-opt:not([disabled]):not(.locked):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-opt:not([disabled]):not(.locked):active { transform: scale(.99); }
.vz-opt.on { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-opt[disabled], .vz-opt.locked { opacity: .45; cursor: default; }
.vz-opt-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vz-opt-name { font-size: 14.5px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.vz-opt-desc { font-size: 12px; color: var(--vz-text-muted); line-height: 1.4; }
.vz-opt-price { font-size: 13.5px; font-weight: 600; white-space: nowrap; }
.vz-opt-tick {
  width: 24px; height: 24px; flex: 0 0 auto; border: 2px solid var(--vz-border);
  display: flex; align-items: center; justify-content: center; color: var(--vz-on-accent);
  transition: background var(--vz-dur-out), border-color var(--vz-dur-out);
}
.vz-opt-tick.round { border-radius: 50%; }
.vz-opt-tick.square { border-radius: 7px; }
.vz-opt-tick.on { background: var(--vz-accent); border-color: var(--vz-accent); }
.vz-cfg-total { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px; font-size: 15px; font-weight: 600; }

/* Configure recap chip on the selected service (in the CTA summary). */
.vz-cta-cfg { display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; }
.vz-cta-cfg .vz-link { font-size: 12px; }

/* ---- DATE: calendar head + days --------------------------------------- */
.vz-cal-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.vz-cal-month {
  flex: 1 1 auto; display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 14px; border-radius: var(--vz-r-md); background: var(--vz-surface-2);
  font-size: 14px; font-weight: 600; color: var(--vz-text);
}
.vz-cal-nav {
  width: 40px; height: 40px; flex: 0 0 auto; border: 1px solid var(--vz-border); background: var(--vz-surface);
  border-radius: var(--vz-r-md); cursor: pointer; color: var(--vz-text);
  display: flex; align-items: center; justify-content: center; transition: background var(--vz-dur-out), opacity var(--vz-dur-out);
}
.vz-cal-nav:hover { background: var(--vz-surface-2); }
.vz-cal-nav[disabled] { opacity: .35; cursor: default; }

.vz-toggle { display: flex; gap: 6px; padding: 4px; background: var(--vz-surface-2); border-radius: var(--vz-r-md); margin-bottom: 16px; }
.vz-toggle button {
  flex: 1 1 0; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 9px; border: 0; border-radius: var(--vz-r-sm); background: transparent; cursor: pointer;
  font-family: var(--vz-font); font-size: 13.5px; font-weight: 600; color: var(--vz-text-muted);
  transition: background var(--vz-dur-out), color var(--vz-dur-out);
}
.vz-toggle button.on { background: var(--vz-surface); color: var(--vz-text); box-shadow: 0 1px 2px rgba(0,0,0,.06); }

.vz-days { display: flex; gap: 8px; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.vz-day {
  flex: 1 1 0; min-width: 0; max-width: 96px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px 10px; border: 1.5px solid transparent; border-radius: var(--vz-r-md);
  background: var(--vz-surface-2); color: var(--vz-text); cursor: pointer; font-family: var(--vz-font);
  font-size: 18px; font-weight: 600; transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-day.is-disabled { opacity: .38; cursor: default; }
.vz-day:not(.is-disabled):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-day.active { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-day small { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; color: var(--vz-text-muted); }
.vz-day .vz-free { width: 7px; height: 7px; border-radius: 50%; background: var(--vz-success); }
.vz-day .vz-free.ghost { background: transparent; }

/* month grid */
.vz-month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.vz-month-dow { text-align: center; font-size: 10.5px; font-weight: 600; color: var(--vz-text-muted); text-transform: uppercase; padding-bottom: 2px; }
.vz-mcell {
  aspect-ratio: 1 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  border: 1.5px solid transparent; border-radius: var(--vz-r-sm); background: var(--vz-surface-2);
  color: var(--vz-text); cursor: pointer; font-family: var(--vz-font); font-size: 14px; font-weight: 600;
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-mcell.empty { background: transparent; cursor: default; }
.vz-mcell[disabled] { opacity: .32; cursor: default; }
.vz-mcell:not([disabled]):not(.empty):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-mcell.active { border-color: var(--vz-accent); background: var(--vz-selected); }
.vz-mcell .vz-free { width: 5px; height: 5px; border-radius: 50%; background: var(--vz-success); }

/* ---- SLOT GROUPS ------------------------------------------------------- */
.vz-slot-group { margin-top: 20px; }
.vz-slot-group-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--vz-text-muted); font-size: 12.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.vz-slot-group-h svg { color: var(--vz-accent); }
.vz-slots { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.vz-slot {
  padding: 13px 0; border: 1.5px solid transparent; border-radius: var(--vz-r-md);
  background: var(--vz-surface-2); color: var(--vz-text); cursor: pointer; font-family: var(--vz-font);
  font-size: 15px; font-weight: 600; text-align: center;
  transition: border-color var(--vz-dur-out), background var(--vz-dur-out), transform var(--vz-dur-out);
}
.vz-slot:hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-slot:active { transform: scale(.97); }
.vz-slot.selected { border-color: var(--vz-accent); background: var(--vz-selected); }

/* ---- STICKY CTA BAR ---------------------------------------------------- */
.vz-cta { flex: 0 0 auto; border-top: 1px solid var(--vz-border); background: var(--vz-surface); padding: 12px 16px 14px; }
.vz-cta-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.vz-cta-left { min-width: 0; }
.vz-cta-svc { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-cta-meta { font-size: 12.5px; color: var(--vz-text-muted); margin-top: 1px; }
.vz-cta-meta b { color: var(--vz-text); font-weight: 600; }
.vz-cta-who { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.vz-cta-who span { font-size: 13px; font-weight: 500; }
.vz-cta-who .vz-card-av { width: 34px; height: 34px; font-size: 14px; }

/* ---- STEP HEADING (auth sub-steps) ------------------------------------- */
.vz-h { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
.vz-h h2 { font-size: inherit; font-weight: inherit; margin: 0; outline: none; }

/* ---- SUMMARY CARD ------------------------------------------------------ */
.vz-summary {
  border: 1px solid var(--vz-border); border-radius: var(--vz-r-lg); background: var(--vz-surface-2);
  padding: 6px 16px; margin-bottom: 18px; font-size: 13.5px;
}
.vz-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; }
.vz-row + .vz-row { border-top: 1px solid var(--vz-border); }
.vz-row > span:first-child { color: var(--vz-text-muted); }
.vz-row > span:last-child { font-weight: 500; text-align: right; }
.vz-row.total > span { font-weight: 600; font-size: 15px; }

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
.vz-otp-boxes { display: flex; gap: 10px; pointer-events: none; }
.vz-otp-box {
  width: 56px; height: 64px; border: 1.5px solid var(--vz-border); border-radius: var(--vz-r-md);
  display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 600;
  background: var(--vz-input-bg); color: var(--vz-text); transition: border-color var(--vz-dur-out), box-shadow var(--vz-dur-out);
}
.vz-otp-box.filled { border-color: var(--vz-accent); }
.vz-otp-box.cursor { border-color: var(--vz-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vz-accent) 22%, transparent); }
.vz-otp-wrap.invalid .vz-otp-box { border-color: var(--vz-error); }

/* ---- BUTTONS ----------------------------------------------------------- */
.vz-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
  padding: 15px 18px; border: 0; border-radius: var(--vz-r-md); background: var(--vz-accent);
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
  .vz-panel { max-width: none; max-height: 94vh; border-radius: 24px 24px 0 0; border-bottom: 0; animation: vz-sheet-up var(--vz-dur-in) var(--vz-ease-out); }
  @keyframes vz-sheet-up { from { transform: translateY(100%) } to { transform: none } }
  .vz-grab { display: block; }
}
.vz-grab { display: none; width: 38px; height: 4px; border-radius: 999px; background: var(--vz-border); margin: 8px auto 0; }

/* ---- CATEGORY TABS ----------------------------------------------------- */
.vz-cats { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 0 14px; padding-bottom: 2px; }
.vz-cats::-webkit-scrollbar { display: none; }
.vz-cat { flex: 0 0 auto; padding: 7px 13px; border-radius: var(--vz-r-pill); border: 1px solid var(--vz-border); background: var(--vz-surface); color: var(--vz-text-muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background var(--vz-dur-out), color var(--vz-dur-out), border-color var(--vz-dur-out); }
.vz-cat:hover { color: var(--vz-text); }
.vz-cat.on { background: var(--vz-selected); color: var(--vz-accent); border-color: var(--vz-accent); }

/* ---- TEST-MODE NOTICE -------------------------------------------------- */
.vz-notice { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 16px; padding: 12px 14px; border-radius: var(--vz-r-md); background: color-mix(in srgb, var(--vz-warning) 12%, var(--vz-surface)); border: 1px solid color-mix(in srgb, var(--vz-warning) 34%, var(--vz-border)); }
.vz-notice-ico { color: var(--vz-warning); flex: 0 0 auto; margin-top: 1px; display: flex; }
.vz-notice-title { font-size: 13px; font-weight: 600; color: var(--vz-text); }
.vz-notice-body { font-size: 12px; color: var(--vz-text-muted); margin-top: 3px; line-height: 1.5; }
/* Neutral variant: booking terms are not a warning. */
.vz-notice.plain { background: var(--vz-surface-2); border-color: var(--vz-border); }
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
.vz-wl-label { font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--vz-text-muted); margin-bottom: 8px; }
.vz-wl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.vz-wl-opt { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; text-align: left; border-radius: var(--vz-r-md); border: 1.5px solid var(--vz-border); background: var(--vz-surface); color: var(--vz-text); font-family: inherit; cursor: pointer; transition: background var(--vz-dur-out), border-color var(--vz-dur-out); }
.vz-wl-opt:hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
.vz-wl-opt.on { background: var(--vz-selected); border-color: var(--vz-accent); }
.vz-wl-opt-t { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; }
.vz-wl-opt.on .vz-wl-opt-t { color: var(--vz-accent); }
.vz-wl-opt-t svg { color: var(--vz-accent); }
.vz-wl-opt-s { font-size: 11.5px; color: var(--vz-text-muted); }
.vz-wl-link { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; margin-top: 20px; padding: 11px; border: 0; border-top: 1px solid var(--vz-border); background: transparent; color: var(--vz-text-muted); font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: color var(--vz-dur-out); }
.vz-wl-link:hover { color: var(--vz-accent); }
.vz-wl-link svg { color: var(--vz-accent); }

/* ---- REDUCED MOTION ---------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .vz-root *, .vz-root *::before, .vz-root *::after {
    animation-duration: .001ms !important; animation-delay: 0ms !important; transition-duration: .001ms !important;
  }
}
`
