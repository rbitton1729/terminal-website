// Boot-sequence prototype for rbitton.com
// Auto-play on load: POST -> kernel dmesg -> login -> MOTD -> shell prompt.

const screen = document.getElementById("screen");
const terminal = document.getElementById("terminal");

// Curated fortune pool — one is picked at random per load.
// Kept short so they fit on one or two 80ch lines.
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

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const jitter = (min, max) => min + Math.random() * (max - min);

// One cursor element that stays at the tail of the screen.
// Content is inserted *before* it.
const cursor = document.createElement("span");
cursor.className = "cursor";
screen.appendChild(cursor);

// Scale the terminal font so the widest expected line never wraps.
// Measured off a probe using the screen's actual computed font, then re-run
// on viewport resize.
const WIDEST_LINE =
  "    Raphael Bitton — student, system orchestrator, occasional composer, explorer.";

function fitFontToViewport() {
  screen.style.fontSize = "";
  const cs = getComputedStyle(screen);
  const baseSize = parseFloat(cs.fontSize);

  const probe = document.createElement("span");
  probe.style.cssText =
    "visibility:hidden;position:absolute;left:-9999px;white-space:pre;";
  probe.style.font = cs.font;
  probe.textContent = WIDEST_LINE;
  document.body.appendChild(probe);
  const natural = probe.offsetWidth;
  document.body.removeChild(probe);

  const available = terminal.clientWidth - 4;
  if (natural > available && natural > 0) {
    const scaled = Math.max(6, (baseSize * available) / natural);
    screen.style.fontSize = scaled + "px";
  }
}

fitFontToViewport();
addEventListener("resize", fitFontToViewport);

// Fire the IP lookup as soon as the page loads so it's ready by the time
// the boot sequence reaches the "Last login" line. Falls back if it fails
// or stalls. IPv4-only to keep line width predictable.
const ipPromise = fetch("https://api4.ipify.org?format=json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => d?.ip || null)
  .catch(() => null);

// Poll GitHub's gregkh/linux tags for the current stable kernel version.
// (Linus's tree only tags x.y; Greg's stable tree adds the x.y.z point
// releases.) kernel.org doesn't serve CORS but GitHub does. Falls back
// if the fetch fails or returns nothing usable.
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

function scrollBottom() {
  terminal.scrollTop = terminal.scrollHeight;
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
  scrollBottom();
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
    scrollBottom();
    return;
  }
  for (const ch of text) {
    span.appendChild(document.createTextNode(ch));
    scrollBottom();
    await sleep(jitter(minMs, maxMs));
  }
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
  scrollBottom();
}

async function run() {
  // ── POST ────────────────────────────────────────────────────────────
  await burst(
    [
      "rbitton BIOS v2.4.1  Copyright (C) 2026 Raphael Bitton",
      "CPU: AMD Ryzen 9 7950X  16 cores @ 4.5 GHz",
      "Memory Test: 65536M OK",
      "Detecting IDE drives... none",
      "Detecting NVMe: SAMSUNG 990 PRO 2TB  OK",
      "Boot device: /dev/nvme0n1p2",
      "Booting GRUB...",
    ],
    { gap: 90, className: "post" },
  );

  await sleep(300);

  // ── Kernel / dmesg ──────────────────────────────────────────────────
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

  // ── Login ───────────────────────────────────────────────────────────
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
  await typeOut("****", { className: "user-input", minMs: 110, maxMs: 240 });
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

  // ── MOTD / banner ───────────────────────────────────────────────────
  const banner = [
    "      _     _ _   _              ",
    " _ __| |__ (_) |_| |_ ___  _ __  ",
    "| '__| '_ \\| | __| __/ _ \\| '_ \\ ",
    "| |  | |_) | | |_| || (_) | | | |",
    "|_|  |_.__/|_|\\__|\\__\\___/|_| |_|",
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
  await line("");
  const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  for (const ln of fortune.lines) {
    await line("    " + ln, { className: "fortune" });
  }
  await line("                                        — " + fortune.author, {
    className: "fortune",
  });
  await line("");

  // ── First prompt ────────────────────────────────────────────────────
  emitPrompt();
  await sleep(650);

  // ── Auto-`help` ─────────────────────────────────────────────────────
  await typeOut("help", { className: "user-input", minMs: 80, maxMs: 180 });
  await sleep(220);
  await line("");

  const helpItems = [
    ["whoami",       "about me"],
    ["projects",     "what I've built"],
    ["now",          "what I'm up to this season"],
    ["writing",      "essays and technical pieces"],
    ["cv",           "long-form résumé"],
    ["mail",         "get in touch"],
    ["theme <name>", "switch color scheme"],
  ];
  for (const [cmd, desc] of helpItems) {
    emitHelpLine(cmd, desc);
    await sleep(35);
  }
  await line("");
  await line("  scroll to explore, or click any line to jump.", {
    className: "dim",
  });
  await line("");

  // ── Idle prompt ─────────────────────────────────────────────────────
  emitPrompt();
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
  scrollBottom();
}

function emitHelpLine(cmd, desc) {
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
  scrollBottom();
}

run().catch((err) => {
  const e = document.createElement("span");
  e.className = "err";
  e.textContent = `\n[boot] unrecoverable error: ${err.message}\n`;
  cursor.before(e);
});
