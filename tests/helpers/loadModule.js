// Loads MMM-Netatmo.js the way MagicMirror's front-end module loader would,
// by stubbing the globals it expects (Module, Log, moment, config, NetatmoFormatter)
// and capturing the object passed to Module.register().
function loadDefinition() {
	jest.resetModules();

	global.config = { units: "metric", language: "en" };
	global.Log = {
		log: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn()
	};
	global.moment = require("moment");
	global.NetatmoFormatter = require("../../formatter.js");

	let captured = null;
	global.Module = { register: (name, definition) => { captured = definition; } };

	require("../../MMM-Netatmo.js");

	if (!captured) { throw new Error("MMM-Netatmo.js never called Module.register"); }
	return captured;
}

function createInstance(configOverrides) {
	const definition = loadDefinition();
	const instance = Object.assign(Object.create(definition), definition, {
		config: Object.assign({}, definition.defaults, configOverrides),
		identifier: "test-instance",
		name: "MMM-Netatmo",
		translate: function (key) { return key; }
	});
	return instance;
}

module.exports = { createInstance };
