import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const config = await import("./config.mjs")
	// .catch(() => import("./config.default.mjs"))
	.then((m) => m.default);

// Get all possible combinations of parameters
const combineObjects = ([head, ...[headTail, ...tailTail]]) => {
	if (!headTail) return head;

	const combined = headTail.reduce((acc, x) => {
		return acc.concat(head.map((h) => ({ ...h, ...x })));
	}, []);

	return combineObjects([combined, ...tailTail]);
};

const params = {};

for (const param of config.PARAMETERS) {
	if (!(param.name in params)) params[param.name] = [];

	if (param.values) {
		params[param.name].push(...param.values);
	} else {
		for (let i = param.from; i <= param.to; i += param.step || 1) {
			// Round to 3 decimal places, to avoid floating point errors
			params[param.name].push(Number(Number(i).toFixed(3)));
		}
	}
}

const combinations = [
	...new Set(
		combineObjects(
			Object.entries(params).map(([name, values]) =>
				values.map((value) => ({ [name]: value }))
			)
		).map((combination) => JSON.stringify(combination))
	),
].map((combination) => JSON.parse(combination));

const results = [];

for (const combination of combinations) {
	const parameters = config.DEFAULT_PARAMETERS.map((param) => param.slice());
	for (const [name, value] of Object.entries(combination)) {
		parameters.push([`--${name}`, value]);
	}

	// Using -u to disable buffering
	const PYTHON_ARGS = ["-u"];

	const command = [config.PYTHON, PYTHON_ARGS, config.KOBOLD, ...parameters.flat()];

	console.log(`Running command: ${command.join(" ")}`);

	const logs = {
		stdout: "",
		stderr: "",
	};

	const result = await new Promise((resolve) => {
		const kobold = child_process.spawn(command[0], command.slice(1), {
			stdio: "pipe",
			shell: true,
		});

		process.on("exit", () => {
			kobold.kill();
		});

		let endpoint = null;

		let promptSent = false;
		let done = false;

		kobold.stderr.setEncoding("utf8");
		kobold.stderr.on("data", (data) => {
			logs.stderr += data.toString();

			// OOM error
			if (data.toString().match(/out of memory$/)) {
				if (!done) {
					done = true;
					resolve({
						result: "error",
						args: combination,
						error: `OOM during ${promptSent ? "process/gen" : "init"}`,
					});
				}

				kobold.kill("SIGKILL");
			}
		});

		kobold.stdout.setEncoding("utf8");
		kobold.stdout.on("data", (data) => {
			logs.stdout += data.toString();

			// print the output
			// console.log(data.toString());

			if (endpoint == null) {
				const match = data.toString().match(/Please connect to custom endpoint at (.*)/);
				if (match) {
					endpoint = match[1];
					console.log(`Endpoint: ${endpoint}`);

					// Send the prompt
					promptSent = true;
					sendPrompt(endpoint, config.PROMPT, config.PROMPT_PARAMETERS).catch((err) => {
						// Sometimes the prompt fails when the prompt is done
						// Wait 5 seconds to let the other handlers process
						setTimeout(() => {
							if (!done) {
								done = true;
								resolve({
									result: "error",
									args: combination,
									error: "Unknown -- prompt failed",
								});
							}
						}, 5000);
					});
				}
			}

			// Check if the prompt is done
			if (endpoint != null) {
				// Dumb idea to parse the numbers, let's just store the whole output
				const match = data.toString().match(/^(CtxLimit:.*)$/m);
				// const match = data.toString().match(/^(Time Taken - Processing:.*)$/m);
				if (match) {
					kobold.kill();
					setTimeout(() => {
						// Kill after 5 seconds
						if (kobold.exitCode == null) {
							kobold.kill("SIGKILL");
						}
					}, 5000);

					done = true;
					return resolve({
						result: "success",
						args: combination,
						time: match[1],
					});
				}

				const abortedMatch = data.toString().match(/Generation Aborted/);
				if (abortedMatch) {
					kobold.kill("SIGKILL");

					if (!done) {
						done = true;
						resolve({
							result: "aborted",
							args: combination,
						});
					}
				}
			}
		});

		kobold.on("exit", () => {
			if (!done) {
				done = true;

				if (endpoint == null) {
					return resolve({
						result: "error",
						args: combination,
						error: "Endpoint not found",
					});
				}

				if (kobold.exitCode != 0) {
					return resolve({
						result: "error",
						args: combination,
						error: "Process exited with non-zero exit code",
					});
				}

				return resolve({
					result: "error",
					args: combination,
					error: "Process exited without error, but no result was found",
				});
			}
		});
	});

	// Write logs
	// Create logs directory if it doesn't exist
	fs.mkdirSync("logs", { recursive: true });

	["stdout", "stderr"].forEach((stream) => {
		const logName = [];

		for (const [name, value] of Object.entries(combination)) {
			logName.push(`${name}-${value}`);
		}

		fs.writeFileSync(path.join("logs", `${logName.join("_")}.${stream}.log`), logs[stream]);
	});

	results.push(result);

	console.log(result);
}

async function sendPrompt(endpoint, prompt, params) {
	console.log("Sending prompt...");

	const response = await fetch(endpoint + "/api/latest/generate", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ prompt, ...params }),
	});

	console.log("Prompt sent: ", response.status, response.statusText);
}

function argObjToShellArgs(obj) {
	const args = [];

	for (const [name, value] of Object.entries(obj)) {
		args.push(`--${name}`);
		args.push(value);
	}

	return args;
}

function resultsToHTML(results, cmd) {
	const time = new Date().toISOString();

	const html = [];

	html.push("<html><head>");

	html.push(`<title>Results at ${time}</title>`);

	html.push("</head><body>");

	html.push(`<style>
		body { background: #000; color: #fff; font-family: monospace; }
		table { border-collapse: collapse; }
		th, td { border: 1px solid #fff; padding: 0.5rem; text-align: left; }
		.err { opacity: 0.5; }
	</style>`);

	html.push(`<h1>Results</h1>`);

	html.push(`<p>Generated at ${time}</p>`);

	html.push(`<pre><code>${cmd}</code></pre>`);

	html.push("<table>");

	html.push("<tr>");
	html.push("<th>Result</th>");
	html.push("<th>Args</th>");
	html.push("<th>Time</th>");
	html.push("</tr>");

	for (const result of results) {
		html.push("<tr>");
		html.push(`<td>${result.result === "success" ? "✅" : "❌"}</td>`);
		html.push(`<td>${argObjToShellArgs(result.args).join(" ")}</td>`);
		html.push(
			`<td>${
				result.time || (result.error ? `<span class='err'>${result.error}</span>` : "?")
			}</td>`
		);
		html.push("</tr>");
	}

	html.push("</table>");

	html.push("</body></html>");

	return html.join("\n");
}

function saveResults() {
	fs.mkdirSync("results", { recursive: true });
	fs.writeFileSync(
		path.join("results", `${new Date().toISOString()}.html`),
		resultsToHTML(results, `${config.KOBOLD} ${config.DEFAULT_PARAMETERS.flat().join(" ")}`)
	);
}

// Write results
saveResults();

process.on("SIGINT", () => {
	if (results.length > 0) saveResults();

	process.exit(0);
});
