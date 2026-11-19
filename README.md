# pi-extensions

Personal extensions for the [pi](https://pi.dev) coding agent.

| Extension                                 | What it does                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [prompt-stash](#prompt-stash)             | Stash the prompt draft with <kbd>Ctrl</kbd>+<kbd>S</kbd> and restore it later, like Claude Code    |
| [save-default-model](#save-default-model) | `/model-default` opens the `/model` picker and saves the choice as the default for new sessions    |
| [hide-bedrock](#hide-bedrock)             | Hides the Amazon Bedrock provider that an ambient `AWS_PROFILE` turns on, and a few retired models |
| [cmux-meta](#cmux-meta)                   | Read existing cmux panels, compare their status, and draft replies from a META workspace           |

## Install

```bash
pi install git:github.com/PhilBug/pi-extensions
```

Run `/reload` in pi afterwards. To select individual resources, use [Pi package filters](https://pi.dev/docs/latest/packages#select-package-resources).

Update with `pi update git:github.com/PhilBug/pi-extensions`.

---

## prompt-stash

Set a half-written prompt aside, ask something else, then bring the draft back.

| Editor state           | <kbd>Ctrl</kbd>+<kbd>S</kbd> does                                   |
| ---------------------- | ------------------------------------------------------------------- |
| Has text               | Stashes the text, clears the editor, and shows `› stashed` above it |
| Empty, draft stashed   | Restores the draft                                                  |
| Empty, nothing stashed | Nothing                                                             |

> [!NOTE]
> - One slot per session, so drafts never leak between sessions, terminals, or projects.
> - Slots are persisted under `~/.pi/agent/prompt-stash/` (or `$PI_CODING_AGENT_DIR`), so the draft survives `/reload`, and comes back after a restart when you resume the same session. `/new`, `/resume` of another session, and `/fork` switch slots; unused slots are pruned after 30 days.
> - <kbd>Ctrl</kbd>+<kbd>S</kbd> replaces pi's built-in `app.thinking.save` in the main editor. pi warns about this on load.

---

## save-default-model

`/model` changes the model for the current session only. `/model-default` opens the same fuzzy picker, switches to the selected model, and saves it with the current thinking level to global `settings.json`, so new sessions start with them. `/model-default <search>` prefills the search.

This does the same as <kbd>Ctrl</kbd>+<kbd>S</kbd> in the `/model` and `/thinking` pickers, without needing that shortcut.

---

## hide-bedrock

pi turns on its built-in Amazon Bedrock provider whenever `AWS_PROFILE` is set, which fills `/model` with Bedrock models. This extension registers Bedrock with an empty model list, so they disappear.

It also:

- hides the retired `claude-fable-5-1` model from the `anthropic` and `github-copilot` providers (edit `HIDDEN_MODEL_IDS` to change the list);
- rebuilds the Ctrl+P model cycle from `enabledModels` on `/reload`, which pi does not do on its own.

## cmux-meta

Run `/skill:cmux-meta status` from a META workspace and confirm the panels to track. The skill requires cmux and Bun 1.4.5 or later. It reads panels without sending input and stores the approved targets and status summaries locally. `changes` shows meaningful differences; `reply` drafts text for you to copy.

Installation does not start a timer. To enable one, follow the [schedule reference](skills/cmux-meta/references/schedule.md). It requires a `pi-subagents` build with `schedule_precheck` and a restricted observer that cannot fall back to a more privileged agent.

## Development

```bash
bun install
bun run check   # Biome lint + format check, same as CI
bun run fix     # apply fixes and formatting
bun test       # run the cmux-meta fixture tests
```
