/* converts event to async pattern

EventWaiter is mainly used in dialog. Client file/function opens dialog, await it to close. Then, it can go and read value or variables.

inside dialog:
const eventWaiter = new EventWaiter<string>()
- @click to close modal/dialog emit event: eventWaiter.value = returnValue
- in showModal: const returnValue = await eventWaiter.value

It can be used anywhere that we want to wait for an event to happen.
*/

export class EventWaiter<Type> extends EventTarget {
	eventName: string = "defaultEvent";

	get value(): Promise<Type> {
		return new Promise<Type>((resolve) => {
			this.addEventListener(
				this.eventName,
				(e: Event) => resolve((e as CustomEvent).detail),
				{ once: true }
			);
		});
	}

	set value(detail: Type) {
		this.dispatchEvent(new CustomEvent(this.eventName, { detail }));
	}
}
