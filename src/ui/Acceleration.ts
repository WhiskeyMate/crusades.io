// The game is drawn by the graphics card. A browser with hardware acceleration
// turned off draws it on the processor instead, which is many times slower.
// This notices, and tells the player how to turn it back on.

const DISMISSED = "crusades.accel.dismissed";

/** Names a browser gives the renderer when it is drawing in software. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

type Verdict = "fine" | "software" | "none";

/** What is drawing: the graphics card's name as the browser gives it. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  } catch {
    return "";
  }
}

function probe(gl: WebGLRenderingContext | WebGL2RenderingContext | null): Verdict {
  if (!gl) return "none";
  return SOFTWARE.test(rendererName(gl)) ? "software" : "fine";
}

/** Where the setting is, in the browser being used. A page may not link to settings, so it is spelled out. */
function directions(): string {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua))
    return "Open <b>Settings</b>, find <b>Performance</b> under General, untick “Use recommended performance settings” and tick <b>Use hardware acceleration when available</b>. Then restart Firefox.";
  if (/Edg\//.test(ua))
    return "Paste <code>edge://settings/system</code> into the address bar and turn on <b>Use graphics acceleration when available</b>. Then restart Edge.";
  if (/OPR\//.test(ua))
    return "Paste <code>opera://settings/system</code> into the address bar and turn on <b>Use graphics acceleration when available</b>. Then restart Opera.";
  if (/Chrome\//.test(ua))
    return "Paste <code>chrome://settings/system</code> into the address bar and turn on <b>Use graphics acceleration when available</b>. Then relaunch the browser.";
  if (/Safari\//.test(ua)) return "Update Safari and your system; Safari has no switch of its own for this.";
  return "Look for <b>hardware</b> or <b>graphics acceleration</b> in your browser's settings, turn it on, and restart the browser.";
}

/**
 * Looks at the context the game is already drawing with (or null if it could
 * not get one). It does not make a context of its own: every extra one is
 * another chance for a weak graphics card to drop them all.
 */
export function checkAcceleration(gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISSED) === "1";
  } catch {
    // No storage: ask every time.
  }
  if (dismissed) return;
  const verdict = probe(gl);
  if (verdict === "fine") return;
  const box = document.getElementById("accel");
  if (!box) return;
  box.innerHTML =
    `<b>${verdict === "none" ? "Your browser could not start 3D graphics." : "Hardware acceleration is turned off."}</b>` +
    `<p>${verdict === "none" ? "The game cannot be drawn without it." : "The game will run, but slowly."} ${directions()}</p>` +
    `<button id="accel-close" aria-label="Dismiss">Dismiss</button>`;
  box.hidden = false;
  document.getElementById("accel-close")!.onclick = () => {
    box.hidden = true;
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Then it will ask again next time.
    }
  };
}
