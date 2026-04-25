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
  ["meditations",  "essays and reflections"],
  ["cv",           "long-form résumé"],
  ["mail",         "get in touch"],
  ["gitlab",       "my self-hosted git"],
  ["github",       "profile on GitHub"],
  ["flights",      "see my flight map"],
  ["source",       "this site's source code"],
  ["theme <name>", "switch color scheme"],
];
const OUTPUT_COMMANDS = [
  "whoami", "projects", "now", "meditations", "cv", "mail",
  "gitlab", "github", "flights", "source",
];

const THEMES = [
  "gruvbox-dark",
  "gruvbox-light",
  "solarized-dark",
  "solarized-light",
  "nord",
  "dracula",
  "tokyo-night",
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
      // Occasional mid-word hesitation — humans don't type at a
      // perfectly even cadence. Skip on the last char so we don't
      // dwell after the word is finished.
      if (hesitate && i < text.length - 1 && Math.random() < 0.12) {
        await sleep(jitter(120, 260));
      }
    }
  }

  // Command-output line. Real TTYs print whole lines fast enough that
  // a multi-line output reads as "all at once" — same cadence as the
  // help/MOTD reveal.
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

  function emitPrompt() {
    const prompt = document.createElement("span");
    const host = document.createElement("span");
    host.className = "prompt-host";
    host.textContent = "guest@archlinux";
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

  async function emitHelpLine(cmd, desc) {
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
    await sleep(4);
  }

  // Wipe the pane in place and re-seat the cursor. Used during boot to
  // mimic the way a real getty/agetty clears the console between the
  // kernel log spew and the login banner.
  function clear() {
    preEl.replaceChildren(cursor);
    if (scrollHost) scrollHost.scrollTop = 0;
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
    clear,
  };
}

