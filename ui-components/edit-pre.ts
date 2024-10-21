/**
 * It does:
 * - it accepts a pubsubVars variable name defined in pubsub.ts file
 * - shows a pre of the pubsub.value (and subscribe)
 * - on click pre, open an editor modal
 * - on modal close, does pubsub.pub the edited text
 * - on modal cancel, does nothing
 * <edit-pre pubsub=${pubsubVariable}></edit-pre>
 */

import { html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import { EditDialog } from "./edit-dialog.ts";
import "./edit-dialog.ts";

import { PubSub } from "../services/state-management.ts";

/** makes a snapshot of a text and on click it open a modal dialog to edit it */
@customElement("edit-pre")
export class EditPre extends LitElement {
	@property({ attribute: false })
	pubsub: PubSub<string>;

	@state()
	text: string = "";

	@query("edit-dialog")
	_dialog: EditDialog;

	render() {
		return html`
			<div @click=${this.edit}>${this.text}</div>

			<edit-dialog></edit-dialog>
		`;
	}

	firstUpdated() {
		//this._pubsub = pubsubVars[this.pubsub];
		this.text = this.pubsub.value;
		this.pubsub.sub((text) => (this.text = text));
	}

	async edit() {
		const modifiedValue = await this._dialog.showModal(this.pubsub.value);

		if (!modifiedValue) return; // if cancelled, do nothing

		this.pubsub.pub(modifiedValue);
	}
}
