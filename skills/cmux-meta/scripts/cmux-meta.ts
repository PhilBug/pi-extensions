import { Database } from "bun:sqlite";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states = ["working", "waiting", "done", "idle", "unknown"] as const;
type Board = { state: (typeof states)[number]; note: string };
type Target = { workspace: string; surface: string; label: string };
type Entry = Target & { stamp: string; digest?: string; board?: Board };
type Item = { surface: string; digest: string; stamp: string };
type Batch = { token: string; items: Item[] };
type Profile = { targets: Entry[]; manual?: Batch; scheduled?: Batch };
type Tree = {
	caller?: { workspace_id?: string; window_id?: string };
	windows: Array<{
		id: string;
		workspaces: Array<{ id: string; title: string; panes: Array<{ surfaces: Array<{ id: string; type: string }> }> }>;
	}>;
};
const exec = promisify(execFile);
const commands = [
	"list",
	"track",
	"untrack",
	"status",
	"changes",
	"probe",
	"scheduled",
	"ack",
	"scheduled-ack",
	"viewport",
];
const controls = /[\p{Cc}\p{Bidi_Control}]/u;
const sameId = (a?: string, b?: string) =>
	typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

async function cmux(...args: string[]): Promise<string> {
	try {
		return (await exec("cmux", args, { timeout: 3_000, maxBuffer: 256 * 1024, encoding: "utf8" })).stdout;
	} catch {
		throw new Error(`cmux ${args[0] === "--json" ? "tree" : "read-screen"} failed.`);
	}
}

async function topology() {
	const tree = JSON.parse(await cmux("--json", "--id-format", "uuids", "tree")) as Tree;
	const meta = tree.caller?.workspace_id;
	if (!Array.isArray(tree?.windows)) throw new Error("Unexpected cmux tree response.");
	const window = tree.windows.find((w) => sameId(w.id, tree.caller?.window_id));
	if (
		!meta ||
		!sameId(meta, process.env.CMUX_WORKSPACE_ID) ||
		!uuid.test(meta) ||
		!window?.workspaces.some((w) => sameId(w.id, meta))
	) {
		throw new Error("Run from the META cmux workspace with its caller environment intact.");
	}
	const candidates = window.workspaces
		.filter((w) => !sameId(w.id, meta) && uuid.test(w.id))
		.flatMap((w) =>
			w.panes.flatMap((p) =>
				p.surfaces
					.filter((s) => s.type === "terminal" && uuid.test(s.id))
					.map((s) => ({
						workspace: w.id,
						surface: s.id,
						label: Array.from(w.title ?? "")
							.filter((c) => !controls.test(c))
							.slice(0, 120)
							.join(""),
					})),
			),
		);
	return { meta: meta.toLowerCase(), candidates };
}

function openStore() {
	const dir = process.env.CMUX_META_STATE_DIR ?? join(homedir(), ".local", "state", "cmux-meta");
	process.umask(0o077);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const db = new Database(join(dir, "state.sqlite"), { strict: true });
	db.exec(
		"PRAGMA busy_timeout = 1000; CREATE TABLE IF NOT EXISTS profile (meta TEXT PRIMARY KEY, rev INTEGER NOT NULL, doc TEXT NOT NULL)",
	);
	return db;
}

async function capture(target: Target, candidates: Target[], viewport = false) {
	const live = candidates.find((c) => sameId(c.workspace, target.workspace) && sameId(c.surface, target.surface));
	if (!live) return { surface: target.surface, digest: "missing", evidence: null };
	let raw: string;
	try {
		raw = await cmux(
			"read-screen",
			"--workspace",
			live.workspace,
			"--surface",
			live.surface,
			...(viewport ? [] : ["--lines", "60"]),
		);
	} catch {
		return { surface: target.surface, digest: "unreadable", evidence: null };
	}
	// The Pi footer and timer counters change without a new turn. Other changes
	// are candidates only; the reader decides whether they alter the board.
	const evidence = raw
		.split("\n")
		.map((line) => line.replace(/[\p{Cc}\p{Bidi_Control}]/gu, (char) => (char === "\t" ? char : "")).trimEnd())
		.join("\n");
	const stable = evidence
		.split("\n")
		.filter(
			(line) =>
				line &&
				!/^[─ ]{20,}$/.test(line) &&
				!/^(?:.*\bthink:(?:off|minimal|low|medium|high|xhigh|max)\b.*)?\d+(?:\.\d+)?%\/\S+\s+.*[↑↓]/.test(
					line.trim(),
				) &&
				!/\bthink:(?:off|minimal|low|medium|high|xhigh|max)\b.*[↑↓]/.test(line),
		)
		.map((line) =>
			line.replace(/^\s*[⠁-⣿✦✧✶·]\s+(?=\S)/u, "").replace(/(^|\s+)\d+(?:\.\d+)?s · (running|thinking)\s*$/, " $2"),
		)
		.join("\n");
	return { surface: target.surface, digest: createHash("sha256").update(stable).digest("hex"), evidence };
}

