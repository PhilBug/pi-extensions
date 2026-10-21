import { getAgentDir, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// /model only changes the session; this persists the current model and thinking level as startup defaults.
export default function (pi: ExtensionAPI) {
	pi.registerCommand("model-default", {
		description: "Save the current model and thinking level as defaults for new sessions",
		handler: async (_args, ctx) => {
			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("No active model to save", "error");
				return;
			}
			const settings = SettingsManager.create(ctx.cwd, getAgentDir());
			settings.setDefaultModelAndProvider(model.provider, model.id);
			settings.setDefaultThinkingLevel(pi.getThinkingLevel());
			await settings.flush();
			ctx.ui.notify(`Default model: ${model.provider}/${model.id} (${pi.getThinkingLevel()})`, "info");
		},
	});
}
