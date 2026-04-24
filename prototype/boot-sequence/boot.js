// Boot-sequence prototype for rbitton.com
// Auto-play on load: POST -> kernel dmesg -> login -> MOTD -> shell prompt.

const screen = document.getElementById("screen");
const terminal = document.getElementById("terminal");

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const jitter = (min, max) => min + Math.random() * (max - min);

// One cursor element that stays at the tail of the screen.
// Content is inserted *before* it.
const cursor = document.createElement("span");
cursor.className = "cursor";
screen.appendChild(cursor);

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
  const kernLines = [
    ["[    0.000000]", " Linux version 6.7.2-rbitton (rbitton@thinkpad) #1 SMP"],
    ["[    0.000123]", " Command line: BOOT_IMAGE=/boot/vmlinuz-6.7.2 root=UUID=…"],
    ["[    0.001842]", " x86/fpu: Supporting XSAVE feature 0x001: 'x87 floating point'"],
    ["[    0.012394]", " ACPI: Early table checksum verification disabled"],
    ["[    0.089231]", " usb 1-2: new high-speed USB device number 3 using xhci_hcd"],
    ["[    0.147812]", " Bluetooth: Core ver 2.22"],
    ["[    0.193847]", " systemd[1]: Starting systemd-udevd..."],
    ["[    0.284912]", " nvme nvme0: 8/0/0 default/read/poll queues"],
    ["[    0.341823]", " rbitton: identity module loaded", "identity"],
    ["[    0.402837]", " Reached target Multi-User System."],
  ];
  for (const [ts, rest, special] of kernLines) {
    kernLine(ts, rest, special);
    await sleep(jitter(70, 140));
  }

  await sleep(450);

  // ── Login ───────────────────────────────────────────────────────────
  await line("");
  await line("Arch Linux 6.7.2-rbitton (tty1)", { gap: 220 });
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
  await line("Last login: Fri Apr 24 09:14:22 on tty2 from kabul.lan", {
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
  await line("    Raphael Bitton — composer, sysadmin, software.", {
    className: "motd",
  });
  await line("");
  await line('    "The best way to predict the future is to implement it."', {
    className: "fortune",
  });
  await line("                                        — Alan Kay", {
    className: "fortune",
  });
  await line("");
  await line("    type 'help' when you have a shell. (scroll is coming soon.)", {
    className: "dim",
  });
  await line("");

  // ── Prompt ──────────────────────────────────────────────────────────
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

run().catch((err) => {
  const e = document.createElement("span");
  e.className = "err";
  e.textContent = `\n[boot] unrecoverable error: ${err.message}\n`;
  cursor.before(e);
});
