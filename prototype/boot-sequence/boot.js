"use strict";

// =====================================================================
// rbitton.com prototype — single-pane terminal
// One fixed "tmux window" that auto-plays the boot sequence, then sits
// at a prompt accepting typed commands. No scroll-driven sections, no
// visible scrollbar; content that exceeds the pane falls off the top
// into the scrollback just like a real TTY.
// =====================================================================

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const jitter = (min, max) => min + Math.random() * (max - min);

// When a REPL command is running, `abortSignal` is set and any `sleep`
// call will reject with an AbortError if the signal fires (Ctrl+C).
// Boot runs with abortSignal=null, so its sleeps are uninterruptible.
let abortSignal = null;
let activeAbortController = null;

const sleep = (ms) =>
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

// -- Command menu (used by boot's auto-help and the `help` REPL cmd) -
const HELP_ITEMS = [
  ["whoami",       "about me"],
  ["projects",     "what I've built"],
  ["now",          "what I'm up to this season"],
  ["writing",      "essays and technical pieces"],
  ["cv",           "long-form résumé"],
  ["mail",         "get in touch"],
  ["gitlab",       "my self-hosted git"],
  ["github",       "profile on GitHub"],
  ["flights",      "see my flight map"],
  ["theme <name>", "switch color scheme"],
];
const OUTPUT_COMMANDS = [
  "whoami", "projects", "now", "writing", "cv", "mail",
  "gitlab", "github", "flights",
];

// -- Fortune pool ----------------------------------------------------
const FORTUNES = [
  { lines: ['"The best way to predict the future is to invent it."'], author: "Alan Kay" },
  { lines: ['"Talk is cheap. Show me the code."'], author: "Linus Torvalds" },
  { lines: ['"A little copying is better than a little dependency."'], author: "Rob Pike" },
  { lines: ['"Write programs that do one thing and do it well."'], author: "Doug McIlroy" },
  { lines: ['"Simplicity is prerequisite for reliability."'], author: "Edsger Dijkstra" },
  { lines: ['"Controlling complexity is the essence of computer programming."'], author: "Brian Kernighan" },
  { lines: ['"Premature optimization is the root of all evil."'], author: "Donald Knuth" },
  { lines: ['"When in doubt, use brute force."'], author: "Ken Thompson" },
  {
    lines: [
      '"Perfection is achieved not when there is nothing more to add,',
      ' but when there is nothing left to take away."',
    ],
    author: "Antoine de Saint-Exupéry",
  },
  { lines: ['"A good composer does not imitate; he steals."'], author: "Igor Stravinsky" },
];

