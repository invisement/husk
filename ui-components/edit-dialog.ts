import { css, html, LitElement } from "lit";
import { customElement, query } from "lit/decorators.js";

import { EventWaiter } from "jsr:@invisement/husk";

@customElement("edit-dialog")
export class EditDialog extends LitElement {
	@query("dialog")
	_dialog: HTMLDialogElement;

	@query("textarea")
	_textarea: HTMLTextAreaElement;

	eventWaiter = new EventWaiter<string>();

	render() {
		return html`
			<dialog>
				<form method="dialog">
					<textarea></textarea>
					<footer>
						<button @click=${this.close}>Save</button>
						<button @click=${this.cancel}>Cancel</button>
					</footer>
				</form>
			</dialog>
		`;
	}

	public async showModal(initialText: string = "") {
		this._textarea.value = initialText;
		this._dialog.showModal();
		const modifiedValue = await this.eventWaiter.value;
		return modifiedValue;
	}

	close() {
		this.eventWaiter.value = this._textarea.value;
	}

	cancel() {
		this.eventWaiter.value = "";
	}

	static styles = css`
		textarea {
			width: 90vw;
			max-width: 60em;
			min-height: 40em;
			max-height: 80vh;
			border: none;
			outline: none;
		}
		footer {
			margin-top: 2em;
			display: flex;
			justify-content: center;
			gap: 3em;
		}

		::backdrop {
			backdrop-filter: blur(3px);
		}
	`;
}
