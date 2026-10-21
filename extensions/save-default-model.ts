import { getAgentDir, ModelSelectorComponent, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// /model only changes the session; this opens the same picker and also persists the choice as the startup default.
export default function (pi: ExtensionAPI) {
	pi.registerCommand("model-default", {
		description: "Select a model and save it, with the current thinking level, as the default for new sessions",
		handler: async (args, ctx) => {
			const settings = SettingsManager.create(ctx.cwd, getAgentDir());
			const registry = ctx.modelRegistry;
			// ModelSelectorComponent wants the internal ModelRuntime; the public registry covers the methods it calls.
			const runtime = {
				getAvailableSnapshot: () => registry.getAvailable(),
				getModel: (provider: string, id: string) => registry.find(provider, id),
				getError: () => registry.getError(),
				refresh: (options?: Parameters<typeof registry.refresh>[0]) => registry.refresh(options),
			};
			const provider = settings.getDefaultProvider();
			const id = settings.getDefaultModel();

			const model = await ctx.ui.custom<Parameters<ExtensionAPI["setModel"]>[0] | undefined>((tui, _theme, _keys, done) => {
				const selector = new ModelSelectorComponent(
					tui,
					ctx.model,
					runtime as never,
					[],
					(m) => done(m),
					() => done(undefined),
					args.trim() || undefined,
					(m) => done(m),
					provider && id ? { provider, id } : undefined,
				);
				return selector;
			});
			if (!model) return;

			if (!(await pi.setModel(model))) {
				ctx.ui.notify(`No credentials for ${model.provider}/${model.id}`, "error");
				return;
			}
			settings.setDefaultModelAndProvider(model.provider, model.id);
			settings.setDefaultThinkingLevel(pi.getThinkingLevel());
			await settings.flush();
			ctx.ui.notify(`Default model: ${model.provider}/${model.id} (${pi.getThinkingLevel()})`, "info");
		},
	});
}
