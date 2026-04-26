"use strict";

export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const jitter = (min, max) => min + Math.random() * (max - min);

let abortSignal = null;
let activeAbortController = null;

export function setAbortSignal(s) { abortSignal = s; }
export function getAbortSignal() { return abortSignal; }
export function setActiveAbortController(c) { activeAbortController = c; }
export function getActiveAbortController() { return activeAbortController; }

export const sleep = (ms) =>
  new Promise((resolve, reject) => {
    if (abortSignal && abortSignal.aborted) {
      return reject(new DOMException("aborted", "AbortError"));
    }
    const timer = setTimeout(resolve, reduced ? 0 : ms);
    if (abortSignal) {
      abortSignal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });

export function makeScreen(preEl) {
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  preEl.appendChild(cursor);

  const scrollHost = preEl.parentElement;
  function keepBottomVisible() {
    if (!scrollHost) return;
    // scrollIntoView respects scroll-padding-bottom on the host, which
    // is what gives breathing room below the cursor. scrollTop = scrollHeight
    // doesn't honor scroll-padding, so we use this.
    const doScroll = () => cursor.scrollIntoView({ block: "end" });
    doScroll();
    requestAnimationFrame(doScroll);
  }

  function append(text, className) {
    if (className) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      cursor.before(span);
    } else {
      cursor.before(document.createTextNode(text));
    }
    keepBottomVisible();
  }

  async function line(text = "", { className, gap = 30 } = {}) {
    append(text + "\n", className);
    await sleep(gap);
  }

  async function burst(lines, { gap = 60, className } = {}) {
    for (const l of lines) await line(l, { gap, className });
  }

  async function typeOut(
    text,
    { className, minMs = 60, maxMs = 150, hesitate = true } = {},
  ) {
    const span = document.createElement("span");
    if (className) span.className = className;
    cursor.before(span);
    if (reduced) {
      span.textContent = text;
      keepBottomVisible();
      return;
    }
    for (let i = 0; i < text.length; i++) {
      span.appendChild(document.createTextNode(text[i]));
      keepBottomVisible();
      await sleep(jitter(minMs, maxMs));
      // Mid-word hesitation - humans don't type at perfectly even cadence.
      // Skip on last char so we don't dwell after the word is finished.
      if (hesitate && i < text.length - 1 && Math.random() < 0.12) {
        await sleep(jitter(120, 260));
      }
    }
  }

  async function streamLine(text, { className, gap = 4 } = {}) {
    append(text + "\n", className);
    await sleep(gap);
  }

  function kernLine(ts, rest, specialClass) {
    const wrap = document.createElement("span");
    wrap.className = "kern";
    const tsSpan = document.createElement("span");
    tsSpan.className = "ts";
    tsSpan.textContent = ts;
    wrap.appendChild(tsSpan);
    const restSpan = document.createElement("span");
    if (specialClass) restSpan.className = specialClass;
    restSpan.textContent = rest;
    wrap.appendChild(restSpan);
    wrap.appendChild(document.createTextNode("\n"));
    cursor.before(wrap);
    keepBottomVisible();
  }

  function emitPrompt(label = "~") {
    const prompt = document.createElement("span");
    const host = document.createElement("span");
    host.className = "prompt-host";
    host.textContent = "guest@archlinux";
    const path = document.createElement("span");
    path.className = "prompt-path";
    path.textContent = ":" + label;
    prompt.appendChild(host);
    prompt.appendChild(path);
    prompt.appendChild(document.createTextNode("$ "));
    cursor.before(prompt);
    keepBottomVisible();
  }

  function emitLink(text, href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "link";
    a.textContent = text;
    cursor.before(a);
    keepBottomVisible();
  }

  async function emitHelpLine(cmd, desc, { gap = 4 } = {}) {
    const row = document.createElement("span");
    const cmdSpan = document.createElement("span");
    cmdSpan.className = "prompt-path";
    cmdSpan.textContent = "  " + cmd.padEnd(18, " ");
    const descSpan = document.createElement("span");
    descSpan.className = "dim";
    descSpan.textContent = desc;
    row.appendChild(cmdSpan);
    row.appendChild(descSpan);
    row.appendChild(document.createTextNode("\n"));
    cursor.before(row);
    keepBottomVisible();
    await sleep(gap);
  }

  // Wipe the pane in place and re-seat the cursor. Mirrors how a real
  // getty/agetty clears the console between kernel log spew and the
  // login banner.
  function clear() {
    preEl.replaceChildren(cursor);
    if (scrollHost) scrollHost.scrollTop = 0;
  }

  return {
    cursor, append, line, burst, typeOut, streamLine, kernLine,
    emitPrompt, emitHelpLine, emitLink, clear,
  };
}
