"use strict";

import {
  sleep, makeScreen,
  setAbortSignal, setActiveAbortController, getActiveAbortController,
} from "./screen.js";
import { runBoot, getBootController } from "./boot.js";
import { getCommand } from "./commands/index.js";
import { isVmActive, launchTinyCore } from "./vm.js";
import { pathLabel } from "./content.js";
import { completeInput } from "./commands/completion.js";

let activeScreen = null;
let inputSpan = null;

export function getActiveScreen() { return activeScreen; }

// Bash-style history. `historyIndex === null` means typing fresh; otherwise
// it points at the entry currently shown. `historyDraft` preserves what was
// being typed before ArrowUp, so ArrowDown past the newest entry can
// restore it.
export const commandHistory = [];
let historyIndex = null;
let historyDraft = "";

// Tracks two-Tab behavior: a multi-match first Tab does nothing visible;
// the second consecutive Tab prints the matches.
let lastKeyWasTab = false;

export function startInput(screen) {
  if (activeScreen && activeScreen !== screen && activeScreen.cursor) {
    activeScreen.cursor.classList.add("idle");
  }
  activeScreen = screen;
  screen.cursor.classList.remove("idle");
  inputSpan = document.createElement("span");
  inputSpan.className = "user-input";
  screen.cursor.before(inputSpan);
  const stdin = document.getElementById("stdin");
  if (stdin) {
    stdin.value = "";
    stdin.focus();
  }
}

export function endInput() { inputSpan = null; }

export function clearScreen() {
  const s = activeScreen;
  if (!s) return;
  const pre = s.cursor.parentElement;
  endInput();
  pre.replaceChildren();
  const scrollHost = pre.parentElement;
  if (scrollHost) scrollHost.scrollTop = 0;
  const newS = makeScreen(pre);
  newS.emitPrompt(pathLabel());
  startInput(newS);
}

// Line-based input capture for in-command prompts (e.g. "[y/N]"). Reuses
// the existing #stdin flow so the user can see what they're typing,
// edit/backspace, and submit with Enter just like at a real shell prompt.
let pendingLineResolver = null;

export function awaitLine(s) {
  return new Promise((resolve) => {
    pendingLineResolver = resolve;
    startInput(s);
  });
}

