import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Claude Code's chat:stash: one slot, text in editor -> stash, empty editor -> restore.
// Persisted to disk so it also survives /reload and restarts, not just /new, /resume, /fork.
const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const STASH_FILE = path.join(agentDir, "prompt-stash.txt");

function readStash(): string | undefined {
   try {
      const text = fs.readFileSync(STASH_FILE, "utf8");
      return text === "" ? undefined : text;
   } catch {
      return undefined;
   }
}

function writeStash(text: string | undefined) {
   try {
      if (text === undefined) fs.rmSync(STASH_FILE, { force: true });
      else fs.writeFileSync(STASH_FILE, text);
   } catch {
      // Unwritable agent dir: stash still works for this process, just not across reloads.
   }
}

// A held key autorepeats and pi does not filter repeats, so ignore rapid toggles.
let lastToggleAt = 0;
let stashed: string | undefined = readStash();

function showWidget(ctx: ExtensionContext) {
   ctx.ui.setWidget("prompt-stash", (_tui, theme) => ({
      render: (width: number) => {
         const label = "› stashed";
         return [" ".repeat(Math.max(0, width - label.length - 1)) + theme.fg("dim", label)];
      },
      invalidate() {},
   }));
}

function toggle(ctx: ExtensionContext) {
   if (!ctx.hasUI) return;
   const now = Date.now();
   const repeat = now - lastToggleAt < 300;
   lastToggleAt = now;
   if (repeat) return;

   const text = ctx.ui.getEditorText();
   if (text.trim() !== "") {
      stashed = text;
      writeStash(text);
      ctx.ui.setEditorText("");
      showWidget(ctx);
   } else if (stashed !== undefined) {
      ctx.ui.setEditorText(stashed);
      stashed = undefined;
      writeStash(undefined);
      ctx.ui.setWidget("prompt-stash", undefined);
   }
}

export default function (pi: ExtensionAPI) {
   // Shadows the built-in app.thinking.save (ctrl+s) in the main editor.
   pi.registerShortcut("ctrl+s", {
      description: "Stash the prompt draft, or restore the stashed draft",
      handler: toggle,
   });

   // After /reload or a restart, re-show the indicator if a draft is on disk.
   pi.on("session_start", (_event, ctx) => {
      if (ctx.hasUI && stashed !== undefined) showWidget(ctx);
   });
}
