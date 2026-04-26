"use strict";

import { sleep, jitter, setAbortSignal } from "./screen.js";
import { pathLabel } from "./content.js";

// While boot is running, this controller is set so Escape (handled in
// repl.js) can abort the in-flight sleeps and skip ahead to the prompt.
let bootController = null;
export function getBootController() { return bootController; }

const BANNER = [
  " ____             _                _   ____  _ _   _              ",
  "|  _ \\ __ _ _ __ | |__   __ _  ___| | | __ )(_) |_| |_ ___  _ __  ",
  "| |_) / _` | '_ \\| '_ \\ / _` |/ _ \\ | |  _ \\| | __| __/ _ \\| '_ \\ ",
  "|  _ < (_| | |_) | | | | (_| |  __/ | | |_) | | |_| || (_) | | | |",
  "|_| \\_\\__,_| .__/|_| |_|\\__,_|\\___|_| |____/|_|\\__|\\__\\___/|_| |_|",
  "           |_|                                                    ",
];

// Welcome screen: MOTD, banner, fortune, help. Same content for the
// normal boot flow and the Escape-skipped flow; `instant` collapses
// all gaps so the skipped render appears in one frame.
async function renderWelcome(s, fortune, { instant = false } = {}) {
  const g = (n) => (instant ? 0 : n);
  const { line } = s;

  await line("Welcome to my home on the internet.", { className: "motd", gap: g(4) });
  await line("", { gap: g(16) });

  for (const ln of BANNER) await line(ln, { gap: g(4), className: "motd" });
  await line("", { gap: g(16) });

  await line(
    "    Raphael Bitton - student, system orchestrator, occasional composer, explorer.",
    { className: "motd", gap: g(16) },
  );
  await line("    Founder & Lead Systems Engineer · Skylantix.", { className: "dim", gap: g(4) });
  await line("    Lead Systems Architect · addictd.ai.", { className: "dim", gap: g(4) });
  await line("", { gap: g(16) });

  for (const ln of fortune.lines) {
    await line("    " + ln, { className: "fortune", gap: g(16) });
  }
  await line("                                        - " + fortune.author, {
    className: "fortune", gap: g(4),
  });
  await line("", { gap: g(16) });

  await printHelp(s, { instant });
}

export const HELP_ITEMS = [
  ["whoami",       "about me"],
  ["projects",     "what I've built"],
  ["meditations",  "essays and reflections"],
  ["resume",       "download my résumé (last updated Nov 2025)"],
  ["paper",        "download my airplane-classifier paper (draft)"],
  ["mail",         "get in touch"],
  ["gitlab",       "my self-hosted git"],
  ["github",       "profile on GitHub"],
  ["flights",      "see my flight map"],
  ["source",       "this site's source code"],
  ["boot tinycore","drop into a real Linux VM (browser-only)"],
  ["theme <name>", "switch color scheme"],
];

export const THEMES = [
  "gruvbox-dark", "gruvbox-light", "solarized-dark", "solarized-light",
  "nord", "dracula", "tokyo-night",
];

export const FORTUNES = [
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

export const ipPromise = fetch("https://api4.ipify.org?format=json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => d?.ip || null)
  .catch(() => null);

export const kernelPromise = fetch(
  "https://api.github.com/repos/gregkh/linux/tags?per_page=20",
)
  .then((r) => (r.ok ? r.json() : null))
  .then((tags) => {
    if (!Array.isArray(tags)) return null;
    const stable = tags.find((t) => /^v\d+\.\d+(\.\d+)?$/.test(t.name));
    return stable ? stable.name.replace(/^v/, "") : null;
  })
  .catch(() => null);

export async function runBoot(s) {
  // Yield one microtask before installing the abort signal. The `reboot`
  // command in repl.js fires runBoot from inside executeCommand's
  // try/finally; without this yield, executeCommand's finally would run
  // setAbortSignal(null) right after runBoot's synchronous setup,
  // clobbering the boot's signal and breaking Escape-to-skip on reboot.
  await null;

  const { append, line, burst, typeOut, kernLine, emitPrompt } = s;

  // Pick fortune up front so both the normal and skipped flows show the
  // same one (in case Escape lands mid-banner).
  const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];

  // Wire abort: Escape (handled in repl.js) calls bootController.abort(),
  // which makes every in-flight `sleep` reject with AbortError. We catch
  // that and jump to the instant render below.
  const controller = new AbortController();
  bootController = controller;
  setAbortSignal(controller.signal);

  try {
    await runBootAnimation(s, fortune);
  } catch (err) {
    if (err.name !== "AbortError") {
      setAbortSignal(null);
      bootController = null;
      throw err;
    }
    // Skipped - clear and slam the welcome state to the screen instantly.
    setAbortSignal(null);
    s.clear();
    await renderWelcome(s, fortune, { instant: true });
  } finally {
    setAbortSignal(null);
    bootController = null;
  }

  emitPrompt(pathLabel());
}

async function runBootAnimation(s, fortune) {
  const { append, line, burst, typeOut, kernLine } = s;

  // Cold-boot beat - let the page sit black for a moment before BIOS POST,
  // so the boot feels like it's *starting*, not mid-stream.
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

  // Beat between "Booting kernel..." and the dmesg spew.
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
  // 4th element is an extra dwell (ms) tacked on after the normal jitter -
  // used at moments where a real kernel actually does work (SMP bring-up,
  // raid6 bench, ZFS pool import, kernel→userspace handoff).
  for (const [ts, rest, special, pause] of kernLines) {
    kernLine(ts, rest, special);
    await sleep(jitter(8, 24));
    if (pause) await sleep(pause);
  }

  // Let the last "Startup finished" line sit before the screen wipes.
  await sleep(1400);

  // Real getty/agetty clears the console before printing the issue banner.
  s.clear();
  await sleep(400);

  await line("");
  await line(`Arch Linux ${kernelTag} (tty1)`, { gap: 80 });
  await line("");

  append("archlinux login: ");
  // Long beat - the visitor reads the banner, then "decides" to log in.
  await sleep(1200);
  await typeOut("guest", { className: "user-input", minMs: 50, maxMs: 120 });
  await sleep(200);
  await line("");

  append("Password: ");
  await sleep(450);
  // 16 chars - current common-sense recommendation for a strong password.
  await typeOut("****************", {
    className: "user-input", minMs: 50, maxMs: 120,
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

  // Help lives in the MOTD so the visitor sees "type X to run Y" before
  // any prompt appears - no ambiguity about when the auto-boot ends and
  // their turn begins.
  await renderWelcome(s, fortune);
}

export async function printHelp(s, { instant = false } = {}) {
  const g = (n) => (instant ? 0 : n);
  const { line, emitHelpLine } = s;
  await line("To run a command, type the name on the left and press Enter:", {
    className: "dim", gap: g(4),
  });
  await line("", { gap: g(4) });
  for (const [cmd, desc] of HELP_ITEMS) {
    await emitHelpLine(cmd, desc, { gap: g(4) });
  }
  await line("", { gap: g(4) });
  await line("(new here? try `whoami` - type it, then press Enter.)", {
    className: "dim", gap: g(4),
  });
  await line("", { gap: g(4) });
}