// -- Async lookups (fired at load, awaited when needed) --------------
const ipPromise = fetch("https://api4.ipify.org?format=json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => d?.ip || null)
  .catch(() => null);

const kernelPromise = fetch(
  "https://api.github.com/repos/gregkh/linux/tags?per_page=20",
)
  .then((r) => (r.ok ? r.json() : null))
  .then((tags) => {
    if (!Array.isArray(tags)) return null;
    const stable = tags.find((t) => /^v\d+\.\d+(\.\d+)?$/.test(t.name));
    return stable ? stable.name.replace(/^v/, "") : null;
  })
  .catch(() => null);

// -- Mobile font fit -------------------------------------------------
// The widest line expected anywhere. If it fits, everything fits.
const WIDEST_LINE =
  "    Raphael Bitton — student, system orchestrator, occasional composer, explorer.";

function fitFontToViewport() {
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

fitFontToViewport();
addEventListener("resize", fitFontToViewport);

// Explicitly resize the pane to the *visual* viewport height. `dvh`
// handles this on many browsers but iOS Safari has historically lagged,
// so we override in JS. When the on-screen keyboard opens, the visual
// viewport shrinks and so does main — its bottom edge lands right
// above the keyboard.
function applyViewportHeight() {
  const h = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  document.documentElement.style.height = h + "px";
  document.body.style.height = h + "px";
  const main = document.getElementById("terminal");
  if (main) main.style.height = h + "px";
}

function rePinPrompt() {
  const doScroll = () => {
    if (activeScreen && activeScreen.cursor) {
      activeScreen.cursor.scrollIntoView({ block: "end" });
    }
  };
  doScroll();
  requestAnimationFrame(doScroll);
  setTimeout(doScroll, 150);
  setTimeout(doScroll, 350);
}

function onViewportChange() {
  applyViewportHeight();
  rePinPrompt();
}

applyViewportHeight();
addEventListener("resize", onViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
  window.visualViewport.addEventListener("scroll", onViewportChange);
}

// -- Screen factory --------------------------------------------------
function makeScreen(preEl) {
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  preEl.appendChild(cursor);

  const scrollHost = preEl.parentElement;
  function keepBottomVisible() {
    if (!scrollHost) return;
    // scrollIntoView respects the host's scroll-padding-bottom, which
    // is what gives us breathing room below the cursor. scrollTop =
    // scrollHeight doesn't honor scroll-padding, so we use this.
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

  async function typeOut(text, { className, minMs = 60, maxMs = 150 } = {}) {
    const span = document.createElement("span");
    if (className) span.className = className;
    cursor.before(span);
    if (reduced) {
      span.textContent = text;
      keepBottomVisible();
      return;
    }
    for (const ch of text) {
      span.appendChild(document.createTextNode(ch));
      keepBottomVisible();
      await sleep(jitter(minMs, maxMs));
    }
  }

  // Like line() but characters stream in one at a time — gives REPL
  // output that TTY "printing" feel instead of popping whole lines.
  async function streamLine(
    text,
    { className, minMs = 3, maxMs = 8, gap = 40 } = {},
  ) {
    await typeOut(text, { className, minMs, maxMs });
    append("\n");
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

  function emitPrompt() {
    const prompt = document.createElement("span");
    const host = document.createElement("span");
    host.className = "prompt-host";
    host.textContent = "guest@rbitton";
    const path = document.createElement("span");
    path.className = "prompt-path";
    path.textContent = ":~";
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

  async function emitHelpLine(cmd, desc, { stream = true } = {}) {
    if (!stream) {
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
      return;
    }
    await typeOut("  " + cmd.padEnd(18, " "), {
      className: "prompt-path",
      minMs: 3,
      maxMs: 8,
    });
    await typeOut(desc, { className: "dim", minMs: 3, maxMs: 8 });
    append("\n");
    await sleep(30);
  }

  return {
    cursor,
    append,
    line,
    burst,
    typeOut,
    streamLine,
    kernLine,
    emitPrompt,
    emitHelpLine,
    emitLink,
  };
}

// -- Boot sequence ---------------------------------------------------
async function runBoot(s) {
  const { append, line, burst, typeOut, kernLine, emitPrompt, emitHelpLine } = s;

  await burst(
    [
      "rbitton BIOS v2.4.1  Copyright (C) 2026 Raphael Bitton",
      "CPU: AMD Threadripper PRO 7995WX  96 cores @ 5.1 GHz",
      "Memory Test: 65536M OK",
      "Detecting IDE drives... none",
      "Detecting NVMe: SAMSUNG 990 PRO 2TB  OK",
      "Boot device: /dev/nvme0n1p2",
      "Booting GRUB...",
    ],
    { gap: 90, className: "post" },
  );

  await sleep(300);

  const kernelVer =
    (await Promise.race([
      kernelPromise,
      new Promise((r) => setTimeout(() => r(null), 500)),
    ])) || "7.0.1";
  const kernelTag = `${kernelVer}-rbitton-zfs`;

  const kernLines = [
    ["[    0.000000]", ` Linux version ${kernelTag} (rbitton@thinkpad) #1 SMP`],
    ["[    0.000123]", ` Command line: BOOT_IMAGE=/boot/vmlinuz-${kernelTag}`],
    ["[    0.001842]", " x86/fpu: Supporting XSAVE feature 0x001: 'x87 floating point'"],
    ["[    0.012394]", " ACPI: Early table checksum verification disabled"],
    ["[    0.089231]", " nvme nvme0: 8/0/0 default/read/poll queues"],
    ["[    0.104212]", " SPL: Loaded module v2.2.3"],
    ["[    0.121749]", " ZFS: Loaded module v2.2.3, ZFS pool version 5000"],
    ["[    0.135892]", " zfs: importing pool 'tank'... OK (24T, RAIDZ2)"],
    ["[    0.152431]", " zed: ZFS Event Daemon online"],
    ["[    0.178120]", " systemd[1]: Starting systemd-udevd..."],
    ["[    0.210938]", " audio0: composer_iface registered"],
    ["[    0.254611]", " flightsim: ILS receiver armed"],
    ["[    0.301812]", " skylantix: fleet interface online"],
    ["[    0.358723]", " rbitton: identity module loaded", "identity"],
    ["[    0.419937]", " Reached target Multi-User System."],
  ];
  for (const [ts, rest, special] of kernLines) {
    kernLine(ts, rest, special);
    await sleep(jitter(70, 140));
  }

  await sleep(450);

  // Login
  await line("");
  await line(`Arch Linux ${kernelTag} (tty1)`, { gap: 220 });
  await line("");

  append("rbitton.com login: ");
  await sleep(500);
  await typeOut("guest", { className: "user-input", minMs: 90, maxMs: 200 });
  await sleep(200);
  await line("");

  append("Password: ");
  await sleep(300);
  // 16 chars — current common-sense recommendation for a strong password.
  await typeOut("****************", {
    className: "user-input",
    minMs: 40,
    maxMs: 90,
  });
  await sleep(180);
  await line("");
  await sleep(180);
  const ip =
    (await Promise.race([
      ipPromise,
      new Promise((r) => setTimeout(() => r(null), 1200)),
    ])) || "skylantix.lan";
  await line(`Last login: Fri Apr 24 09:14:22 on tty2 from ${ip}`, {
    className: "dim",
  });

  await sleep(350);

  // MOTD
  const banner = [
    " ____             _                _   ____  _ _   _              ",
    "|  _ \\ __ _ _ __ | |__   __ _  ___| | | __ )(_) |_| |_ ___  _ __  ",
    "| |_) / _` | '_ \\| '_ \\ / _` |/ _ \\ | |  _ \\| | __| __/ _ \\| '_ \\ ",
    "|  _ < (_| | |_) | | | | (_| |  __/ | | |_) | | |_| || (_) | | | |",
    "|_| \\_\\__,_| .__/|_| |_|\\__,_|\\___|_| |____/|_|\\__|\\__\\___/|_| |_|",
    "           |_|                                                    ",
  ];
  for (const ln of banner) await line(ln, { gap: 25, className: "motd" });
  await line("");
  await line(
    "    Raphael Bitton — student, system orchestrator, occasional composer, explorer.",
    { className: "motd" },
  );
  await line("    Founder & Lead Systems Engineer · Skylantix.", {
    className: "dim",
  });
  await line("    Lead Systems Architect · addictd.ai.", {
    className: "dim",
  });
  await line("");
  const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  for (const ln of fortune.lines) {
    await line("    " + ln, { className: "fortune" });
  }
  await line("                                        — " + fortune.author, {
    className: "fortune",
  });
  await line("");

  // First prompt + auto-`help`
  emitPrompt();
  await sleep(650);

  await typeOut("help", { className: "user-input", minMs: 80, maxMs: 180 });
  await sleep(220);
  await line("");

  for (const [cmd, desc] of HELP_ITEMS) {
    await emitHelpLine(cmd, desc);
  }
  await line("");

  // Idle prompt — REPL will attach here.
  emitPrompt();
}

// -- Command outputs (content only; streamed inline in the REPL) ----
const OUTPUTS = {
  whoami: async (s) => {
    const { line, streamLine } = s;
    await streamLine("rbitton");
    await line("");
    await streamLine(
      "Raphael Bitton — student, system orchestrator, occasional composer, explorer.",
      { className: "motd" },
    );
    await streamLine("Founder & Lead Systems Engineer at Skylantix.", {
      className: "dim",
    });
    await streamLine("Lead Systems Architect at addictd.ai.", {
      className: "dim",
    });
    await line("");
    await streamLine("UChicago President's Scholar. Obsessed with Linux and self-hosting;");
    await streamLine("ditched Apple and Windows years ago and never looked back. Running a");
    await streamLine("constellation of services across servers nationwide — late nights,");
    await streamLine("Docker Compose stacks, occasional composition.");
    await line("");
    await streamLine("Off-keyboard: flight sim cockpits (ILS approaches are a hobby), and");
    await streamLine("planning the next trip.");
    await line("");
  },
  cv: async (s) => {
    const { line, streamLine } = s;
    await streamLine("Raphael Bitton", { className: "motd" });
    await streamLine("Chicago, IL  ·  raphael@rbitton.com", { className: "dim" });
    await line("");
    await streamLine("now", { className: "dim" });
    await streamLine("  University of Chicago — B.A. in Data Science & Music,");
    await streamLine("  President's Scholar. Graduating soon.");
    await streamLine("  Founder & Lead Systems Engineer at Skylantix.");
    await streamLine("  Lead Systems Architect at addictd.ai.");
    await line("");
    await streamLine("background", { className: "dim" });
    await streamLine("  High school spent deep in AP exams (for the love of it, not");
    await streamLine("  for college apps), singing in choir, composing choral music.");
    await streamLine("  Picked up aviation and travel obsessions at the same time.");
    await line("");
    await streamLine("  Gap year after freshman year at UChicago. Visited 24 countries");
    await streamLine("  across all six inhabited continents in 2023 alone — rewired");
    await streamLine("  how I think about most things.");
    await line("");
    await streamLine("  Came back to school and found Linux. Went all-in — ditched");
    await streamLine("  the iPhone, MacBook, and Windows desktop. Now spend late");
    await streamLine("  nights (often at 4 a.m.) building Docker Compose stacks and");
    await streamLine("  maintaining a constellation of self-hosted services across");
    await streamLine("  servers nationwide.");
    await line("");
    await streamLine("  Composition fell by the wayside, but the creative");
    await streamLine("  problem-solving it taught me shows up in systems design.");
    await line("");
    await streamLine("what's next", { className: "dim" });
    await streamLine("  About to graduate with no clear idea what's next. Airline?");
    await streamLine("  Sysadmin? Something that combines both? Honestly, I don't");
    await streamLine("  know yet — and that's okay. Life rarely gives you the full");
    await streamLine("  configuration file upfront. The only way forward is to");
    await streamLine("  test, deploy, and iterate.");
    await line("");
    await streamLine("  continuandum est.", { className: "fortune" });
    await line("");
  },
  mail: async (s) => {
    window.location.href = "mailto:raphael@rbitton.com";
    s.append("-> ", "dim");
    s.emitLink("raphael@rbitton.com", "mailto:raphael@rbitton.com");
    s.append("\n");
    await s.line("", { gap: 40 });
  },
  projects: async (s) => {
    const { line, streamLine } = s;
    const PAD = 16;
    await streamLine("ongoing:", { className: "dim" });
    await line("");
    const ongoing = [
      ["Skylantix",    "founder & lead systems engineer."],
      ["",             "ops-as-a-service, self-hosted-first."],
      ["rbitton.com",  "this site. hand-rolled, no framework."],
      ["",             "(you're looking at it.)"],
    ];
    for (const [name, desc] of ongoing) {
      await streamLine(`  ${name.padEnd(PAD, " ")}${desc}`);
    }
    await line("");
    await streamLine("personal:", { className: "dim" });
    await line("");
    const personal = [
      ["Lantern",         "coming when it's ready."],
      ["zftop",           "a `top`-like for ZFS pools."],
      ["custom kernels",  "rbitton-zfs builds of mainline Linux."],
      ["LFS",             "Linux From Scratch, for the learning."],
    ];
    for (const [name, desc] of personal) {
      await streamLine(`  ${name.padEnd(PAD, " ")}${desc}`);
    }
    await line("");
    await streamLine(
      "(deep-dives coming. they'll live at rbitton.com/p/<slug>.)",
      { className: "dim" },
    );
    await line("");
  },
  now: async (s) => {
    const { line, streamLine } = s;
    await streamLine("what i'm up to this season:", { className: "dim" });
    await line("");
    await streamLine("  · finishing my last year at UChicago.");
    await streamLine("  · running Skylantix.");
    await streamLine("  · rebuilding this site from scratch — you're in the prototype.");
    await streamLine("  · flight sim on the weekends, when I can tear myself away");
    await streamLine("    from Docker Compose stacks at 4 a.m.");
    await line("");
    await streamLine(
      "(updated by hand. no timestamps pretending to be automated.)",
      { className: "dim" },
    );
    await line("");
  },
  gitlab: async (s) => {
    window.open(
      "https://git.skylantix.com/rbitton",
      "_blank",
      "noopener,noreferrer",
    );
    s.append("-> ", "dim");
    s.emitLink("git.skylantix.com/rbitton", "https://git.skylantix.com/rbitton");
    s.append("\n");
    await s.line("", { gap: 40 });
  },
  github: async (s) => {
    window.open(
      "https://github.com/rbitton1729",
      "_blank",
      "noopener,noreferrer",
    );
    s.append("-> ", "dim");
    s.emitLink("github.com/rbitton1729", "https://github.com/rbitton1729");
    s.append("\n");
    await s.line("", { gap: 40 });
  },
  flights: async (s) => {
    window.open(
      "https://flights.rbitton.com",
      "_blank",
      "noopener,noreferrer",
    );
    s.append("-> ", "dim");
    s.emitLink("flights.rbitton.com", "https://flights.rbitton.com");
    s.append("  (see my flight map)\n", "dim");
    await s.line("", { gap: 40 });
  },
};

// -- REPL ------------------------------------------------------------
let activeScreen = null;
let inputSpan = null;

function startInput(screen) {
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

function endInput() {
  inputSpan = null;
}

// Wipe the active screen and drop a fresh prompt at the top.
// Shared by the `clear` command and the Ctrl+L shortcut.
function clearScreen() {
  const s = activeScreen;
  if (!s) return;
  const pre = s.cursor.parentElement;
  endInput();
  pre.replaceChildren();
  const scrollHost = pre.parentElement;
  if (scrollHost) scrollHost.scrollTop = 0;
  const newS = makeScreen(pre);
  newS.emitPrompt();
  startInput(newS);
}

async function executeCommand(raw) {
  if (!activeScreen) return;
  const s = activeScreen;
  endInput();
  await s.line("");

  const cmd = raw.trim();
  const lower = cmd.toLowerCase();

  if (lower === "clear") {
    clearScreen();
    return;
  }

  // Everything below runs under an abort controller so Ctrl+C can
  // interrupt mid-stream.
  const controller = new AbortController();
  abortSignal = controller.signal;
  activeAbortController = controller;

  try {
    if (cmd === "") {
      // no-op
    } else if (lower === "help") {
      for (const [item, desc] of HELP_ITEMS) await s.emitHelpLine(item, desc);
      await s.line("");
    } else if (OUTPUT_COMMANDS.includes(lower)) {
      const output = OUTPUTS[lower];
      if (!output) {
        await s.line(`'${lower}' is not wired up in this prototype yet.`, {
          className: "dim",
        });
        await s.line("");
      } else {
        await output(s);
      }
    } else if (lower === "uname" || lower === "uname -a") {
      const kv =
        (await Promise.race([kernelPromise, Promise.resolve(null)])) ||
        "7.0.1";
      await s.streamLine(
        `Linux rbitton.com ${kv}-rbitton-zfs #1 SMP x86_64 GNU/Linux`,
      );
      await s.line("");
    } else if (lower === "fortune") {
      const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      for (const ln of f.lines)
        await s.streamLine(ln, { className: "fortune" });
      await s.streamLine(
        `                                        — ${f.author}`,
        { className: "fortune" },
      );
      await s.line("");
    } else if (lower.startsWith("sudo")) {
      await s.streamLine(
        "Permission denied. This incident will be reported.",
        { className: "err" },
      );
      await s.line("");
    } else if (lower.startsWith("theme")) {
      await s.streamLine("theme: not wired up in this prototype.", {
        className: "dim",
      });
      await s.line("");
    } else {
      await s.streamLine(`command not found: ${cmd}. Try 'help'.`, {
        className: "err",
      });
      await s.line("");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error(err);
    }
    // On AbortError the "^C" marker was printed by the Ctrl+C handler
    // at the moment of cancellation — nothing to do here.
  } finally {
    abortSignal = null;
    activeAbortController = null;
  }

  // If clearScreen or another keystroke has swapped in a new screen
  // mid-command, don't double-emit a prompt on the old one.
  if (activeScreen === s) {
    s.emitPrompt();
    startInput(s);
  }
}

function setupStdin() {
  const stdin = document.getElementById("stdin");
  if (!stdin) return;

  stdin.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const plainCtrl = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;

    // Ctrl+L — clear screen. Aborts any in-flight command first.
    if (plainCtrl && key === "l") {
      e.preventDefault();
      if (activeAbortController) activeAbortController.abort();
      clearScreen();
      return;
    }

    // Ctrl+C — cancel a running command, or discard the current input.
    // If the user has a text selection, let the browser copy instead.
    if (plainCtrl && key === "c") {
      if (window.getSelection && window.getSelection().toString()) return;
      e.preventDefault();
      if (activeAbortController) {
        if (activeScreen) activeScreen.append("^C\n", "err");
        activeAbortController.abort();
      } else if (inputSpan) {
        const s = activeScreen;
        endInput();
        if (s) {
          s.append("^C\n", "err");
          s.emitPrompt();
          startInput(s);
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
    }
  });

  // Mobile/virtual keyboards fire `insertLineBreak` via beforeinput for
  // the on-screen Return key — catch that too.
  stdin.addEventListener("beforeinput", (e) => {
    if (!inputSpan) return;
    if (
      e.inputType === "insertLineBreak" ||
      e.inputType === "insertParagraph"
    ) {
      e.preventDefault();
      const raw = stdin.value;
      stdin.value = "";
      executeCommand(raw);
    }
  });

  // Mirror stdin.value directly into the visible input span. We let
  // the hidden <input> handle native character insertion, autocorrect,
  // backspace, IME, and paste on its own — we just reflect its state
  // character-for-character. This is the simplest cross-browser path
  // and sidesteps mobile keyboards' cumulative-buffer quirks.
  stdin.addEventListener("input", () => {
    if (!inputSpan) {
      stdin.value = "";
      return;
    }
    inputSpan.textContent = stdin.value;
  });

  // Tap/click anywhere: refocus stdin (keeps mobile keyboard up,
  // doesn't interfere with text selection). We intentionally don't
  // re-pin scroll on focus — the visualViewport resize listener
  // handles the mobile-keyboard-open case, and re-pinning on every
  // click would fight the user when they scroll up to re-read.
  document.addEventListener("click", () => {
    if (window.getSelection && window.getSelection().toString()) return;
    stdin.focus();
  });
}

// -- Kick off --------------------------------------------------------
setupStdin();
const boot = makeScreen(document.getElementById("screen"));
runBoot(boot)
  .catch((err) => {
    boot.append(`\n[boot] unrecoverable error: ${err.message}\n`, "err");
  })
  .finally(() => {
    startInput(boot);
  });
