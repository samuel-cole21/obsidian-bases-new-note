import { Plugin } from "obsidian";
import { NoteCreator } from "./note-creator";
import { ButtonReplacer } from "./button-replacer";
import { NewNoteSettingsModal } from "./settings-modal";

export default class BasesNewNotePlugin extends Plugin {
	private buttonReplacer: ButtonReplacer;

	async onload(): Promise<void> {
		const noteCreator = new NoteCreator(this.app);

		this.buttonReplacer = new ButtonReplacer(
			this.app,
			this,
			noteCreator,
			(context) => {
				new NewNoteSettingsModal(this.app, context).open();
			}
		);

		this.buttonReplacer.setup();
	}

	onunload(): void {
		if (this.buttonReplacer) {
			this.buttonReplacer.destroy();
		}
	}
}
