
/*
 * Manages Event-Proxy Processes and makes global & local
 * load balancing decisions.
 */

var cplib = require("child_process");
var util  = require("util");

exports.createManager = function(config) {
	return new Manager(config).start();
}

var Manager = exports.Manager = function(config) {
	
	var config = config || {};

	/*
	 * Configurables
	 */
	this.minimum        = config.minimum || 1;
	this.maximum        = config.maximum || 100;
	this.max_per_child  = config.max_per_child || 8000;
	this.interface			= config.interface || "0.0.0.0";
	this.min_port       = config.min_port || 8000;
	this.max_port       = config.max_port || 9000;
	
	this.children	      = [];
	this.current_port   = this.min_port;

}

Manager.prototype.start = function() {

	for(var i = 0; i < this.minimum; i++) {

		(function(id, manager, interface, port){

			util.log("Spawning new Child[" + id + "]");

			var child = cplib.spawn("node", ["proxy.js", interface, port]);

			child.addListener("exit", function(code, signal) {
					util.log("Managed Child[" + id + "] returned 'exit'");
			});

			/* pump child's stdout to ours */
			util.pump(child.stdout, process.stdout);

			/* 
			 * Children use stderr to communicate useful information
			 * to to manager which enables it to make decisions
			 */
			child.stderr.addListener("data", function(data) {
					/*
					 * todo
					 */
			});

			manager.children.push(child);

		})(i, this, this.interface, this.current_port++);

	}

	return this;

}
