
require.paths.unshift("./node_modules");

var manager = require ("./lib/manager");

manager.createManager({
	minimum: 1,
});
