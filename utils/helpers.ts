/** small helper functions like swiss army knife */

/** parse arguments based on special character at the beginning, or key=value pairs, or the rest as '_'
 * example: deno run your-script.ts . -arg1 -arg2 +arg3 ^arg4 persons=arg5 arg6 persons=arg7
 * {'-': [arg1, arg2], '+': [arg3], '^': [arg4], persons: [arg5, arg7], _: [arg6]}
 */
export function parseArgs(args: string[]): Record<string, string[]> {
	const specialChars = "~!@#%^&*+=-?".split("");
	const out: Record<string, string[]> = { "_": [] };
	specialChars.forEach((char) => out[char] = []);
	for (const arg of args) {
		if (specialChars.includes(arg[0])) {
			out[arg[0]].push(arg.substring(1));
		} else if (!arg.includes("=")) {
			out["_"].push(arg);
		} else {
			const [key, value] = arg.split("=", 2);
			out[key] = out[key] || [];
			out[key].push(value);
		}
	}
	return out;
}
