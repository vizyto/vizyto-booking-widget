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
  text-align: center; font-size: 11px; color: var(--vz-text-muted);
  padding: 11px 0; border-top: 1px solid var(--vz-border); flex: 0 0 auto;
  background: var(--vz-surface);
}
.vz-powered a { color: var(--vz-text); font-weight: 600; text-decoration: none; }
.vz-powered a:hover { color: var(--vz-accent); }

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
.vz-card:active { transform: scale(.99); }
.vz-card.selected { background: var(--vz-selected); border-color: var(--vz-accent); }
.vz-card-av {
  width: 56px; height: 56px; flex: 0 0 auto; border-radius: 50%; overflow: hidden;
  background: var(--vz-surface); display: flex; align-items: center; justify-content: center;
  color: var(--vz-text-muted); font-weight: 600; font-size: 20px;
}
.vz-card-av img { width: 100%; height: 100%; object-fit: cover; }
.vz-card.selected .vz-card-av { background: color-mix(in srgb, var(--vz-accent) 18%, var(--vz-surface)); color: var(--vz-accent); }
.vz-card-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.vz-card-title { font-size: 16px; font-weight: 600; line-height: 1.25; }
.vz-card-sub { font-size: 13px; color: var(--vz-text-muted); }
.vz-card-meta { display: flex; align-items: center; gap: 8px; font-size: 13.5px; margin-top: 2px; }
.vz-card-meta .vz-dur { color: var(--vz-text-muted); display: inline-flex; align-items: center; gap: 4px; }
.vz-card-meta .vz-price { font-weight: 600; }
.vz-radio {
  width: 26px; height: 26px; flex: 0 0 auto; border-radius: 50%; border: 2px solid var(--vz-border);
  display: flex; align-items: center; justify-content: center; color: var(--vz-on-accent);
  transition: background var(--vz-dur-out), border-color var(--vz-dur-out);
}
.vz-radio.on { background: var(--vz-accent); border-color: var(--vz-accent); }

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

.vz-days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.vz-day {
  flex: 0 0 auto; min-width: 66px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px 10px; border: 1.5px solid transparent; border-radius: var(--vz-r-md);
  background: var(--vz-surface-2); color: var(--vz-text); cursor: pointer; font-family: var(--vz-font);
  font-size: 18px; font-weight: 600; transition: border-color var(--vz-dur-out), background var(--vz-dur-out);
}
.vz-day[disabled] { opacity: .38; cursor: default; }
.vz-day:not([disabled]):hover { border-color: color-mix(in srgb, var(--vz-accent) 45%, transparent); }
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
.vz-field { display: flex; flex-direction: column; gap: 6px; }
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

/* ---- REDUCED MOTION ---------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .vz-root *, .vz-root *::before, .vz-root *::after {
    animation-duration: .001ms !important; animation-delay: 0ms !important; transition-duration: .001ms !important;
  }
}
`
