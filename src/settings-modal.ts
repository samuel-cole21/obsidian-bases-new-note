import { App, Modal, Setting, TFile } from "obsidian";
import { ActiveBaseContext, NewNoteSettings } from "./types";
import { BaseFileManager } from "./base-file-manager";
import { NoteCreator } from "./note-creator";
import { TemplateSuggestModal, FolderSuggestModal } from "./suggest-modals";

export class NewNoteSettingsModal extends Modal {
	private baseFileManager: BaseFileManager;
	private noteCreator: NoteCreator;

	constructor(
		app: App,
		private context: ActiveBaseContext
	) {
		super(app);
		this.baseFileManager = new BaseFileManager(app);
		this.noteCreator = new NoteCreator(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("bases-new-note-settings-modal");

		contentEl.createEl("h2", { text: "New Note Settings" });

		// Base-level settings
		this.renderSection(
			contentEl,
			"All views",
			"Settings applied to every view in this base",
			null
		);

		// View-level settings (if a named view is active)
		if (this.context.activeViewName) {
			this.renderSection(
				contentEl,
				`"${this.context.activeViewName}" view`,
				"Overrides base settings for this view only",
				this.context.activeViewName
			);
		}

		// Preview
		this.renderPreview(contentEl);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderSection(
		container: HTMLElement,
		heading: string,
		description: string,
		viewName: string | null
	): void {
		const section = container.createDiv("bases-new-note-settings-section");
		section.createEl("h3", { text: heading });
		section.createEl("p", {
			text: description,
			cls: "setting-item-description",
		});

		const currentSettings = viewName
			? this.context.activeViewConfig?.newNoteSettings ?? {}
			: this.context.baseConfig.newNoteSettings ?? {};

		// Template setting
		const templateSetting = new Setting(section)
			.setName("Template")
			.setDesc("Template to apply when creating a new note");

		const templateInput = templateSetting.controlEl.createEl("input", {
			type: "text",
			cls: "bases-new-note-input",
			value: currentSettings.template ?? "",
			placeholder: viewName ? "(inherit from base)" : "(none)",
		});
		templateInput.readOnly = true;
		templateInput.addEventListener("click", () => {
			new TemplateSuggestModal(this.app, async (name) => {
				templateInput.value = name;
				await this.saveField(viewName, "template", name);
				this.renderPreview(container);
			}).open();
		});

		// Clear button for template
		templateSetting.addExtraButton((btn) =>
			btn.setIcon("x").setTooltip("Clear").onClick(async () => {
				templateInput.value = "";
				await this.saveField(viewName, "template", undefined);
				this.renderPreview(container);
			})
		);

		// Location setting
		const locationSetting = new Setting(section)
			.setName("Folder")
			.setDesc("Where to create new notes");

		const locationInput = locationSetting.controlEl.createEl("input", {
			type: "text",
			cls: "bases-new-note-input",
			value: currentSettings.location ?? "",
			placeholder: viewName ? "(inherit from base)" : "(vault root)",
		});
		locationInput.readOnly = true;
		locationInput.addEventListener("click", () => {
			new FolderSuggestModal(this.app, async (path) => {
				locationInput.value = path;
				await this.saveField(viewName, "location", path);
				this.renderPreview(container);
			}).open();
		});

		// Clear button for location
		locationSetting.addExtraButton((btn) =>
			btn.setIcon("x").setTooltip("Clear").onClick(async () => {
				locationInput.value = "";
				await this.saveField(viewName, "location", undefined);
				this.renderPreview(container);
			})
		);
	}

	private async saveField(
		viewName: string | null,
		field: keyof NewNoteSettings,
		value: string | undefined
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(
			this.context.baseFilePath
		);
		if (!file || !(file instanceof TFile)) return;

		const config = await this.baseFileManager.readConfig(file);

		if (viewName) {
			const view = config.views?.find((v) => v.name === viewName);
			if (view) {
				if (!view.newNoteSettings) view.newNoteSettings = {};
				if (value) {
					view.newNoteSettings[field] = value;
				} else {
					delete view.newNoteSettings[field];
					if (Object.keys(view.newNoteSettings).length === 0) {
						delete view.newNoteSettings;
					}
				}
			}
		} else {
			if (!config.newNoteSettings) config.newNoteSettings = {};
			if (value) {
				config.newNoteSettings[field] = value;
			} else {
				delete config.newNoteSettings[field];
				if (Object.keys(config.newNoteSettings).length === 0) {
					delete config.newNoteSettings;
				}
			}
		}

		// Re-read and update context
		this.context.baseConfig = config;
		if (viewName && this.context.activeViewConfig) {
			this.context.activeViewConfig =
				config.views?.find((v) => v.name === viewName) ?? null;
		}

		await this.baseFileManager.writeConfig(file, config);
	}

	private renderPreview(container: HTMLElement): void {
		// Remove existing preview
		const existing = container.querySelector(
			".bases-new-note-preview"
		);
		if (existing) existing.remove();

		const preview = container.createDiv("bases-new-note-preview");
		preview.createEl("h3", { text: "Resolved Configuration" });

		const resolved = this.noteCreator.resolveConfig(this.context);

		const table = preview.createEl("table");
		this.addPreviewRow(
			table,
			"Template",
			resolved.template ?? "(none)"
		);
		this.addPreviewRow(
			table,
			"Location",
			resolved.location ?? "(vault root)"
		);

		if (Object.keys(resolved.preFilledProperties).length > 0) {
			preview.createEl("h4", { text: "Pre-filled Properties" });
			const propTable = preview.createEl("table");
			for (const [key, value] of Object.entries(
				resolved.preFilledProperties
			)) {
				this.addPreviewRow(propTable, key, value);
			}
		}
	}

	private addPreviewRow(
		table: HTMLElement,
		label: string,
		value: string
	): void {
		const row = table.createEl("tr");
		row.createEl("td", { text: label, cls: "bases-new-note-preview-label" });
		row.createEl("td", { text: value, cls: "bases-new-note-preview-value" });
	}
}

export class NoteNameModal extends Modal {
	private inputEl: HTMLInputElement;

	constructor(
		app: App,
		private onSubmit: (name: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("bases-new-note-name-modal");

		contentEl.createEl("h3", { text: "New note" });

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			cls: "bases-new-note-name-input",
			placeholder: "Note title...",
		});
		this.inputEl.focus();

		this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Create").setCta().onClick(() => this.submit())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const name = this.inputEl.value.trim() || "Untitled";
		this.close();
		this.onSubmit(name);
	}
}
