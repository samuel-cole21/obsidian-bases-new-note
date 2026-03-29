import { App, TFile, TFolder } from "obsidian";

export interface ParsedTemplate {
	frontmatter: Record<string, unknown>;
	body: string;
}

export class TemplateApplier {
	constructor(private app: App) {}

	getTemplateFolder(): string | null {
		const templates = (this.app as any).internalPlugins?.plugins?.templates;
		if (templates?.enabled) {
			return templates.instance?.options?.folder ?? null;
		}
		return null;
	}

	getTemplateFile(templateName: string): TFile | null {
		const folder = this.getTemplateFolder();
		if (!folder) return null;

		const path = `${folder}/${templateName}.md`;
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	listTemplates(): TFile[] {
		const folder = this.getTemplateFolder();
		if (!folder) return [];

		const dir = this.app.vault.getAbstractFileByPath(folder);
		if (!dir || !(dir instanceof TFolder)) return [];

		return dir.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);
	}

	async parseTemplate(file: TFile): Promise<ParsedTemplate> {
		const content = await this.app.vault.read(file);
		return parseTemplateContent(content);
	}

	async applyTemplater(
		templateFile: TFile,
		targetFile: TFile
	): Promise<boolean> {
		const templater = (this.app as any).plugins?.plugins?.[
			"templater-obsidian"
		];
		if (!templater) return false;

		try {
			const content = await this.app.vault.read(targetFile);
			const processed = await this.processWithTemplater(
				templater,
				templateFile,
				targetFile,
				content
			);
			if (processed && processed !== content) {
				await this.app.vault.modify(targetFile, processed);
				return true;
			}
		} catch {
			// Templater not available or failed — fall through
		}
		return false;
	}

	private async processWithTemplater(
		templaterPlugin: any,
		templateFile: TFile,
		targetFile: TFile,
		content: string
	): Promise<string | null> {
		try {
			const templater = templaterPlugin.templater;
			const config = {
				template_file: templateFile,
				active_file: targetFile,
				target_file: targetFile,
				run_mode: 4, // CreateNewFromTemplate
			};

			const functionsGenerator = templater.functions_generator;
			const internalFunctions =
				await functionsGenerator.internal_functions.generate_object(
					config
				);
			const userFunctions =
				await functionsGenerator.user_functions.generate_object(config);
			const functions = { ...internalFunctions, ...userFunctions };

			return await templater.parser.parse_commands(content, functions);
		} catch {
			return null;
		}
	}
}

export function parseTemplateContent(content: string): ParsedTemplate {
	const frontmatter: Record<string, unknown> = {};
	let body = content;

	const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (fmMatch) {
		const fmLines = fmMatch[1].split("\n");
		let currentKey: string | null = null;
		let currentArrayValues: string[] = [];
		let inArray = false;

		const flushArray = () => {
			if (currentKey && inArray) {
				frontmatter[currentKey] =
					currentArrayValues.length > 0 ? currentArrayValues : null;
				currentArrayValues = [];
				inArray = false;
			}
		};

		for (const line of fmLines) {
			const arrayItemMatch = line.match(/^\s+-\s+(.+)$/);
			if (arrayItemMatch && inArray) {
				currentArrayValues.push(arrayItemMatch[1].trim());
				continue;
			}

			flushArray();

			const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
			if (kvMatch) {
				currentKey = kvMatch[1];
				const value = kvMatch[2].trim();
				if (value === "") {
					// Could be an empty value or start of an array
					frontmatter[currentKey] = null;
					inArray = true;
				} else {
					frontmatter[currentKey] = value;
					inArray = false;
				}
			}
		}
		flushArray();

		body = fmMatch[2];
	}

	return { frontmatter, body };
}
