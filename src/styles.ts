// All styling lives inside the widget's Shadow DOM, so host-page CSS can never
// touch it and these class names can never collide. Themeable via --vz-accent.
export const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.vz-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; --vz-accent: #fd9320; -webkit-font-smoothing: antialiased; }

.vz-launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 8px; padding: 14px 20px; border: 0; border-radius: 999px; background: var(--vz-accent); color: #161616; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 30px rgba(0,0,0,.28); transition: transform .15s ease, filter .15s ease; }
.vz-launcher:hover { transform: translateY(-1px); filter: brightness(1.04); }
.vz-launcher:active { transform: scale(.97); }

.vz-overlay { position: fixed; inset: 0; z-index: 2147483001; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(10,10,12,.55); backdrop-filter: blur(4px); animation: vz-fade .2s ease; }
@keyframes vz-fade { from { opacity: 0 } to { opacity: 1 } }

.vz-panel { position: relative; width: 100%; max-width: 520px; max-height: min(92vh, 760px); overflow-y: auto; background: #fff; color: #1a1a1a; border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: vz-pop .25s cubic-bezier(.22,1,.36,1); }
@keyframes vz-pop { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: none } }
.vz-inline { position: relative; }
.vz-inline .vz-panel { box-shadow: none; border: 1px solid #ececec; max-width: none; animation: none; max-height: none; }

.vz-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid #f0f0f0; position: sticky; top: 0; background: #fff; z-index: 2; }
.vz-title { font-size: 15px; font-weight: 600; }
.vz-sub { font-size: 12.5px; color: #8a8a8a; margin-top: 2px; }
.vz-close { border: 0; background: #f3f3f3; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #555; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; }
.vz-close:hover { background: #ececec; }

.vz-body { padding: 20px; }

.vz-steps { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
.vz-step { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #c2c2c2; }
.vz-step.active { color: #1a1a1a; }
.vz-step.done { color: var(--vz-accent); }
.vz-dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.vz-step.active .vz-dot { border-color: var(--vz-accent); color: var(--vz-accent); }
.vz-step.done .vz-dot { background: var(--vz-accent); border-color: var(--vz-accent); color: #161616; }
.vz-sep { width: 12px; height: 1px; background: #eee; }

.vz-h { font-size: 19px; font-weight: 600; margin: 0 0 14px; display: flex; align-items: center; }
.vz-back { border: 0; background: #f3f3f3; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; margin-right: 10px; color: #555; font-size: 16px; }
.vz-back:hover { background: #ececec; }

.vz-list { display: grid; gap: 8px; }
.vz-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; padding: 14px; border: 1px solid #ececec; border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .15s; font-size: 14px; }
.vz-opt:hover { border-color: var(--vz-accent); }
.vz-opt-name { font-weight: 500; }
.vz-opt-meta { color: #9a9a9a; font-size: 12.5px; margin-top: 2px; }
.vz-opt-price { font-weight: 600; white-space: nowrap; }

.vz-grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.vz-worker { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 8px; border: 1px solid #ececec; border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .15s; }
.vz-worker:hover { border-color: var(--vz-accent); }
.vz-av { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; background: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #aaa; font-weight: 600; overflow: hidden; }
.vz-av img { width: 100%; height: 100%; object-fit: cover; }
.vz-wn { font-size: 13px; font-weight: 500; text-align: center; }
.vz-wp { font-size: 11px; color: #9a9a9a; text-align: center; }

.vz-days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; }
.vz-day { flex: 0 0 auto; min-width: 60px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 8px; border: 1px solid #ececec; border-radius: 11px; background: #fff; cursor: pointer; font-size: 13px; color: #1a1a1a; }
.vz-day[disabled] { opacity: .4; cursor: default; }
.vz-day.active { border-color: var(--vz-accent); background: color-mix(in srgb, var(--vz-accent) 12%, #fff); }
.vz-day small { font-size: 10px; text-transform: uppercase; color: #9a9a9a; }
.vz-free { width: 6px; height: 6px; border-radius: 50%; background: #27c08a; margin-top: 3px; }

.vz-slots { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-top: 16px; }
.vz-slot { padding: 10px 0; border: 1px solid #ececec; border-radius: 9px; background: #fff; cursor: pointer; font-size: 13.5px; text-align: center; color: #1a1a1a; }
.vz-slot:hover { border-color: var(--vz-accent); }

.vz-summary { border: 1px solid #ececec; border-radius: 12px; padding: 14px; margin-bottom: 16px; font-size: 13.5px; }
.vz-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; }
.vz-row + .vz-row { border-top: 1px solid #f3f3f3; }
.vz-row span:first-child { color: #9a9a9a; }

.vz-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.vz-input { width: 100%; padding: 11px 12px; border: 1px solid #e2e2e2; border-radius: 10px; font-size: 14px; outline: 0; color: #1a1a1a; background: #fff; }
.vz-input:focus { border-color: var(--vz-accent); }
.vz-input.full { grid-column: 1 / -1; }

.vz-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px 18px; border: 0; border-radius: 999px; background: var(--vz-accent); color: #161616; font-size: 15px; font-weight: 600; cursor: pointer; transition: transform .12s, filter .15s; margin-top: 16px; }
.vz-btn:hover { filter: brightness(1.04); }
.vz-btn:active { transform: scale(.985); }
.vz-btn[disabled] { opacity: .45; cursor: default; }
.vz-note { font-size: 11.5px; color: #a3a3a3; margin-top: 10px; }
.vz-err { color: #d23b3b; font-size: 13px; margin-top: 12px; }
.vz-muted { color: #9a9a9a; font-size: 13.5px; }

.vz-spin { width: 18px; height: 18px; border: 2px solid #e6e6e6; border-top-color: var(--vz-accent); border-radius: 50%; animation: vz-rot .7s linear infinite; }
@keyframes vz-rot { to { transform: rotate(360deg) } }
.vz-center { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 44px 0; color: #9a9a9a; font-size: 14px; }

.vz-done { text-align: center; padding: 14px 0; }
.vz-check { width: 54px; height: 54px; border-radius: 50%; background: color-mix(in srgb, #27c08a 16%, #fff); display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; color: #27c08a; font-size: 28px; }
.vz-powered { text-align: center; font-size: 11px; color: #bcbcbc; padding: 12px 0 16px; }
.vz-powered b { color: #8a8a8a; font-weight: 600; }

@media (max-width: 560px) {
  .vz-overlay { padding: 0; align-items: flex-end; }
  .vz-panel { max-width: none; max-height: 94vh; border-radius: 18px 18px 0 0; }
  .vz-slots { grid-template-columns: repeat(3,1fr); }
}
`
