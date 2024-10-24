/** Converts event pattern to async pattern
 * Example: if you want to open a dialog model and then get its modified value after closing:
 * const eventWaiter = new EventWaiter<string>()
 * - @click to close modal/dialog emit event: eventWaiter.value = returnValue
 * - in showModal: const returnValue = await eventWaiter.value
 */

/** Converts event pattern to async pattern for ease of use and readability. It accepts any type of variables as a generic argument.
 * `const eventWaiter = new EventWaiter<string>()`
 * EventWaiter has getter and setter.
 * - The getter is async and you use where you want to wait for an event to happen. `const returnValue = await eventWaiter.value`
 * - When the waited event happens, just set the value `@click= ${eventWaiter.value = newValue}`.
 */
export class EventWaiter<Type> extends EventTarget {
	eventName: string = "defaultEvent";

	get value(): Promise<Type> {
		return new Promise<Type>((resolve) => {
			this.addEventListener(
				this.eventName,
				(e: Event) => resolve((e as CustomEvent).detail),
				{ once: true },
			);
		});
	}

	set value(detail: Type) {
		this.dispatchEvent(new CustomEvent(this.eventName, { detail }));
	}
}
