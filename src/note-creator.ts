import { App, Notice, TFile, TFolder, stringifyYaml } from "obsidian";
import { ActiveBaseContext, ResolvedNoteConfig, NewNoteSettings } from "./types";
import { BaseFileManager } from "./base-file-manager";
import {
	extractFromFilters,
	mergeExtractions,
} from "./filter-parser";
import { TemplateApplier, ParsedTemplate } from "./template-applier";

export class NoteCreator {
	private baseFileManager: BaseFileManager;
	private templateApplier: TemplateApplier;

	constructor(private app: App) {
		this.baseFileManager = new BaseFileManager(app);
		this.templateApplier = new TemplateApplier(app);
	}

	resolveConfig(context: ActiveBaseContext): ResolvedNoteConfig {
		const settings = this.baseFileManager.getResolvedSettings(
			context.baseConfig,
			context.activeViewName
		);

		const baseExtraction = extractFromFilters(context.baseConfig.filters);
		const viewExtraction = extractFromFilters(
			context.activeViewConfig?.filters
		);
		const merged = mergeExtractions(baseExtraction, viewExtraction);

		return {
			template: settings.template ?? null,
			location:
				settings.location ?? merged.locationFromFilter ?? null,
			preFilledProperties: merged.preFill,
		};
	}

	async createNote(
		context: ActiveBaseContext,
		noteName: string
	): Promise<TFile | null> {
		const config = this.resolveConfig(context);

		// Resolve template
		let parsedTemplate: ParsedTemplate | null = null;
		let templateFile: TFile | null = null;
		if (config.template) {
			templateFile = this.templateApplier.getTemplateFile(config.template);
			if (templateFile) {
				parsedTemplate = await this.templateApplier.parseTemplate(
					templateFile
				);
			} else {
				new Notice(
					`Template "${config.template}" not found in template folder.`
				);
			}
		}

		// Build frontmatter: template defaults, then pre-fill overrides
		const frontmatter = this.buildFrontmatter(
			parsedTemplate,
			config.preFilledProperties
		);

		// Build file content
		const content = this.buildContent(frontmatter, parsedTemplate?.body ?? "");

		// Determine file path
		const location = config.location ?? "";
		const filePath = await this.resolveFilePath(location, noteName);

		// Ensure folder exists
		await this.ensureFolder(location);

		// Create the file
		try {
			const file = await this.app.vault.create(filePath, content);

			// Run Templater if available
			if (templateFile) {
				await this.templateApplier.applyTemplater(
					templateFile,
					file
				);
			}

			// Open the new note
			await this.app.workspace.getLeaf(false).openFile(file);

			return file;
		} catch (e) {
			new Notice(`Failed to create note: ${e}`);
			return null;
		}
	}

	private buildFrontmatter(
		parsedTemplate: ParsedTemplate | null,
		preFill: Record<string, string>
	): Record<string, unknown> {
		const fm: Record<string, unknown> = {};

		// Start with template properties (preserves order)
		if (parsedTemplate) {
			for (const [key, value] of Object.entries(
				parsedTemplate.frontmatter
			)) {
				fm[key] = value;
			}
		}

		// Override with pre-fill values from filters
		for (const [key, value] of Object.entries(preFill)) {
			fm[key] = value;
		}

		return fm;
	}

	private buildContent(
		frontmatter: Record<string, unknown>,
		body: string
	): string {
		if (Object.keys(frontmatter).length === 0 && !body) {
			return "";
		}

		const fmLines: string[] = ["---"];
		for (const [key, value] of Object.entries(frontmatter)) {
			if (value === null || value === undefined || value === "") {
				fmLines.push(`${key}:`);
			} else if (Array.isArray(value)) {
				if (value.length === 0) {
					fmLines.push(`${key}:`);
				} else {
					fmLines.push(`${key}:`);
					for (const item of value) {
						fmLines.push(`  - ${item}`);
					}
				}
			} else {
				fmLines.push(`${key}: ${value}`);
			}
		}
		fmLines.push("---");

		const parts = [fmLines.join("\n")];
		if (body) {
			parts.push(body);
		}
		return parts.join("\n");
	}

	private async resolveFilePath(
		location: string,
		noteName: string
	): Promise<string> {
		const dir = location || "";
		const base = dir ? `${dir}/${noteName}` : noteName;
		let path = `${base}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${base} ${counter}.md`;
			counter++;
		}

		return path;
	}

	private async ensureFolder(location: string): Promise<void> {
		if (!location) return;

		const existing = this.app.vault.getAbstractFileByPath(location);
		if (existing instanceof TFolder) return;

		try {
			await this.app.vault.createFolder(location);
		} catch {
			// Folder may already exist due to race condition
		}
	}
}
