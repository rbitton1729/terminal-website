"use strict";

import { OUTPUTS, runUname, runFortune, runSudo, runTheme, runHelp } from "./links.js";
import { registerInfo } from "./info.js";
import { registerNav } from "./nav.js";
import { registerSystem } from "./system.js";

// Map<name, { handler: async (s, rawCmd) => void, group: "core" | "unix" }>
const registry = new Map();

export function register(name, handler, group = "unix") {
  registry.set(name, { handler, group });
}

export function getCommand(name) {
  return registry.get(name);
}

export function listCommands(group) {
  if (!group) return Array.from(registry.keys()).sort();
  return Array.from(registry.entries())
    .filter(([, v]) => v.group === group)
    .map(([k]) => k)
    .sort();
}

export function registerBuiltins() {
  for (const [name, handler] of Object.entries(OUTPUTS)) {
    register(name, handler, "core");
  }
  registerInfo();
  registerNav();
  registerSystem();
  register("uname", runUname, "unix");
  register("fortune", runFortune, "unix");
  register("sudo", runSudo, "core");
  register("theme", (s, cmd) => runTheme(s, cmd), "core");
  register("help", runHelp, "core");
}
