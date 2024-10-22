import { Router } from "jsr:@invisement/husk@^0";

const router = new Router();

// JS decorators only works in class, so define a class and initiate it
new class {
	value = "hello";

	@router.assign("/say-hi/:id")
	hi(id: string) {
		return `Hi from routes ${this.value} to ${id}`;
	}

	@router.assign("/update-employee/:id", {
		method: "POST",
		payload: true,
	})
	updateEmployeeInfo(
		id: string,
		name: string,
		dob: string,
		salary: number,
	) {
		console.log(
			"I extract id from params, name from query, dob and salary from payload to process",
		);
		return { message: "I processed", id, name, dob, salary };
	}
}();

// you can also use push method
router.push(
	"/extra-route/:name",
	(name: string, lastName: string) =>
		`processed ${lastName} from query parameters and ${name} from path params.`,
	{ query: true },
);

// for static serving. Note that the second is string but in the form of JS template literals
router.push("/serve-file/:fileName", "/path/to/${fileName}.json");

Deno.serve(async (req) => {
	const resp = await router.serve(req);
	if (resp === null) {
		return new Response("404: Resource Not Found!", { status: 404 });
	}
	return resp;
});
