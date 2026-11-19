import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import precheck from "../../../extensions/cmux-meta.ts";

const script = fileURLToPath(new URL("./cmux-meta.ts", import.meta.url));

test("confirmed pairs persist, observations are single-use, and unacknowledged changes retry", () => {
	const dir = mkdtempSync(join(tmpdir(), "cmux-meta-test-"));
	const [meta, window, work, surface, other, otherSurface] = Array.from({ length: 6 }, () => randomUUID());
	const tree = (present = true) =>
		writeFileSync(
			join(dir, "tree"),
			JSON.stringify({
				caller: { workspace_id: meta, window_id: window },
				windows: [
					{
						id: window,
						workspaces: [
							{ id: meta, title: "META", panes: [] },
							{ id: work, title: "Worker", panes: [{ surfaces: present ? [{ id: surface, type: "terminal" }] : [] }] },
							{ id: other, title: "Worker", panes: [{ surfaces: [{ id: otherSurface, type: "terminal" }] }] },
						],
					},
				],
			}),
		);
	const screen = (text: string) => writeFileSync(join(dir, "screen"), text);
	const fake = join(dir, "cmux");
	writeFileSync(
		fake,
		`#!/bin/sh
case "$1" in
  --json) exec /bin/cat "$FIXTURE/tree" ;;
  read-screen) [ "$2/$3/$4/$5" = "--workspace/$PAIR" ] || exit 17
     if [ "$#" = 5 ]; then printf 'VIEWPORT\n';
     elif [ "$6/$7" != '--lines/60' ]; then exit 19; fi
     exec /bin/cat "$FIXTURE/screen" ;;
  *) exit 18 ;;
esac
`,
	);
	chmodSync(fake, 0o700);
	const env = {
		...process.env,
		PATH: `${dir}:${process.env.PATH}`,
		FIXTURE: dir,
		PAIR: `${work}/--surface/${surface}`,
		CMUX_WORKSPACE_ID: meta,
		CMUX_META_STATE_DIR: dir,
	};
	const run = (args: string[], stdin?: string) =>
		Bun.spawnSync([process.execPath, script, ...args], {
			env,
			stdin: stdin ? Buffer.from(stdin) : undefined,
			stdout: "pipe",
			stderr: "pipe",
		});
	const parsed = (result: ReturnType<typeof run>) => {
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
		return JSON.parse(result.stdout.toString());
	};
	const json = (...args: string[]) => parsed(run(args));
	const ack = ({ token, observations: [o] }: ReturnType<typeof json>, state: string, note: string, command = "ack") =>
		parsed(run([command, token, "-"], JSON.stringify([{ surface: o.surface, digest: o.digest, state, note }])));

	tree();
	expect(json("list").candidates.map((c: { workspace: string }) => c.workspace)).toEqual([work, other]);
	expect(run(["track", other, surface]).exitCode).toBe(1);
	expect(run(["track", meta, surface]).exitCode).toBe(1);
	json("track", work.toUpperCase(), surface.toUpperCase());
	expect(json("list").tracked[0].surface).toBe(surface);
	screen("Initial harmless evidence\n  12s · running\n");
	const baseline = json("status");
	expect(ack(baseline, "working", "Initial work")).toEqual({ saved: 1, stale: 0 });
	const initial = baseline.observations[0];
	expect(
		run(["ack", baseline.token, "-"], JSON.stringify([{ ...initial, state: "working", note: "Replay" }])).exitCode,
	).toBe(1);
	screen("Initial harmless evidence\n ⠋ 83s · running\n");
	expect(json("probe").changed).toBe(false);
	expect(json("viewport", surface).evidence).toStartWith("VIEWPORT\n");
	screen("New synthetic question: A or B?\n");
	const manual = json("changes");
	expect(json("probe")).toEqual({ changed: true, observations: [] });
	screen("A second synthetic question replaced the first.\n");
	const scheduled = json("scheduled");
	expect(scheduled.observations[0]).toMatchObject({
		evidence: "A second synthetic question replaced the first.\n",
		target: { board: { note: "Initial work" } },
	});
	expect(ack(scheduled, "waiting", "A new question", "scheduled-ack")).toEqual({ saved: 1, stale: 0 });
	expect(ack(manual, "waiting", "Outdated note")).toEqual({ saved: 0, stale: 1 });
	expect(json("changes").changed).toBe(false);
	json("track", other, otherSurface);
	const partial = json("status");
	expect(partial.observations[0].evidence).toContain("A second synthetic question");
	expect(partial.observations[1]).toMatchObject({ digest: "unreadable", evidence: null });
	json("untrack", otherSurface);
	tree(false);
	expect(json("probe").changed).toBe(true);
	const missing = json("scheduled");
	expect(missing.observations[0]).toMatchObject({ digest: "missing", evidence: null });
	expect(ack(missing, "unknown", "Surface missing", "scheduled-ack")).toEqual({ saved: 1, stale: 0 });
	expect(json("probe").changed).toBe(false);
	using db = new Database(join(dir, "state.sqlite"), { readonly: true });
	const row = db.query<{ doc: string }, []>("SELECT doc FROM profile").get();
	if (!row) throw new Error("Expected saved profile.");
	const saved = row.doc;
	expect(saved).not.toContain("synthetic question");
	expect(saved).not.toContain(otherSurface);
	json("untrack", surface);
	expect(json("probe").changed).toBe(false);
});

test("Pi probe answers synchronously and rejects malformed or failed CLI results", async () => {
	let listener!: (request: unknown) => void;
	let result = { code: 0, killed: false, stdout: '{"changed":false}', stderr: "" };
	const tools: string[] = [];
	precheck({
		events: {
			on: (_name: string, handler: typeof listener) => {
				listener = handler;
			},
		},
		exec: async () => result,
		registerTool: ({ name }: { name: string }) => {
			tools.push(name);
		},
	} as Parameters<typeof precheck>[0]);
	expect(tools).toEqual(["cmux_meta_changes", "cmux_meta_ack"]);
	let probe: (() => Promise<boolean>) | undefined;
	const runProbe = () => {
		if (!probe) throw new Error("Expected registered precheck.");
		return probe();
	};
	const request = {
		name: "other",
		signal: new AbortController().signal,
		respondWith(fn: typeof probe) {
			probe = fn;
		},
	};
	listener(request);
	expect(probe).toBeUndefined();
	listener({ ...request, name: "cmux-changed" });
	await expect(runProbe()).resolves.toBe(false);
	result = { ...result, stdout: '{"changed":true}' };
	await expect(runProbe()).resolves.toBe(true);
	result = { ...result, stdout: '{"changed":"true"}' };
	await expect(runProbe()).rejects.toThrow("did not return a boolean");
	result = { ...result, code: 1, stdout: "", stderr: "fixture error" };
	await expect(runProbe()).rejects.toThrow("fixture error");
});
