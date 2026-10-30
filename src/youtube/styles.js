  function addStyles() {
    if (document.querySelector(`style[data-${SCRIPT_PREFIX}]`)) return;
    const style = document.createElement("style");
    style.setAttribute(`data-${SCRIPT_PREFIX}`, "");
    style.textContent = `${COMMON_STYLES}
      .${SCRIPT_PREFIX}__host { position:absolute !important; inset:0 !important; z-index:65 !important; pointer-events:none !important; font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif !important; color:#fff !important; text-align:start !important; }
      .${SCRIPT_PREFIX}__host [hidden] { display:none !important; }
      .${SCRIPT_PREFIX}__toolbar { position:absolute !important; bottom:12px !important; right:12px !important; left:12px !important; display:flex !important; align-items:center !important; justify-content:flex-end !important; flex-wrap:wrap !important; gap:6px !important; pointer-events:none !important; transition:opacity 180ms ease-out !important; }
      @media (max-width: 600px) { .${SCRIPT_PREFIX}__toolbar { top:8px !important; right:48px !important; bottom:auto !important; } }
      .ytp-autohide .${SCRIPT_PREFIX}__host[data-idle=true] .${SCRIPT_PREFIX}__toolbar, .${SCRIPT_PREFIX}__host[data-autohide=true][data-idle=true] .${SCRIPT_PREFIX}__toolbar { opacity:0 !important; }
      .ytp-autohide .${SCRIPT_PREFIX}__host[data-idle=true] .${SCRIPT_PREFIX}__toolbar *, .${SCRIPT_PREFIX}__host[data-autohide=true][data-idle=true] .${SCRIPT_PREFIX}__toolbar * { pointer-events:none !important; }
      .${SCRIPT_PREFIX}__toolbar button, .${SCRIPT_PREFIX}__preferences button, .${SCRIPT_PREFIX}__trigger { appearance:none !important; box-sizing:border-box !important; min-width:44px !important; min-height:44px !important; margin:0 !important; padding:10px !important; border:1px solid #ffffff40 !important; border-radius:6px !important; background:#161618df !important; color:#fff !important; font:inherit !important; line-height:22px !important; cursor:pointer !important; pointer-events:auto !important; touch-action:manipulation !important; }
      .${SCRIPT_PREFIX}__trigger { display:inline-flex !important; align-items:center !important; justify-content:center !important; vertical-align:top !important; }
      .${SCRIPT_PREFIX}__trigger[data-docked=control] { width:48px !important; height:100% !important; padding:0 !important; border:0 !important; border-radius:0 !important; background:transparent !important; }
      .${SCRIPT_PREFIX}__badge { display:inline-flex !important; align-items:center !important; justify-content:center !important; min-width:24px !important; height:20px !important; padding:0 5px !important; border:1.5px solid #fff !important; border-radius:3px !important; box-sizing:border-box !important; background:#161618cc !important; color:#fff !important; font:700 12px/1 -apple-system,BlinkMacSystemFont,sans-serif !important; }
      .${SCRIPT_PREFIX}__trigger[data-active=true] .${SCRIPT_PREFIX}__badge { background:#fff !important; color:#0f0f0f !important; box-shadow:0 3px 0 #ff0033 !important; }
      .${SCRIPT_PREFIX}__toolbar button:focus-visible, .${SCRIPT_PREFIX}__preferences button:focus-visible, .${SCRIPT_PREFIX}__trigger:focus-visible, .${SCRIPT_PREFIX}__preferences input:focus-visible { outline:2px solid #a8c7ff !important; outline-offset:2px !important; }
      .${SCRIPT_PREFIX}__toolbar button[aria-pressed=true], .${SCRIPT_PREFIX}__preferences button[aria-pressed=true] { background:#315b9bdd !important; }
      .${SCRIPT_PREFIX}__preferences { position:absolute !important; bottom:var(--pref-offset,58px) !important; right:var(--pref-right,12px) !important; width:236px !important; padding:12px !important; background:#161618f5 !important; border:1px solid #ffffff40 !important; border-radius:8px !important; pointer-events:auto !important; z-index:70 !important; }
      .${SCRIPT_PREFIX}__preferences[data-placement=top] { top:var(--pref-offset,52px) !important; bottom:auto !important; }
      .${SCRIPT_PREFIX}__preferences > button { width:100% !important; margin-bottom:4px !important; }
      .${SCRIPT_PREFIX}__actions { display:flex !important; gap:6px !important; margin-top:6px !important; }
      .${SCRIPT_PREFIX}__actions > button { flex:1 !important; }
      .${SCRIPT_PREFIX}__preferences label { display:flex !important; align-items:center !important; justify-content:space-between !important; min-height:44px !important; gap:12px !important; color:#fff !important; font:inherit !important; }
      .${SCRIPT_PREFIX}__preferences input { width:90px !important; min-height:28px !important; accent-color:#a8c7ff !important; }
      .${SCRIPT_PREFIX}__preferences input[type=checkbox] { width:24px !important; }
      .${SCRIPT_PREFIX}__status { max-width:min(90%, 520px) !important; padding:6px 8px !important; border-radius:4px !important; background:#161618cc !important; font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif !important; white-space:pre-wrap !important; overflow-wrap:anywhere !important; }
      .${SCRIPT_PREFIX}__status:empty { display:none !important; }
      .${SCRIPT_PREFIX}__status[data-error=true] { color:#ffb4ab !important; max-height:140px !important; overflow:auto !important; pointer-events:auto !important; }
      .${SCRIPT_PREFIX}__captions { position:absolute !important; bottom:max(calc(var(--subtitle-bottom,0%) + 8px),var(--subtitle-controls-bottom,0px)) !important; left:4% !important; right:4% !important; width:92% !important; margin:auto !important; text-align:center !important; font:500 var(--subtitle-size,22px)/1.4 -apple-system,BlinkMacSystemFont,sans-serif !important; white-space:pre-wrap !important; overflow-wrap:anywhere !important; text-shadow:0 1px 3px #000 !important; }
      .${SCRIPT_PREFIX}__captions > div { width:fit-content !important; max-width:100% !important; box-sizing:border-box !important; margin:2px auto !important; padding:3px 8px !important; border-radius:4px !important; background:#000c !important; color:#fff !important; }
      .${SCRIPT_PREFIX}__captions > div:empty { display:none !important; }
      .${SCRIPT_PREFIX}__captions > .${SCRIPT_PREFIX}__translation { color:#ffedab !important; }
      .${SCRIPT_PREFIX}__active .ytp-caption-window-container { visibility:hidden !important; }
      .${SCRIPT_PREFIX}__expanded { position:fixed !important; inset:0 !important; width:100vw !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; z-index:2147483646 !important; background:#000 !important; }
      .${SCRIPT_PREFIX}__expanded video { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; object-fit:contain !important; }
    `;
    document.documentElement.append(style);
  }
