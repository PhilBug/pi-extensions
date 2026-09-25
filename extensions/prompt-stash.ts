   import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

   // Claude Code's chat:stash: one slot, text in editor -> stash, empty editor -> restore.
   // Module-level so it survives /new, /resume, /fork; /reload drops it.
   let stashed: string | undefined;

   // A held key autorepeats and pi does not filter repeats, so ignore rapid toggles.
   let lastToggleAt = 0;

   function toggle(ctx: ExtensionContext) {
      if (!ctx.hasUI) return;
      const now = Date.now();
      const repeat = now - lastToggleAt < 300;
      lastToggleAt = now;
      if (repeat) return;

      const text = ctx.ui.getEditorText();
      if (text.trim() !== "") {
         stashed = text;
         ctx.ui.setEditorText("");
         ctx.ui.setWidget("prompt-stash", (_tui, theme) => ({
            render: (width: number) => {
               const label = "› stashed";
               return [" ".repeat(Math.max(0, width - label.length - 1)) + theme.fg("dim", label)];
            },
            invalidate() {},
         }));
      } else if (stashed !== undefined) {
         ctx.ui.setEditorText(stashed);
         stashed = undefined;
         ctx.ui.setWidget("prompt-stash", undefined);
      }
   }

   export default function (pi: ExtensionAPI) {
      // Shadows the built-in app.thinking.save (ctrl+s) in the main editor.
      pi.registerShortcut("ctrl+s", {
         description: "Stash the prompt draft, or restore the stashed draft",
         handler: toggle,
      });
   }