"use strict";

import { fitFontToViewport, installViewportListeners, makeRePinPrompt } from "./viewport.js";
import { makeScreen } from "./screen.js";
import { runBoot } from "./boot.js";
import { setupStdin, startInput, getActiveScreen } from "./repl.js";
import { registerBuiltins } from "./commands/index.js";

registerBuiltins();

fitFontToViewport();
installViewportListeners(makeRePinPrompt(getActiveScreen));

setupStdin();
const boot = makeScreen(document.getElementById("screen"));
runBoot(boot)
  .catch((err) => {
    boot.append(`\n[boot] unrecoverable error: ${err.message}\n`, "err");
  })
  .finally(() => {
    startInput(boot);
  });