async function executeCommand(raw) {
  if (!activeScreen) return;
  const s = activeScreen;
  endInput();
  await s.line("");

  const cmd = raw.trim();
  const lower = cmd.toLowerCase();

  // HISTCONTROL=ignoredups behavior - skip if same as previous entry.
  if (cmd !== "" && commandHistory[commandHistory.length - 1] !== cmd) {
    commandHistory.push(cmd);
  }
  historyIndex = null;
  historyDraft = "";

  if (lower === "clear") {
    clearScreen();
    return;
  }

  // Everything below runs under an abort controller so Ctrl+C can
  // interrupt mid-stream.
  const controller = new AbortController();
  setAbortSignal(controller.signal);
  setActiveAbortController(controller);

  try {
    if (cmd === "") {
      // no-op
    } else if (lower === "reboot") {
      // Real-terminal feel: blank the pane and run boot from POST again.
      // Don't await runBoot here - re-attaching input is its responsibility.
      const pre = s.cursor.parentElement;
      endInput();
      pre.replaceChildren();
      if (pre.parentElement) pre.parentElement.scrollTop = 0;
      const newS = makeScreen(pre);
      // Hand activeScreen off so the trailing prompt-emit at the bottom
      // skips this old screen.
      activeScreen = newS;
      runBoot(newS)
        .catch((err) => newS.append(`\n[boot] ${err.message}\n`, "err"))
        .finally(() => startInput(newS));
      return;
    } else if (lower === "exit" || lower === "logout") {
      await s.streamLine("logout");
      await s.line("");
      endInput();
      await sleep(150);
      window.close();
      // window.close() is a no-op for tabs the user opened directly, which
      // is most of them. Leave an SSH-style line so the visitor isn't
      // staring at a frozen prompt.
      await s.streamLine("Connection to rbitton.com closed.", {
        className: "dim",
      });
      await s.line("");
      activeScreen = null;
      return;
    } else if (lower === "boot" || lower.startsWith("boot ")) {
      const arg = cmd.slice("boot".length).trim().toLowerCase();
      if (arg !== "" && arg !== "tinycore") {
        await s.streamLine(`boot: unknown target '${arg}'`, { className: "err" });
        await s.streamLine("usage: boot tinycore", { className: "dim" });
        await s.line("");
      } else if (window.matchMedia("(pointer: coarse)").matches) {
        await s.streamLine(
          "boot: this only works on a device with a hardware keyboard.",
          { className: "err" },
        );
        await s.line("");
      } else {
        await s.streamLine("This will boot TinyCore Linux - a real Linux kernel -", { className: "dim" });
        await s.streamLine("inside this browser tab using the v86 x86 emulator.", { className: "dim" });
        await s.streamLine("It downloads ~20 MB and runs entirely client-side; no", { className: "dim" });
        await s.streamLine("data leaves your machine. Ctrl+Alt+Q exits the VM.", { className: "dim" });
        await s.line("");
        s.append("Boot the VM? ", "dim");
        s.append("[y/N] ");
        const rawAns = await awaitLine(s);
        const ans = rawAns.trim().toLowerCase();
        if (ans !== "y" && ans !== "yes") {
          await s.streamLine("cancelled.", { className: "dim" });
          await s.line("");
        } else {
          await launchTinyCore(s, (screen) => {
            screen.emitPrompt(pathLabel());
            startInput(screen);
          });
          return;
        }
      }
    } else {
      // Match by first whitespace-separated token so "theme dracula" works.
      const first = lower.split(/\s+/)[0];
      const entry = getCommand(first);
      if (entry) {
        await entry.handler(s, cmd);
      } else {
        await s.streamLine(`bash: ${first}: command not found`, {
          className: "err",
        });
        await s.line("");
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
    // On AbortError the "^C" was printed by the Ctrl+C handler at the
    // moment of cancellation - nothing to do here.
  } finally {
    setAbortSignal(null);
    setActiveAbortController(null);
  }

  // If clearScreen or another keystroke has swapped in a new screen
  // mid-command, don't double-emit a prompt on the old one.
  if (activeScreen === s) {
    s.emitPrompt(pathLabel());
    startInput(s);
  }
}

export function setupStdin() {
  const stdin = document.getElementById("stdin");
  if (!stdin) return;

  stdin.addEventListener("keydown", (e) => {
    // VM owns the keyboard while active.
    if (isVmActive()) return;

    // Escape during boot → skip the animation. After boot, getBootController
    // returns null so this falls through.
    if (e.key === "Escape") {
      const bc = getBootController();
      if (bc) {
        e.preventDefault();
        bc.abort();
        return;
      }
    }

    const key = e.key.toLowerCase();
    const plainCtrl = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;

    // While an in-command prompt (`awaitLine`) is waiting, Enter submits
    // the answer and Ctrl+C cancels. Other shortcuts that would normally
    // run a side-effect (Ctrl+L clear, ArrowUp/Down history) are
    // suppressed so they don't interrupt the prompt.
    if (pendingLineResolver) {
      if (e.key === "Enter") {
        e.preventDefault();
        const raw = stdin.value;
        stdin.value = "";
        const resolver = pendingLineResolver;
        pendingLineResolver = null;
        endInput();
        if (activeScreen) activeScreen.append("\n");
        resolver(raw);
        return;
      }
      if (plainCtrl && key === "c") {
        e.preventDefault();
        const resolver = pendingLineResolver;
        pendingLineResolver = null;
        endInput();
        if (activeScreen) activeScreen.append("^C\n", "err");
        stdin.value = "";
        resolver("");
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || (plainCtrl && key === "l")) {
        e.preventDefault();
        return;
      }
      return;
    }

    // Tab - completion. Mobile soft keyboards don't expose Tab, so this
    // is implicitly desktop-only (no special gating needed).
    if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (!inputSpan) return;
      e.preventDefault();
      const result = completeInput(stdin.value);
      if (result.kind === "single") {
        stdin.value = result.replacement;
        inputSpan.textContent = result.replacement;
        stdin.setSelectionRange(result.replacement.length, result.replacement.length);
        lastKeyWasTab = false;
      } else if (result.kind === "multi") {
        // First Tab: silent. Second consecutive Tab: print matches and
        // re-emit the prompt with the user's input still in stdin.
        if (lastKeyWasTab) {
          const sc = activeScreen;
          const current = stdin.value;
          endInput();
          sc.append("\n");
          for (const m of result.matches) sc.append("  " + m + "\n");
          sc.emitPrompt(pathLabel());
          startInput(sc);
          stdin.value = current;
          inputSpan.textContent = current;
          stdin.setSelectionRange(current.length, current.length);
        }
        lastKeyWasTab = true;
      } else {
        lastKeyWasTab = false;
      }
      return;
    }
    if (e.key !== "Tab") lastKeyWasTab = false;

    // Ctrl+L - clear screen. Aborts any in-flight command first.
    if (plainCtrl && key === "l") {
      e.preventDefault();
      const ctl = getActiveAbortController();
      if (ctl) ctl.abort();
      clearScreen();
      return;
    }

    // Ctrl+C - cancel a running command, or discard the current input.
    // If the user has a text selection, let the browser copy instead.
    if (plainCtrl && key === "c") {
      if (window.getSelection && window.getSelection().toString()) return;
      e.preventDefault();
      const ctl = getActiveAbortController();
      if (ctl) {
        if (activeScreen) activeScreen.append("^C\n", "err");
        ctl.abort();
      } else if (inputSpan) {
        const sc = activeScreen;
        endInput();
        if (sc) {
          sc.append("^C\n", "err");
          sc.emitPrompt(pathLabel());
          startInput(sc);
        }
        stdin.value = "";
      }
      return;
    }

    // Desktop Enter (hardware keyboards).
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!inputSpan) return;
      e.preventDefault();
      const raw = stdin.value;
      stdin.value = "";
      executeCommand(raw);
      return;
    }

    // ArrowUp / ArrowDown - bash-style history navigation. Skip when any
    // modifier is held so the browser's own shortcuts still work.
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (plain && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      if (!inputSpan) return;
      if (commandHistory.length === 0) return;
      e.preventDefault();
      if (e.key === "ArrowUp") {
        if (historyIndex === null) {
          historyDraft = stdin.value;
          historyIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        stdin.value = commandHistory[historyIndex];
      } else {
        if (historyIndex === null) return;
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          stdin.value = commandHistory[historyIndex];
        } else {
          historyIndex = null;
          stdin.value = historyDraft;
        }
      }
      inputSpan.textContent = stdin.value;
      // Move the native input's caret to the end so the next keystroke
      // appends rather than landing wherever it was.
      stdin.setSelectionRange(stdin.value.length, stdin.value.length);
      return;
    }
  });

  // Mobile/virtual keyboards fire `insertLineBreak` via beforeinput for
  // the on-screen Return key - catch that too.
  stdin.addEventListener("beforeinput", (e) => {
    if (!inputSpan) return;
    if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
      e.preventDefault();
      const raw = stdin.value;
      stdin.value = "";
      if (pendingLineResolver) {
        const resolver = pendingLineResolver;
        pendingLineResolver = null;
        endInput();
        if (activeScreen) activeScreen.append("\n");
        resolver(raw);
        return;
      }
      executeCommand(raw);
    }
  });

  // Mirror stdin.value into the visible input span. The hidden <input>
  // handles native character insertion, autocorrect, backspace, IME, and
  // paste on its own - we just reflect its state. Sidesteps mobile
  // keyboards' cumulative-buffer quirks.
  stdin.addEventListener("input", () => {
    if (!inputSpan) {
      stdin.value = "";
      return;
    }
    inputSpan.textContent = stdin.value;
  });

  // Tap/click anywhere: refocus stdin (keeps mobile keyboard up). Don't
  // re-pin scroll on focus - visualViewport resize handles the
  // mobile-keyboard-open case, and re-pinning on every click would
  // fight the user when they scroll up to re-read.
  document.addEventListener("click", () => {
    if (isVmActive()) return;
    if (window.getSelection && window.getSelection().toString()) return;
    stdin.focus();
  });
}
