"use strict";

import { register } from "./index.js";

async function idCmd(s) {
  await s.streamLine(
    "uid=1000(guest) gid=1000(guest) groups=1000(guest),998(wheel)",
  );
  await s.line("");
}

async function hostnameCmd(s) {
  await s.streamLine("archlinux");
  await s.line("");
}

async function dateCmd(s) {
  // Sample shape: "Fri Apr 25 12:34:56 PM CDT 2026"
  const d = new Date();
  const opts = {
    weekday: "short", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true, timeZoneName: "short", year: "numeric",
  };
  await s.streamLine(d.toLocaleString("en-US", opts));
  await s.line("");
}

export function registerSystem() {
  register("id",       idCmd,       "unix");
  register("hostname", hostnameCmd, "unix");
  register("date",     dateCmd,     "unix");
}
