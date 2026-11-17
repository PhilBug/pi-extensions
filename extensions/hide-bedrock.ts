import { type ExtensionAPI, getAgentDir, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";

const HIDDEN_MODEL_IDS = new Set(["claude-fable-5-1", "claude-fable-5.1"]);

export default async function (pi: ExtensionAPI) {
	// Ambient AWS_PROFILE makes Pi auto-enable the built-in Bedrock provider; replace its model list with nothing.
	pi.registerProvider("amazon-bedrock", { models: [] });

	// Wrap remote-catalog-backed built-in providers so pi.dev catalog refreshes still run while hiding retired models.
	const defaults = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false });
	for (const providerId of ["anthropic", "github-copilot"]) {
		const base = defaults.getProvider(providerId);
		if (!base) continue;
		pi.registerProvider({
			...base,
			getModels: () => base.getModels().filter((model) => !HIDDEN_MODEL_IDS.has(model.id)),
			getAllModels: () =>
				(base.getAllModels?.() ?? base.getModels()).filter((model) => !HIDDEN_MODEL_IDS.has(model.id)),
		});
	}

	// /reload does not rebuild session.scopedModels from enabledModels on its own, so sync the in-memory array in place.
	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "reload") return;
		await ctx.modelRegistry.refresh({ allowNetwork: false });
		const available = ctx.modelRegistry.getAvailable();
		const byRef = new Map(available.map((model) => [`${model.provider}/${model.id}`.toLowerCase(), model]));
		const patterns = SettingsManager.create(ctx.cwd, getAgentDir()).getEnabledModels() ?? [];
		const next = patterns.flatMap((pattern) => {
			const [ref, thinkingLevel] = pattern.split(":");
			const model = byRef.get(ref.toLowerCase());
			return model ? [{ model, ...(thinkingLevel ? { thinkingLevel } : {}) }] : [];
		});
		const live = ctx.scopedModels as Array<{ model: unknown; thinkingLevel?: string }>;
		live.splice(0, live.length, ...next);
	});
}
