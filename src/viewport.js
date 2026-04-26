"use strict";

// The widest line expected anywhere. If it fits, everything fits.
const WIDEST_LINE =
  "    Raphael Bitton: student, system orchestrator, occasional composer, explorer.";

export function fitFontToViewport() {
  const pre = document.querySelector(".screen");
  if (!pre) return;
  pre.style.fontSize = "";

  const cs = getComputedStyle(pre);
  const baseSize = parseFloat(cs.fontSize);

  const probe = document.createElement("span");
  probe.style.cssText =
    "visibility:hidden;position:absolute;left:-9999px;white-space:pre;";
  probe.style.font = cs.font;
  probe.textContent = WIDEST_LINE;
  document.body.appendChild(probe);
  const natural = probe.offsetWidth;
  document.body.removeChild(probe);

  const container = pre.parentElement || document.body;
  const containerCS = getComputedStyle(container);
  const padX =
    parseFloat(containerCS.paddingLeft) + parseFloat(containerCS.paddingRight);
  const available = container.clientWidth - padX - 4;
  if (natural > available && natural > 0) {
    const scaled = Math.max(6, (baseSize * available) / natural);
    pre.style.fontSize = scaled + "px";
  }
}

// Set the pane's height from the *visual* viewport. `dvh` handles this
// on many browsers but iOS Safari has historically lagged, so we
// override in JS. When the on-screen keyboard opens, the visual viewport
// shrinks and so does main - its bottom edge lands right above the keyboard.
export function applyViewportHeight() {
  const h = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  document.documentElement.style.height = h + "px";
  document.body.style.height = h + "px";
  const main = document.getElementById("terminal");
  if (main) main.style.height = h + "px";
}

// Caller injects `() => activeScreen` because activeScreen lives in repl.js
// and importing it here would form a cycle.
export function makeRePinPrompt(getActiveScreen) {
  return function rePinPrompt() {
    const doScroll = () => {
      const s = getActiveScreen();
      if (s && s.cursor) s.cursor.scrollIntoView({ block: "end" });
    };
    doScroll();
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 150);
    setTimeout(doScroll, 350);
  };
}

export function installViewportListeners(rePinPrompt) {
  function onChange() {
    applyViewportHeight();
    rePinPrompt();
  }
  applyViewportHeight();
  addEventListener("resize", onChange);
  addEventListener("resize", fitFontToViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onChange);
    window.visualViewport.addEventListener("scroll", onChange);
  }
}
