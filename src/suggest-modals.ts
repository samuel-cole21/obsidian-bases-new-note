import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
import { TemplateApplier } from "./template-applier";

export class TemplateSuggestModal extends FuzzySuggestModal<TFile> {
	private templateApplier: TemplateApplier;

	constructor(
		app: App,
		private callback: (templateName: string) => void
	) {
		super(app);
		this.templateApplier = new TemplateApplier(app);
		this.setPlaceholder("Choose a template...");
	}

	getItems(): TFile[] {
		return this.templateApplier.listTemplates();
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.callback(item.basename);
	}
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private callback: (folderPath: string) => void
	) {
		super(app);
		this.setPlaceholder("Choose a folder...");
	}

	getItems(): TFolder[] {
		return this.getAllFolders();
	}

	getItemText(item: TFolder): string {
		return item.path || "/";
	}

	onChooseItem(item: TFolder): void {
		this.callback(item.path);
	}

	private getAllFolders(): TFolder[] {
		const folders: TFolder[] = [];
		const recurse = (folder: TFolder) => {
			// Skip hidden folders
			if (folder.path.startsWith(".")) return;
			folders.push(folder);
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					recurse(child);
				}
			}
		};
		recurse(this.app.vault.getRoot());
		return folders;
	}
}
