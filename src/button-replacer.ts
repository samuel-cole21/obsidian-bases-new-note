import {
	App,
	Plugin,
	TFile,
	WorkspaceLeaf,
	parseYaml,
} from "obsidian";
import { ActiveBaseContext, BaseFileConfig } from "./types";
import { NoteCreator } from "./note-creator";
import { NoteNameModal } from "./settings-modal";

export class ButtonReplacer {
	private patchedButtons: Map<HTMLElement, (e: MouseEvent) => void> =
		new Map();
	private gearButtons: Set<HTMLElement> = new Set();
	private observer: MutationObserver | null = null;

	constructor(
		private app: App,
		private plugin: Plugin,
		private noteCreator: NoteCreator,
		private onGearClick: (context: ActiveBaseContext) => void
	) {}

	setup(): void {
		// Scan on layout ready
		this.app.workspace.onLayoutReady(() => {
			this.scanAllLeaves();
		});

		// Re-scan on leaf changes
		this.plugin.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.scanAllLeaves();
			})
		);

		// Re-scan on layout changes (new views opened, tabs switched)
		this.plugin.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.scanAllLeaves();
			})
		);

		// MutationObserver for dynamically added bases views
		this.observer = new MutationObserver(() => {
			this.scanAllLeaves();
		});
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	destroy(): void {
		// Remove all patched event listeners
		for (const [button, handler] of this.patchedButtons) {
			button.removeEventListener("click", handler, true);
			delete (button as any).dataset.basesNewNotePatched;
		}
		this.patchedButtons.clear();

		// Remove all injected gear buttons
		for (const gear of this.gearButtons) {
			gear.remove();
		}
		this.gearButtons.clear();

		// Disconnect observer
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
	}

	private scanAllLeaves(): void {
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (leaf.view.getViewType() === "bases") {
				this.patchLeaf(leaf);
			}
		});
	}

	private patchLeaf(leaf: WorkspaceLeaf): void {
		const container = leaf.view.containerEl;
		if (!container) return;

		const newButton = this.findNewButton(container);
		if (!newButton) return;

		this.patchButton(newButton, leaf);
		this.injectGearIcon(newButton, leaf);
	}

	private findNewButton(container: HTMLElement): HTMLElement | null {
		// Look for the "New" button in the bases toolbar
		// It's typically a button/clickable element with "New" text or a plus icon
		const buttons = container.querySelectorAll(
			".bases-toolbar button, .bases-toolbar .clickable-icon"
		);
		const buttonList = Array.from(buttons);
		for (let i = 0; i < buttonList.length; i++) {
			const el = buttonList[i] as HTMLElement;
			const text = el.textContent?.trim();
			const ariaLabel = el.getAttribute("aria-label");
			if (
				text === "New" ||
				ariaLabel?.toLowerCase().includes("new") ||
				el.querySelector('[data-lucide="plus"]')
			) {
				return el;
			}
		}

		// Fallback: look for any element with "New" text in the toolbar area
		const toolbar = container.querySelector(".bases-toolbar");
		if (toolbar) {
			const allElements = Array.from(toolbar.querySelectorAll("*"));
			for (let i = 0; i < allElements.length; i++) {
				const htmlEl = allElements[i] as HTMLElement;
				if (
					htmlEl.childElementCount === 0 &&
					htmlEl.textContent?.trim() === "New"
				) {
					// Return the clickable parent
					return (htmlEl.closest("button") ??
						htmlEl.closest(".clickable-icon") ??
						htmlEl) as HTMLElement;
				}
			}
		}

		return null;
	}

	private patchButton(button: HTMLElement, leaf: WorkspaceLeaf): void {
		if ((button as any).dataset.basesNewNotePatched) return;
		(button as any).dataset.basesNewNotePatched = "true";

		const handler = async (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			e.stopImmediatePropagation();

			const context = await this.getBaseContext(leaf);
			if (!context) return;

			// Open name prompt, then create
			new NoteNameModal(this.app, async (name: string) => {
				await this.noteCreator.createNote(context, name);
			}).open();
		};

		button.addEventListener("click", handler, { capture: true });
		this.patchedButtons.set(button, handler);
	}

	private injectGearIcon(
		newButton: HTMLElement,
		leaf: WorkspaceLeaf
	): void {
		// Check if gear is already injected next to this button
		const parent = newButton.parentElement;
		if (!parent) return;
		if (parent.querySelector(".bases-new-note-settings-btn")) return;

		const gear = document.createElement("button");
		gear.className = "clickable-icon bases-new-note-settings-btn";
		gear.setAttribute("aria-label", "New note settings");
		gear.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

		gear.addEventListener("click", async (e) => {
			e.stopPropagation();
			e.preventDefault();
			const context = await this.getBaseContext(leaf);
			if (context) {
				this.onGearClick(context);
			}
		});

		newButton.insertAdjacentElement("afterend", gear);
		this.gearButtons.add(gear);
	}

	private async getBaseContext(
		leaf: WorkspaceLeaf
	): Promise<ActiveBaseContext | null> {
		const view = leaf.view as any;
		const file = view.file as TFile | undefined;
		if (!file || file.extension !== "base") return null;

		const content = await this.app.vault.read(file);
		const config = (parseYaml(content) as BaseFileConfig) ?? {};

		const activeViewName = this.getActiveViewName(leaf);
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

	private getActiveViewName(leaf: WorkspaceLeaf): string | null {
		const container = leaf.view.containerEl;

		// Try to read from the view tabs in the toolbar
		// The active view tab typically has an "is-active" or "mod-active" class
		const activeTab = container.querySelector(
			".bases-toolbar .is-active, .bases-toolbar .mod-active"
		);
		if (activeTab) {
			const text = activeTab.textContent?.trim();
			if (text) return text;
		}

		// Fallback: try the views menu button text
		const viewsMenu = container.querySelector(
			".bases-toolbar-views-menu .text-button-label"
		);
		if (viewsMenu) {
			const text = viewsMenu.textContent?.trim();
			if (text) return text;
		}

		// Fallback: try accessing the controller
		try {
			const controller = (leaf.view as any).controller;
			if (controller?.viewName) return controller.viewName;
		} catch {
			// Not available
		}

		// Last resort: if there's only one view, use it
		return null;
	}
}
