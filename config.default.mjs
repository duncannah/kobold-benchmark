export default {
	// Interpreter and script paths
	// Make sure the kobold script is correct
	PYTHON: "python",
	KOBOLD: "../koboldcpp/koboldcpp.py",

	// Prompt and parameters to be sent to the model
	// You can grab these from the console when running the model interactively
	// For a simple benchmark, you can use the default prompt
	PROMPT: "Below is an instruction that describes a task. Write a response that appropriately completes the request. ...",

	// In most cases, you can leave this as-is
	PROMPT_PARAMETERS: {
		max_context_length: 2048,

		max_length: 100,
		rep_pen: 1.19,
		rep_pen_range: 1024,
		rep_pen_slope: 0.9,
		temperature: 0.79,
		tfs: 0.95,
		top_a: 0,
		top_k: 0,
		top_p: 0.9,
		typical: 1,
		sampler_order: [6, 0, 1, 3, 4, 2, 5],
		singleline: false,
		stop_sequence: ["\nYou:", "\n### Instruction:", "\n### Response:"],

		sampler_seed: 1337, // same seed on each run, for reproducibility
	},

	// Parameters that will be used for every run
	// First parameter is the model path
	DEFAULT_PARAMETERS: [
		["/run/media/duncan/Irminsul/AI/LL-Models/chronos-hermes-13b.ggmlv3.q5_K_M.bin"],
		["--useclblast", "0", "0"],
		["--blasbatchsize", "512"],
		["--threads", "4"],
		["--blasthreads", "4"],
		["--highpriority"],
		["--contextsize", "2048"],
	],

	// Parameters to test
	/*
	 * Parameters are specified as an array of objects, each with the following properties:
	 *     name: The name of the parameter, as it appears in the command line
	 * And one of the following:
	 *     values: An array of values to test
	 * or
	 *    from: The starting value
	 *    to: The ending value
	 *    step: The step size (default 1)
	 *
	 * The script will run every combination of the values of each parameter.
	 */
	PARAMETERS: [
		{
			name: "gpulayers",
			from: 0,
			to: 45,
			step: 1,
		},
	],
};
