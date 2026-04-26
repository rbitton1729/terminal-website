"use strict";

import { THEMES, FORTUNES, kernelPromise, printHelp } from "../boot.js";

// Output handlers for the link-opening commands. The markdown-driven
// content commands (whoami, cv, now, projects, meditations, mail) live
// in commands/info.js and read from content/ via fetchFile.
export const OUTPUTS = {
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

export async function runUname(s) {
  const kv =
    (await Promise.race([kernelPromise, Promise.resolve(null)])) || "7.0.1";
  await s.streamLine(
    `Linux archlinux ${kv}-rbitton-zfs #1 SMP x86_64 GNU/Linux`,
  );
  await s.line("");
}

export async function runFortune(s) {
  const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  for (const ln of f.lines) await s.streamLine(ln, { className: "fortune" });
  await s.streamLine(
    `                                          ${f.author}`,
    { className: "fortune" },
  );
  await s.line("");
}

export async function runSudo(s) {
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
}

export async function runTheme(s, cmd) {
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
    try { localStorage.setItem("theme", arg); } catch {}
    await s.streamLine(`theme: ${arg}`, { className: "dim" });
    await s.line("");
  } else {
    await s.streamLine(
      `theme: '${arg}' not found. Try \`theme\` for the list.`,
      { className: "err" },
    );
    await s.line("");
  }
}

export async function runHelp(s) {
  await printHelp(s);
}