// -- Boot sequence ---------------------------------------------------
async function runBoot(s) {
  const { append, line, burst, typeOut, kernLine, emitPrompt, emitHelpLine } = s;

  // Cold-boot beat — the page just loaded; let it sit black for a
  // moment before the BIOS POST starts so the boot feels like it's
  // *starting*, not mid-stream.
  await sleep(900);

  await burst(
    [
      "rbitton BIOS v2.4.1  Copyright (C) 2026 Raphael Bitton",
      "BIOS Date: 02/14/2026",
      "Performing initial POST...",
      "CPU: AMD Threadripper PRO 7995WX  96 cores @ 5.1 GHz",
      "L1 Cache: 6 MB    L2 Cache: 96 MB    L3 Cache: 384 MB",
      "Memory Test: 65536M OK   ECC: Enabled   8ch @ 5200 MT/s",
      "Detecting SATA drives... none",
      "Detecting NVMe: SAMSUNG MZ-V9P2T0  990 PRO 2TB    OK",
      "Detecting NVMe: WD_BLACK SN850X 4TB              OK",
      "Detecting USB controllers... xHCI x2",
      "Detecting network controllers... Intel X710-T4 (4-port 10G)",
      "TPM 2.0: present and ready",
      "Secure Boot: enabled (db: 7 keys, dbx: 412 entries)",
      "Boot device: /dev/nvme0n1p2",
      "",
      "GNU GRUB version 2.12",
      " Arch Linux, with Linux rbitton-zfs",
      "Loading Linux rbitton-zfs ...",
      "Loading initial ramdisk ...",
      "Booting kernel...",
    ],
    { gap: 25, className: "post" },
  );

  // Beat between "Booting kernel..." and the dmesg spew — gives the
  // BIOS/GRUB section a moment to land before the kernel takes over.
  await sleep(1100);

  const kernelVer =
    (await Promise.race([
      kernelPromise,
      new Promise((r) => setTimeout(() => r(null), 500)),
    ])) || "7.0.1";
  const kernelTag = `${kernelVer}-rbitton-zfs`;

  const kernLines = [
    ["[    0.000000]", ` Linux version ${kernelTag} (rbitton@archlinux) #1 SMP`],
    ["[    0.000001]", ` Command line: BOOT_IMAGE=/vmlinuz root=ZFS=tank/root rw quiet`],
    ["[    0.000312]", " KERNEL supported cpus: AMD"],
    ["[    0.000487]", " BIOS-provided physical RAM map:"],
    ["[    0.000612]", " BIOS-e820: [mem 0x0000000000000000-0x000000000009ffff] usable"],
    ["[    0.000789]", " BIOS-e820: [mem 0x0000000000100000-0x000000007fedffff] usable"],
    ["[    0.001204]", " efi: EFI v2.70 by American Megatrends"],
    ["[    0.001553]", " SMBIOS 3.5.0 present."],
    ["[    0.002089]", " Hypervisor detected: none"],
    ["[    0.002612]", " tsc: Detected 5100.000 MHz processor"],
    ["[    0.003187]", " x86/fpu: Supporting XSAVE feature 0x001: 'x87 floating point'"],
    ["[    0.003421]", " x86/fpu: Supporting XSAVE feature 0x002: 'SSE registers'"],
    ["[    0.003703]", " x86/fpu: Supporting XSAVE feature 0x004: 'AVX registers'"],
    ["[    0.004012]", " x86/PAT: Configuration [0-7]: WB WC UC- UC WB WP UC- WT"],
    ["[    0.004587]", " ACPI: Early table checksum verification disabled"],
    ["[    0.005012]", " ACPI: RSDP 0x000000007FE2A000 000024 (v02 ALASKA)"],
    ["[    0.005334]", " ACPI: XSDT 0x000000007FE2A090 0000B4 (v01 ALASKA)"],
    ["[    0.006101]", " Memory: 65378844K/67012276K available (16384K kernel)"],
    ["[    0.006712]", " random: crng init done"],
    ["[    0.007301]", " Console: colour VGA+ 80x25"],
    ["[    0.007612]", " printk: console [tty0] enabled"],
    ["[    0.008211]", " smpboot: CPU0: AMD Ryzen Threadripper PRO 7995WX 96-Core Processor"],
    ["[    0.008789]", " microcode: CPU0: patch_level=0x0a601206"],
    ["[    0.009312]", " smp: Bringing up secondary CPUs ...", null, 280],
    ["[    0.011842]", " smp: Brought up 1 node, 96 CPUs"],
    ["[    0.012394]", " devtmpfs: initialized"],
    ["[    0.012891]", " clocksource: jiffies: mask: 0xffffffff max_cycles: 0xffffffff"],
    ["[    0.013421]", " PCI: Using configuration type 1 for base access"],
    ["[    0.014012]", " HugeTLB: registered 1.00 GiB page size, pre-allocated 0 pages"],
    ["[    0.014587]", " HugeTLB: registered 2.00 MiB page size, pre-allocated 0 pages"],
    ["[    0.015234]", " cryptd: max_cpu_qlen set to 1000"],
    ["[    0.015812]", " raid6: avx2x4   gen() 50345 MB/s", null, 180],
    ["[    0.016301]", " raid6: using algorithm avx2x4 gen() 50345 MB/s"],
    ["[    0.016912]", " iommu: Default domain type: Translated"],
    ["[    0.017421]", " PCI host bridge to bus 0000:00"],
    ["[    0.018012]", " pci_bus 0000:00: root bus resource [io  0x0000-0x0cf7]"],
    ["[    0.018612]", " hpet0: 8 comparators, 64-bit 14.318180 MHz counter"],
    ["[    0.019234]", " vgaarb: loaded"],
    ["[    0.019712]", " SCSI subsystem initialized"],
    ["[    0.020234]", " usbcore: registered new interface driver usbfs"],
    ["[    0.020712]", " usbcore: registered new interface driver hub"],
    ["[    0.021234]", " usbcore: registered new device driver usb"],
    ["[    0.022012]", " NetLabel: Initializing"],
    ["[    0.022612]", " clocksource: Switched to clocksource tsc-early"],
    ["[    0.023234]", " VFS: Disk quotas dquot_6.6.0"],
    ["[    0.023812]", " thermal_sys: Registered thermal governor 'step_wise'"],
    ["[    0.024421]", " NET: Registered PF_INET protocol family"],
    ["[    0.025012]", " IP idents hash table entries: 262144 (order: 9, 2097152 bytes)"],
    ["[    0.025712]", " TCP established hash table entries: 524288 (order: 10)"],
    ["[    0.026421]", " UDP hash table entries: 65536 (order: 9, 2097152 bytes)"],
    ["[    0.027012]", " NET: Registered PF_UNIX/PF_LOCAL protocol family"],
    ["[    0.027712]", " RAS: Correctable Errors collector initialized."],
    ["[    0.028421]", " Initialise system trusted keyrings"],
    ["[    0.029012]", " integrity: Platform Keyring initialized"],
    ["[    0.029612]", " Asymmetric key parser 'x509' registered"],
    ["[    0.030234]", " io scheduler mq-deadline registered"],
    ["[    0.030812]", " io scheduler kyber registered"],
    ["[    0.031421]", " io scheduler bfq registered"],
    ["[    0.032012]", " pcieport 0000:00:01.1: PME: Signaling with IRQ 26"],
    ["[    0.032612]", " nvme nvme0: pci function 0000:01:00.0"],
    ["[    0.033234]", " nvme nvme1: pci function 0000:02:00.0"],
    ["[    0.033912]", " nvme nvme0: 8/0/0 default/read/poll queues"],
    ["[    0.034512]", " nvme nvme0: Shutdown timeout set to 8 seconds"],
    ["[    0.035134]", "  nvme0n1: p1 p2 p3"],
    ["[    0.035812]", " xhci_hcd 0000:02:00.0: xHCI Host Controller"],
    ["[    0.036421]", " usb usb1: New USB device found, idVendor=1d6b, idProduct=0003"],
    ["[    0.037012]", " hub 1-0:1.0: USB hub found"],
    ["[    0.037612]", " ixgbe 0000:03:00.0: enabling device (0000 -> 0003)"],
    ["[    0.038234]", " ixgbe eth0: Intel X710-T4 10GbE, MAC 00:1b:21:af:c2:e9"],
    ["[    0.038912]", " tpm_crb MSFT0101:00: 2.0 TPM (device-id 0x9, rev-id 1)"],
    ["[    0.039612]", " EXT4-fs (nvme0n1p1): mounted filesystem with ordered data mode"],
    ["[    0.040234]", " SPL: Loaded module v2.2.3"],
    ["[    0.040812]", " ZFS: Loaded module v2.2.3, ZFS pool version 5000"],
    ["[    0.041421]", " zio: registered new pool I/O scheduler"],
    ["[    0.042012]", " zfs: importing pool 'tank'...", null, 480],
    ["[    0.052187]", " zfs: pool 'tank' imported (24T, RAIDZ2, 12 vdevs)"],
    ["[    0.052712]", " zfs: mounting tank/root on /"],
    ["[    0.053334]", " zed: ZFS Event Daemon online", null, 260],
    ["[    0.054012]", " systemd[1]: systemd 254.3-1-arch running in system mode"],
    ["[    0.054612]", " systemd[1]: Detected architecture x86-64."],
    ["[    0.055234]", " systemd[1]: Hostname set to <archlinux>."],
    ["[    0.055812]", " systemd[1]: Created slice User and Session Slice."],
    ["[    0.056421]", " systemd[1]: Starting systemd-udevd..."],
    ["[    0.057012]", " systemd[1]: Mounted /sys/kernel/debug."],
    ["[    0.057612]", " systemd[1]: Started Apply Kernel Variables."],
    ["[    0.058234]", " systemd[1]: Started Load Kernel Modules."],
    ["[    0.058912]", " audio0: composer_iface registered"],
    ["[    0.059512]", " flightsim: ILS receiver armed"],
    ["[    0.060134]", " skylantix: fleet interface online (12 nodes)"],
    ["[    0.060812]", " rbitton: identity module loaded", "identity"],
    ["[    0.061512]", " systemd[1]: Reached target Network is Online.", null, 220],
    ["[    0.062234]", " systemd[1]: Reached target Multi-User System."],
    ["[    0.062912]", " systemd[1]: Startup finished in 1.247s."],
  ];
  // 4th element on a kernLine entry is an extra dwell (ms) tacked on
  // after the normal jitter — used at the heavy moments where a real
  // kernel actually does work (SMP bring-up, raid6 bench, ZFS pool
  // import, kernel→userspace handoff, final target convergence).
  for (const [ts, rest, special, pause] of kernLines) {
    kernLine(ts, rest, special);
    await sleep(jitter(8, 24));
    if (pause) await sleep(pause);
  }

  // Let the last "Startup finished" line sit for a beat so the user
  // registers boot-complete before the screen wipes.
  await sleep(1400);

  // Real getty/agetty clears the console before printing the issue
  // banner — same effect here so the login feels like a fresh TTY.
  s.clear();
  await sleep(400);

  // Login
  await line("");
  await line(`Arch Linux ${kernelTag} (tty1)`, { gap: 80 });
  await line("");

  append("archlinux login: ");
  // Pause before "guest" types — the longer beat of the two; the
  // visitor reads the banner, then the prompt, then someone "decides"
  // to log in.
  await sleep(1200);
  await typeOut("guest", { className: "user-input", minMs: 50, maxMs: 120 });
  await sleep(200);
  await line("");

  append("Password: ");
  // Shorter than the username beat — by this point the visitor knows
  // a password is coming next, so the pause just needs to feel
  // deliberate rather than dramatic.
  await sleep(450);
  // 16 chars — current common-sense recommendation for a strong password.
  // Same cadence as the username — humans type passwords at roughly the
  // speed they type their name, just without the looking-down-at-keys.
  await typeOut("****************", {
    className: "user-input",
    minMs: 50,
    maxMs: 120,
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

  await sleep(80);

  // MOTD — once the user is logged in, the rest of the reveal moves
  // fast. The dramatic pauses are saved for between phases (boot,
  // login, prompt-thinking).
  await line("Welcome to my home on the internet.", {
    className: "motd",
    gap: 4,
  });
  await line("", { gap: 16 });

  const banner = [
    " ____             _                _   ____  _ _   _              ",
    "|  _ \\ __ _ _ __ | |__   __ _  ___| | | __ )(_) |_| |_ ___  _ __  ",
    "| |_) / _` | '_ \\| '_ \\ / _` |/ _ \\ | |  _ \\| | __| __/ _ \\| '_ \\ ",
    "|  _ < (_| | |_) | | | | (_| |  __/ | | |_) | | |_| || (_) | | | |",
    "|_| \\_\\__,_| .__/|_| |_|\\__,_|\\___|_| |____/|_|\\__|\\__\\___/|_| |_|",
    "           |_|                                                    ",
  ];
  for (const ln of banner) await line(ln, { gap: 4, className: "motd" });
  await line("", { gap: 16 });
  await line(
    "    Raphael Bitton — student, system orchestrator, occasional composer, explorer.",
    { className: "motd", gap: 16 },
  );
  await line("    Founder & Lead Systems Engineer · Skylantix.", {
    className: "dim",
    gap: 4,
  });
  await line("    Lead Systems Architect · addictd.ai.", {
    className: "dim",
    gap: 4,
  });
  await line("", { gap: 16 });
  const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  for (const ln of fortune.lines) {
    await line("    " + ln, { className: "fortune", gap: 16 });
  }
  await line("                                        — " + fortune.author, {
    className: "fortune",
    gap: 4,
  });
  await line("", { gap: 16 });

  // First prompt sits for a beat — the visitor gets to read the
  // banner, then "guest" appears to type `help` like they're showing
  // you around.
  emitPrompt();
  await sleep(900);

  await typeOut("help", { className: "user-input", minMs: 30, maxMs: 70 });
  // Beat after Enter — long enough to feel deliberate (the shell is
  // "looking up" the command), short enough that the help reveal
  // doesn't drag.
  await sleep(80);
  await line("", { gap: 10 });

  await printHelp(s);

  // The boot "ran" `help` on the user's behalf — seed history with it
  // so ArrowUp at the first prompt recalls it like any other command.
  if (commandHistory[commandHistory.length - 1] !== "help") {
    commandHistory.push("help");
  }

  // Idle prompt — REPL will attach here.
  emitPrompt();
}

// Used by both the boot's auto-`help` and the REPL `help` command.
// The intro/outro lines exist so non-terminal visitors aren't left
// staring at a list with no context for what to do with it.
async function printHelp(s) {
  const { line, emitHelpLine } = s;
  await line("To run a command, type the name on the left and press Enter:", {
    className: "dim",
    gap: 4,
  });
  await line("", { gap: 4 });
  for (const [cmd, desc] of HELP_ITEMS) {
    await emitHelpLine(cmd, desc);
  }
  await line("", { gap: 4 });
  await line("(new here? try `whoami` — type it, then press Enter.)", {
    className: "dim",
    gap: 4,
  });
  await line("", { gap: 4 });
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
  meditations: async (s) => {
    const { line, streamLine } = s;
    await streamLine("meditations:", { className: "dim" });
    await line("");
    await streamLine("  nothing published yet — first essays land soon.");
    await line("");
    await streamLine(
      "(they'll live at rbitton.com/m/<slug> when written.)",
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
  source: async (s) => {
    window.open(
      "https://git.skylantix.com/rbitton/new-website",
      "_blank",
      "noopener,noreferrer",
    );
    s.append("-> ", "dim");
    s.emitLink(
      "git.skylantix.com/rbitton/new-website",
      "https://git.skylantix.com/rbitton/new-website",
    );
    s.append("\n");
    await s.line("", { gap: 40 });
  },
};

// -- REPL ------------------------------------------------------------
let activeScreen = null;
let inputSpan = null;

// Bash-style command history. `historyIndex === null` means the user
// is typing fresh; otherwise it points at the entry currently shown
// in stdin. `historyDraft` preserves whatever was being typed before
// the user pressed ArrowUp, so ArrowDown past the newest entry can
// restore it.
const commandHistory = [];
let historyIndex = null;
let historyDraft = "";

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

  // Push into history (HISTCONTROL=ignoredups behavior — skip if it's
  // the same as the previous entry). Reset the nav cursor either way.
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
  abortSignal = controller.signal;
  activeAbortController = controller;

  try {
    if (cmd === "") {
      // no-op
    } else if (lower === "help") {
      await printHelp(s);
    } else if (lower === "reboot") {
      // Real-terminal feel: blank the pane and run the entire boot
      // sequence again from POST. We deliberately don't await the
      // boot here — re-attaching input is the boot's responsibility,
      // mirroring how it's set up at module load.
      const pre = s.cursor.parentElement;
      endInput();
      pre.replaceChildren();
      if (pre.parentElement) pre.parentElement.scrollTop = 0;
      const newS = makeScreen(pre);
      // Hand activeScreen off so the trailing prompt-emit check at
      // the bottom of executeCommand skips this old screen.
      activeScreen = newS;
      runBoot(newS)
        .catch((err) =>
          newS.append(`\n[boot] ${err.message}\n`, "err"),
        )
        .finally(() => startInput(newS));
      return;
    } else if (lower === "exit" || lower === "logout") {
      await s.streamLine("logout");
      await s.line("");
      endInput();
      await sleep(150);
      window.close();
      // window.close() is a no-op for tabs the user opened directly,
      // which is most of them. Leave an SSH-style close line so the
      // visitor isn't staring at a frozen prompt wondering what's up.
      await s.streamLine("Connection to rbitton.com closed.", {
        className: "dim",
      });
      await s.line("");
      activeScreen = null;
      return;
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
        `Linux archlinux ${kv}-rbitton-zfs #1 SMP x86_64 GNU/Linux`,
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
    } else if (lower === "sudo" || lower.startsWith("sudo ")) {
      await s.streamLine(
        "Permission denied. This incident will be reported.",
        { className: "err" },
      );
      await s.line("");
      // never gonna give you up
      window.open(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1",
        "_blank",
        "noopener,noreferrer",
      );
    } else if (lower === "theme" || lower.startsWith("theme ")) {
      const arg = cmd.slice("theme".length).trim().toLowerCase();
      const current = document.documentElement.dataset.theme || THEMES[0];
      if (!arg) {
        await s.streamLine("available themes:", { className: "dim" });
        await s.line("");
        for (const name of THEMES) {
          const marker = name === current ? "  *" : "";
          await s.streamLine(`  ${name}${marker}`);
        }
        await s.line("");
        await s.streamLine(`(usage: theme <name>)`, { className: "dim" });
        await s.line("");
      } else if (THEMES.includes(arg)) {
        document.documentElement.dataset.theme = arg;
        try {
          localStorage.setItem("theme", arg);
        } catch {}
        await s.streamLine(`theme: ${arg}`, { className: "dim" });
        await s.line("");
      } else {
        await s.streamLine(
          `theme: '${arg}' not found. Try \`theme\` for the list.`,
          { className: "err" },
        );
        await s.line("");
      }
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
      return;
    }

    // ArrowUp / ArrowDown — bash-style history navigation. Skip when
    // any modifier is held so the browser's own shortcuts still work.
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
      // Move the native input's caret to the end so the next
      // keystroke appends rather than landing wherever it was.
      stdin.setSelectionRange(stdin.value.length, stdin.value.length);
      return;
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
