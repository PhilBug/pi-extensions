# Schedule cmux-meta in Pi

Before enabling a timer in META:

1. Install the `PhilBug/pi-extensions` Pi package and run `/reload`. The package supplies the extension and `cmux-meta-observer`. Use Bun 1.4.5 or newer (tested with 1.4.5). Keep one META session per workspace.
2. Require `fallbackSubagent: "none"` in the effective `pi-subagents` settings; never schedule this observer if a missing agent can fall back to a broader agent. Do not change the setting without user approval. Verify that `Agent` exposes `schedule_precheck` and that the observer has only `cmux_meta_changes` and `cmux_meta_ack`. If any check fails, report it and stop.
3. Run `status` and `ack` all assessed rows to save a baseline. Report any unsaved rows before registering the timer.

Register one `Agent` job after the user requests it: `subagent_type: "cmux-meta-observer"`, `schedule_precheck: "cmux-changed"`, `description: "cmux-meta changes"`, `prompt: "Review and report changes in the confirmed cmux panels."` Set `schedule` to their interval or offer `30m`. Use their model if specified. Never substitute `general-purpose`.

Done when the scheduler returns a job ID and next run. Inspect or cancel from `/agents → Scheduled jobs`. Resume the original session to restore its timer. A recreated workspace needs fresh target confirmation.

The precheck compares fingerprints and writes no observations. If it detects a difference, the observer reads the latest changed output, not an exact replay of the precheck. A worker that keeps printing can wake the model each interval; a run may show a completion notification even if there are no meaningful changes. SQLite keeps the approved target pairs, labels, fingerprints, board notes and acknowledgment tokens, not raw captures. `CMUX_META_STATE_DIR` isolates test state from normal state.