async function main(args: string[]) {
	const [command, ...params] = args;
	if (command === "--help" || !command)
		return {
			commands: [
				"list",
				"track <workspace-uuid> <surface-uuid> ...",
				"untrack <surface-uuid>",
				"status",
				"changes",
				"probe",
				"scheduled",
				"ack <token> -",
				"scheduled-ack <token> -",
				"viewport <surface-uuid>",
			],
		};
	if (!commands.includes(command)) throw new Error("Unknown command. Run --help.");
	if (["list", "status", "changes", "probe", "scheduled"].includes(command) && params.length)
		throw new Error("Unexpected arguments.");
	const { meta, candidates } = await topology();
	using db = openStore();
	const row = db.query<{ rev: number; doc: string }, [string]>("SELECT rev, doc FROM profile WHERE meta = ?").get(meta);
	const profile: Profile = row ? JSON.parse(row.doc) : { targets: [] };
	const write = (next: Profile) => {
		const result = row
			? db.run("UPDATE profile SET rev = rev + 1, doc = ? WHERE meta = ? AND rev = ?", [
					JSON.stringify(next),
					meta,
					row.rev,
				])
			: db.run("INSERT INTO profile VALUES (?, 1, ?) ON CONFLICT DO NOTHING", [meta, JSON.stringify(next)]);
		if (result.changes !== 1) throw new Error("META board changed concurrently. Re-read before proceeding.");
	};
	if (command === "list")
		return {
			meta,
			candidates,
			tracked: profile.targets.map(({ workspace, surface, label }) => ({ workspace, surface, label })),
		};
	if (command === "track") {
		if (!params.length || params.length % 2) throw new Error("Supply confirmed workspace/surface UUID pairs.");
		const targets = new Map(profile.targets.map((t) => [t.surface, t]));
		for (let i = 0; i < params.length; i += 2) {
			const target = candidates.find((c) => sameId(c.workspace, params[i]) && sameId(c.surface, params[i + 1]));
			if (!target) throw new Error("Confirmed pair is not a terminal in another workspace in this window.");
			const existing = [...targets.values()].find((t) => sameId(t.surface, target.surface));
			if (!existing || !sameId(existing.workspace, target.workspace)) {
				if (existing) targets.delete(existing.surface);
				targets.set(target.surface, { ...target, stamp: randomUUID() });
			} else if (existing.label !== target.label) targets.set(existing.surface, { ...existing, label: target.label });
		}
		if (targets.size > 16) throw new Error("Track at most 16 terminals per META workspace.");
		if ([...targets.values()].some((t) => !profile.targets.includes(t)))
			write({ ...profile, targets: [...targets.values()] });
		return { tracked: [...targets.values()].map((t) => t.surface) };
	}
	if (command === "untrack") {
		if (params.length !== 1 || !profile.targets.some((t) => sameId(t.surface, params[0])))
			throw new Error("Expected one tracked surface UUID.");
		const keep = (batch?: Batch) => {
			const items = batch?.items.filter((i) => !sameId(i.surface, params[0]));
			return batch && items?.length ? { ...batch, items } : undefined;
		};
		write({
			targets: profile.targets.filter((t) => !sameId(t.surface, params[0])),
			manual: keep(profile.manual),
			scheduled: keep(profile.scheduled),
		});
		return { removed: params[0] };
	}
	if (!profile.targets.length) {
		if (command === "probe" || command === "scheduled") return { changed: false, observations: [] };
		throw new Error("No confirmed targets. Run list and track first.");
	}
	if (command === "viewport") {
		const target = profile.targets.find((t) => sameId(t.surface, params[0]));
		if (!target || params.length !== 1) throw new Error("Expected one tracked surface UUID.");
		return { ...target, ...(await capture(target, candidates, true)) };
	}
	if (command === "ack" || command === "scheduled-ack") {
		const slot = command === "ack" ? "manual" : "scheduled";
		const [token, input] = params;
		const batch = profile[slot];
		if (params.length !== 2 || input !== "-" || !batch || token !== batch.token)
			throw new Error("Observation is stale or arguments are invalid. Nothing was saved.");
		const updates: unknown = JSON.parse(await Bun.stdin.text());
		if (!Array.isArray(updates) || !updates.length) throw new Error("Expected a nonempty array of observations.");
		const boards = new Map<string, Board>();
		for (const update of updates) {
			const item = batch.items.find((i) => i.surface === update?.surface && i.digest === update?.digest);
			if (
				!item ||
				boards.has(item.surface) ||
				!states.includes(update.state) ||
				(["missing", "unreadable"].includes(item.digest) && update.state !== "unknown") ||
				typeof update.note !== "string" ||
				update.note.length > 400 ||
				controls.test(update.note)
			)
				throw new Error("Invalid observation; nothing was saved.");
			boards.set(item.surface, { state: update.state, note: update.note });
		}
		let saved = 0;
		const targets = profile.targets.map((t) => {
			const board = boards.get(t.surface);
			const item = batch.items.find((i) => i.surface === t.surface && i.stamp === t.stamp);
			if (!board || !item) return t;
			saved++;
			return { ...t, board, digest: item.digest, stamp: randomUUID() };
		});
		write({ ...profile, [slot]: undefined, targets });
		return { saved, stale: boards.size - saved };
	}
	const observations = await Promise.all(
		profile.targets.map(async (target) => ({ target, ...(await capture(target, candidates)) })),
	);
	const changed = observations.filter((o) => command === "status" || o.digest !== o.target.digest);
	if (command === "probe" || !changed.length) return { changed: Boolean(changed.length), observations: [] };
	const next: Batch = {
		token: randomUUID(),
		items: changed.map(({ surface, digest, target }) => ({ surface, digest, stamp: target.stamp })),
	};
	const slot = command === "scheduled" ? "scheduled" : "manual";
	write({ ...profile, [slot]: next });
	return { token: next.token, observations: changed };
}

if (import.meta.main) {
	try {
		console.log(JSON.stringify(await main(process.argv.slice(2))));
	} catch (error) {
		console.error(error instanceof Error ? error.message : "cmux-meta failed.");
		process.exitCode = 1;
	}
}
