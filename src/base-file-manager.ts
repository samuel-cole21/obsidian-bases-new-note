import { App, TFile, parseYaml, stringifyYaml } from "obsidian";
import { BaseFileConfig, NewNoteSettings, ViewConfig } from "./types";

export class BaseFileManager {
	constructor(private app: App) {}

	async readConfig(file: TFile): Promise<BaseFileConfig> {
		const content = await this.app.vault.read(file);
		return (parseYaml(content) as BaseFileConfig) ?? {};
	}

	async writeConfig(file: TFile, config: BaseFileConfig): Promise<void> {
		const yaml = stringifyYaml(config);
		await this.app.vault.modify(file, yaml);
	}

	getResolvedSettings(
		config: BaseFileConfig,
		viewName: string | null
	): NewNoteSettings {
		const base = config.newNoteSettings ?? {};
		if (!viewName) return { ...base };

		const view = this.findView(config, viewName);
		const viewSettings = view?.newNoteSettings ?? {};

		return {
			template: viewSettings.template ?? base.template,
			location: viewSettings.location ?? base.location,
		};
	}

	async updateSettings(
		file: TFile,
		viewName: string | null,
		settings: NewNoteSettings
	): Promise<void> {
		const config = await this.readConfig(file);

		if (viewName) {
			const view = this.findView(config, viewName);
			if (view) {
				view.newNoteSettings = this.cleanSettings(settings);
			}
		} else {
			config.newNoteSettings = this.cleanSettings(settings);
		}

		await this.writeConfig(file, config);
	}

	private findView(
		config: BaseFileConfig,
		viewName: string
	): ViewConfig | undefined {
		return config.views?.find((v) => v.name === viewName);
	}

	private cleanSettings(
		settings: NewNoteSettings
	): NewNoteSettings | undefined {
		const cleaned: NewNoteSettings = {};
		if (settings.template) cleaned.template = settings.template;
		if (settings.location) cleaned.location = settings.location;
		return Object.keys(cleaned).length > 0 ? cleaned : undefined;
	}
}
