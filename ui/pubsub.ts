/** Provides a simple pub-sub mechanism that is helpful especially for UI state management. */

type Func<Type> = (v: Type) => void;

/**
 * Initiate your variable with given type: `const newVar = new PubSub<string>("initial value")` and import this in all publishers and subscribers for this variable
 * When you want to publish use pub method: `newVar.pub(newValue)`
 * You can subscribe this value and run your provided function whenever its value changes (pub happens): `const ticket = newVar.sub(hadnler)`
 * You can unsubscribe from the variable by using your subscriber ticket: `newVar.unsub(ticket)`
 * You can also access the current subscribers or current value: `newVal.value`
 */
export class PubSub<Type> {
	_value: Type;
	_subscribers: Map<string, Func<Type>> = new Map();
	constructor(v: Type) {
		this._value = v;
	}

	get value(): Type {
		return this._value;
	}

	pub(newValue: Type): void {
		this._value = newValue;

		console.log("new value is published");

		// run each subscriber and remove if throws error
		this._subscribers.forEach((func, key) => {
			try {
				console.log("subscriber is called", func);
				func(newValue);
			} catch (e) {
				console.error(
					`Callback function ${func} does not exist or throws error! I removed it from subscribers! \n Error message: ${e}`,
				);
				this._subscribers.delete(key);
			}
		});
	}

	sub(func: Func<Type>): string {
		const key = Math.random().toString(36).slice(2);
		this._subscribers.set(key, func);
		return key;
	}

	unsub(key: string): void {
		this._subscribers.delete(key);
	}
}
