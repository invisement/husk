import { Router } from "jsr:@invisement/husk@^0";

const router = new Router();
class Routes {
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
}
const _routes1 = new Routes();

router.push(
	"/extra-route/:name",
	(name: string, lastName: string) =>
		`processed ${lastName} from query parameters and ${name} from path params.`,
	{ query: true },
);

Deno.serve((req) => {
	const resp = router.serve(req);
	if (resp === null) {
		return new Response("404: Resource Not Found!", { status: 404 });
	}
	return new Response(resp as BodyInit);
});
