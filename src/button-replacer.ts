import { App, Plugin, TFile, parseYaml } from "obsidian";
import { ActiveBaseContext, BaseFileConfig } from "./types";
import { NoteCreator } from "./note-creator";
import { NoteNameModal } from "./settings-modal";

export class ButtonReplacer {
	private patchedButtons: Map<HTMLElement, (e: MouseEvent) => void> =
		new Map();
	private gearButtons: Set<HTMLElement> = new Set();
	private observer: MutationObserver | null = null;
	private scanTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private app: App,
		private plugin: Plugin,
		private noteCreator: NoteCreator,
		private onGearClick: (context: ActiveBaseContext) => void
	) {}

	setup(): void {
		this.app.workspace.onLayoutReady(() => {
			this.scanAll();
		});

		this.plugin.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.debouncedScan();
			})
		);

		this.plugin.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.debouncedScan();
			})
		);

		// MutationObserver catches embedded bases being rendered
		this.observer = new MutationObserver(() => {
			this.debouncedScan();
		});
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	destroy(): void {
		for (const [button, handler] of this.patchedButtons) {
			button.removeEventListener("click", handler, true);
			delete (button as any).dataset.basesNewNotePatched;
		}
		this.patchedButtons.clear();

		for (const gear of this.gearButtons) {
			gear.remove();
		}
		this.gearButtons.clear();

		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}

		if (this.scanTimeout) {
			clearTimeout(this.scanTimeout);
			this.scanTimeout = null;
		}
	}

	private debouncedScan(): void {
		if (this.scanTimeout) clearTimeout(this.scanTimeout);
		this.scanTimeout = setTimeout(() => this.scanAll(), 200);
	}

	/**
	 * Scan the entire document for bases toolbars — both standalone
	 * .base file views and embedded bases inside markdown notes.
	 */
	private scanAll(): void {
		const toolbars = Array.from(
			document.querySelectorAll<HTMLElement>(".bases-toolbar")
		);

		for (let i = 0; i < toolbars.length; i++) {
			this.patchToolbar(toolbars[i]);
		}
	}

	private patchToolbar(toolbar: HTMLElement): void {
		const newButton = this.findNewButton(toolbar);
		if (!newButton) return;

		this.patchButton(newButton, toolbar);
		this.injectGearIcon(newButton, toolbar);
	}

	private findNewButton(toolbar: HTMLElement): HTMLElement | null {
		// Primary: the known class for the "New" button
		const newItem = toolbar.querySelector<HTMLElement>(
			".bases-toolbar-item.bases-toolbar-new-item-menu"
		);
		if (newItem) return newItem;

		// Fallback: any toolbar item with "New" text
		const items = Array.from(
			toolbar.querySelectorAll<HTMLElement>(".bases-toolbar-item")
		);
		for (let i = 0; i < items.length; i++) {
			if (items[i].textContent?.trim() === "New") {
				return items[i];
			}
		}

		return null;
	}

	private patchButton(
		button: HTMLElement,
		toolbar: HTMLElement
	): void {
		if ((button as any).dataset.basesNewNotePatched) return;
		(button as any).dataset.basesNewNotePatched = "true";

		const handler = async (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			e.stopImmediatePropagation();

			const context = await this.getContextFromToolbar(toolbar);
			if (!context) return;

			new NoteNameModal(this.app, async (name: string) => {
				await this.noteCreator.createNote(context, name);
			}).open();
		};

		button.addEventListener("click", handler, { capture: true });
		this.patchedButtons.set(button, handler);
	}

	private injectGearIcon(
		newButton: HTMLElement,
		toolbar: HTMLElement
	): void {
		if (toolbar.querySelector(".bases-new-note-settings-btn")) return;

		const wrapper = document.createElement("div");
		wrapper.className =
			"bases-toolbar-item bases-new-note-settings-btn";

		const gear = document.createElement("div");
		gear.className = "bases-new-note-settings-inner";
		gear.setAttribute("aria-label", "New note settings");
		gear.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

		wrapper.appendChild(gear);

		wrapper.addEventListener("click", async (e) => {
			e.stopPropagation();
			e.preventDefault();
			const context = await this.getContextFromToolbar(toolbar);
			if (context) {
				this.onGearClick(context);
			}
		});

		newButton.insertAdjacentElement("afterend", wrapper);
		this.gearButtons.add(wrapper);
	}

	/**
	 * Given a toolbar element, figure out which .base file it belongs to
	 * and which view is active. Works for both standalone and embedded bases.
	 */
	private async getContextFromToolbar(
		toolbar: HTMLElement
	): Promise<ActiveBaseContext | null> {
		const baseFilePath = this.resolveBaseFilePath(toolbar);
		if (!baseFilePath) return null;

		const file = this.app.vault.getAbstractFileByPath(baseFilePath);
		if (!file || !(file instanceof TFile)) return null;

		const content = await this.app.vault.read(file);
		const config = (parseYaml(content) as BaseFileConfig) ?? {};

		const activeViewName = this.getActiveViewName(toolbar, config);
		const activeViewConfig = activeViewName
			? config.views?.find((v) => v.name === activeViewName) ?? null
			: null;

		return {
			baseFilePath: file.path,
			baseConfig: config,
			activeViewName,
			activeViewConfig,
		};
	}

	/**
	 * Walk up from the toolbar to find the .base file path.
	 *
	 * For embeds: look for an ancestor with class `internal-embed`
	 * whose `src` attribute ends in `.base` (may include #ViewName).
	 *
	 * For standalone: walk up to the workspace leaf and read `view.file`.
	 */
	private resolveBaseFilePath(toolbar: HTMLElement): string | null {
		// Check for embedded base
		const embed = toolbar.closest<HTMLElement>(
			'.internal-embed[src$=".base"]'
		);
		if (embed) {
			const src = embed.getAttribute("src") ?? "";
			// Strip #fragment (view name)
			return src.split("#")[0];
		}

		// Also check embeds with fragment in src like "Excerpts.base#View Name"
		const embedWithFragment = toolbar.closest<HTMLElement>(
			".internal-embed"
		);
		if (embedWithFragment) {
			const src = embedWithFragment.getAttribute("src") ?? "";
			if (src.includes(".base")) {
				return src.split("#")[0];
			}
		}

		// Standalone: find the workspace leaf
		const leafEl = toolbar.closest<HTMLElement>(
			'.workspace-leaf-content[data-type="bases"]'
		);
		if (leafEl) {
			// Get the file from the leaf by iterating leaves
			let foundPath: string | null = null;
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (foundPath) return;
				if (
					leaf.view.getViewType() === "bases" &&
					leaf.view.containerEl?.contains(toolbar)
				) {
					const file = (leaf.view as any).file as
						| TFile
						| undefined;
					if (file) foundPath = file.path;
				}
			});
			return foundPath;
		}

		// Last resort: iterate all leaves and check containment
		let foundPath: string | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (foundPath) return;
			if (leaf.view.containerEl?.contains(toolbar)) {
				const file = (leaf.view as any).file as TFile | undefined;
				if (file && file.extension === "base") {
					foundPath = file.path;
				}
			}
		});
		return foundPath;
	}

	/**
	 * Determine the active view name from the toolbar DOM.
	 *
	 * For embeds with a #fragment, the fragment IS the view name.
	 * For standalone or non-fragment embeds, read from the views menu.
	 */
	private getActiveViewName(
		toolbar: HTMLElement,
		config: BaseFileConfig
	): string | null {
		// Check if this is an embed with a #ViewName fragment
		const embed = toolbar.closest<HTMLElement>(".internal-embed");
		if (embed) {
			const src = embed.getAttribute("src") ?? "";
			const hashIndex = src.indexOf("#");
			if (hashIndex !== -1) {
				const fragment = src.slice(hashIndex + 1);
				if (fragment) return decodeURIComponent(fragment);
			}
		}

		// Read from the views menu in the toolbar
		// The views menu is .bases-toolbar-views-menu — look for the
		// active/selected tab text ONLY within that specific menu item
		const viewsMenu = toolbar.querySelector<HTMLElement>(
			".bases-toolbar-views-menu"
		);
		if (viewsMenu) {
			// Try active tab marker within the views menu
			const activeTab = viewsMenu.querySelector<HTMLElement>(
				".is-active, .mod-active"
			);
			if (activeTab) {
				const text = activeTab.textContent?.trim();
				if (text) return text;
			}

			// If single view, the menu might just show the view name as text
			// Get the direct text content, not including child menu items
			const labels = Array.from(
				viewsMenu.querySelectorAll<HTMLElement>("span, div")
			);
			for (let i = 0; i < labels.length; i++) {
				const text = labels[i].textContent?.trim();
				if (
					text &&
					config.views?.some((v) => v.name === text)
				) {
					return text;
				}
			}
		}

		// If there's only one view, use it
		if (config.views?.length === 1) {
			return config.views[0].name;
		}

		return null;
	}
}
