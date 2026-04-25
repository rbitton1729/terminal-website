"use strict";

let vmActive = false;
let vmEmulator = null;
let vmKeyHandler = null;
let v86Loaded = null;

export function isVmActive() { return vmActive; }

function loadV86Once() {
  if (v86Loaded) return v86Loaded;
  v86Loaded = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "v86/libv86.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("failed to load v86 (network or missing file?)"));
    document.head.appendChild(script);
  });
  return v86Loaded;
}

function buildVmScreenChildren(vmScreen) {
  vmScreen.replaceChildren();
  const text = document.createElement("div");
  text.className = "vm-text";
  text.style.whiteSpace = "pre";
  text.style.fontFamily = "inherit";
  const canvas = document.createElement("canvas");
  canvas.className = "vm-canvas";
  vmScreen.appendChild(text);
  vmScreen.appendChild(canvas);
}

// `s` is the active screen; `onShutdown(s)` re-attaches REPL input
// after the VM closes (provided by the caller to avoid an import cycle).
export async function launchTinyCore(s, onShutdown) {
  await s.streamLine("loading TinyCore Linux...", { className: "dim" });
  await s.line("");

  try {
    await loadV86Once();
  } catch (err) {
    await s.streamLine(err.message, { className: "err" });
    await s.line("");
    onShutdown(s);
    return;
  }

  vmActive = true;

  const stdinEl = document.getElementById("stdin");
  if (stdinEl) stdinEl.blur();

  const screenPre = document.getElementById("screen");
  if (screenPre) screenPre.style.display = "none";

  const vmEl = document.getElementById("vm");
  vmEl.hidden = false;

  // Boot from CD via El Torito. The ISO has no MBR signature so it
  // can't be mounted as hda. Boot order 0x123 = CD, FDD, HDD.
  // Memory must be generous (256MB) so TinyCore's /init can extract
  // core.gz onto tmpfs — undersizing causes the misleading
  // "can't find init" message.
  vmEmulator = new V86({
    wasm_path: "v86/v86.wasm",
    memory_size: 256 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    bios: { url: "v86/seabios.bin" },
    vga_bios: { url: "v86/vgabios.bin" },
    cdrom: { url: "tiny.iso", size: 20459520, async: false },
    boot_order: 0x123,
    screen_container: document.getElementById("vm-screen"),
    autostart: true,
  });

  vmKeyHandler = (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "q") {
      e.preventDefault();
      e.stopPropagation();
      shutdownVM(s, onShutdown);
    }
  };
  // Capture phase so we beat v86's own keyboard listener.
  document.addEventListener("keydown", vmKeyHandler, true);
}

function shutdownVM(s, onShutdown) {
  if (vmEmulator) {
    try { vmEmulator.destroy(); } catch {}
    vmEmulator = null;
  }
  if (vmKeyHandler) {
    document.removeEventListener("keydown", vmKeyHandler, true);
    vmKeyHandler = null;
  }
  vmActive = false;

  const vmEl = document.getElementById("vm");
  vmEl.hidden = true;
  const vmScreen = document.getElementById("vm-screen");
  if (vmScreen) buildVmScreenChildren(vmScreen);
  const screenPre = document.getElementById("screen");
  if (screenPre) screenPre.style.display = "";

  s.append("\n");
  s.append("[VM shut down]\n", "dim");
  onShutdown(s);
}
