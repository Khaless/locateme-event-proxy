
var sys = require("sys");
var rest  = require("./vendor/restler/restler");

exports.authenticate = function authenticate(global_state, client_state, params, response_id) {

	/* 
	 * Todo: Some Authentication and channel query protocol...
	 */
	client_state.authenticate(params["guid"]);
	sys.debug("Received Identity from client: " + client_state.guid);
	
	/* 
	 * Add this user to the global state collection as soon as we
	 * know who they are.
	 */
	global_state.add_client_state(client_state);

	/* 
	 * Join this user to the active topics they should be subscribed to.
	 *
	 * In this prorotype user:<lowercase guid>:topics is a set containing
	 * the topics they should be subscribed to.
	 */
	global_state.commands_client.smembers("user:" + client_state.guid + ":events", function(err, members) {
		if (err) util.log(err, "TODO: Error Handling..." + err);
		if (members) {
			members.forEach(function(member) {
				util.log("Adding User " + client_state.guid + " to Event (topic) " + member);
				global_state.add_client_to_topic(member.toString(), client_state);
			});
		}

		client_state.client.send({
			result: {},
			error: null,
			id: response_id
		});

	});
}

exports.location_update = function location_update(global_state, client_state, params, response_id) {
	/* todo: sanitize input */
	global_state.commands_client.set("user:" + client_state.guid + ":location", JSON.stringify(params), function(err, res) {
		if(res != true) {
		sys.debug("Error updating location for " + client_state.guid + ": " + err);
		}
		else {
		/* Update was successful. Write to the Event topics which this user is a part of. */
		var msg = {
		"type": "location_update",
		"user": client_state.guid,
		"data": params, //: todo passing user input to other users is bad. 2bfixed
		};
		client_state.topics.forEach(function(topic) {
			global_state.commands_client.publish("topic:" + topic, JSON.stringify(msg), function(err, res) {
				if(res != true) {
				sys.debug("Error publishing to topic " + topic);
				}
				});
			});
		}
	});
}

exports.create_event = function create_event(global_state, client_state, params, response_id) {
		proxy_to_app(global_state, client_state, "events/", { name: params["name"] }, response_id);
}

exports.join_event = function join_event(global_state, client_state, params, response_id) {
		proxy_to_app(global_state, client_state, "events/" + params["guid"] + "/join/", {}, response_id);
}

/* Refactor this */
function proxy_to_app(global_state, client_state, path, data, response_id)  {
	// Call Website RESTful service to create an event
	rest.post(global_state.api_base_url + path, {
		data: data,
		headers: {
			"X-Authenticated-By-Proxy":  client_state.guid,
			"Accept": "application/json"
		}
	}).addListener("success", function(data, response) {
		// Success, created send message back to client with details.
		client_state.client.send({
			result: data,
			error: null,
			id: response_id
		});
	}).addListener("error", function(data, response) {
		// Failure, report an error back.
		sys.debug("Error creating event");
		sys.debug(response);
		sys.debug(data);
		client_state.client.send({
			result: null,
			error: "Error",
			id: response_id
		});
	});
}

