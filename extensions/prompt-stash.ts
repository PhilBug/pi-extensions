import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Claude Code's chat:stash: one slot, text in editor -> stash, empty editor -> restore.
// One slot per session: keyed by session id under <agentDir>/prompt-stash/, so drafts
// never leak between sessions, terminals, or projects, yet still survive /reload —
// and come back after a restart when the same session is resumed.

const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const STASH_DIR = path.join(agentDir, "prompt-stash");

function stashPath(ctx: ExtensionContext): string | undefined {
   const id = ctx.sessionManager.getSessionId();
   if (!id) return undefined;
   return path.join(STASH_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`);
}

function readStash(ctx: ExtensionContext): string | undefined {
   const file = stashPath(ctx);
   if (!file) return undefined;
   try {
      const text = fs.readFileSync(file, "utf8");
      return text === "" ? undefined : text;
   } catch {
      return undefined;
   }
}

function writeStash(ctx: ExtensionContext, text: string | undefined) {
   const file = stashPath(ctx);
   if (!file) return;
   try {
      if (text === undefined) {
         fs.rmSync(file, { force: true });
      } else {
         fs.mkdirSync(STASH_DIR, { recursive: true });
         fs.writeFileSync(file, text);
      }
   } catch {
      // Unwritable agent dir: stash still works for this process, just not across reloads.
   }
}

// Drop slots whose session is gone (or at least untouched) for over 30 days.
function pruneStash() {
   const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
   try {
      for (const name of fs.readdirSync(STASH_DIR)) {
         if (!name.endsWith(".txt")) continue;
         const file = path.join(STASH_DIR, name);
         if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
      }
   } catch {
      // No stash dir yet, or unreadable: nothing to prune.
   }
}

// A held key autorepeats and pi does not filter repeats, so ignore rapid toggles.
let lastToggleAt = 0;

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
      writeStash(ctx, text);
      ctx.ui.setEditorText("");
      showWidget(ctx);
   } else {
      const stashed = readStash(ctx);
      if (stashed !== undefined) {
         ctx.ui.setEditorText(stashed);
         writeStash(ctx, undefined);
         ctx.ui.setWidget("prompt-stash", undefined);
      }
   }
}

export default function (pi: ExtensionAPI) {
   // Shadows the built-in app.thinking.save (ctrl+s) in the main editor.
   pi.registerShortcut("ctrl+s", {
      description: "Stash the prompt draft, or restore the stashed draft",
      handler: toggle,
   });

   // After /reload, /new, /resume, or a restart: show or clear the indicator
   // depending on whether this session has a draft on disk.
   pi.on("session_start", (_event, ctx) => {
      if (!ctx.hasUI) return;
      if (readStash(ctx) !== undefined) showWidget(ctx);
      else ctx.ui.setWidget("prompt-stash", undefined);
   });

   pruneStash();
}
