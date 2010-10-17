/*
 * Event Proxy Prototype
 * =====================
 *
 * Author: Mathew Rodley <mathew@rodley.com.au>
 *
 * Assumptions:
 * 1) Redis is running
 * 2) The following key is setup in redis:
 *		user:<lowercase guid>:topics = Set [ TopicA, TopicB, TopicC ]
 *
 * 3) Once joined a user sends their GUID over the Websocket to
 *		identify themselfs. They will then be subscribed to the 
 *		topics listed in the set at key user:<lowercase guid>.topics
 *
 * To Run:
 * 1) Start Redis with redis-server
 * 2) Add appropriate keys
 * 3) Start Proxy with node proxy.js
 *
 */

var sys   = require("sys"),
		http  = require("http"),
		redis = require("./lib/redis-client"),
		io    = require("./lib/socket.io/lib/socket.io");

require('./global_state');
require('./client_state');

/* 
 * pubsub_client will be subscribed to the required 
 * topics on the redis pub-sub on clients behalf.
 */
pubsub_client = redis.createClient();

/*
 * commands_client will allow us to issue queries to
 * our redis client store.
 */
commands_client = redis.createClient();

/* Initialize global state */
var global_state = new GlobalState(pubsub_client);

/* 
 * System information page for our proxy .
 */
server = http.createServer(function(req, res) {
	var str = "<html><head><title>Statistics</title></head><body>";
	str += "<h1>Statistics</h1>";
	str += "Number of clients connected: " + global_state.num_clients();
	str += "<h1>Clients</h1>";
	for(var guid in global_state.cstate_by_guid) {
		str += "<h3>" + guid + "</h3><ul>";
		global_state.cstate_by_guid[guid].topics.forEach(function(topic) {
			str += "<li>" + topic + "</li>";
		});
		str += "</ul>";
	}
	str += "</body></html>";
	res.writeHead(200, {"Content-Type": "text/html", "Content-Length": str.length});
	res.write(str);
	res.end();
});
server.listen(8124, "0.0.0.0");
console.log("Server running at http://127.0.0.1:8124/");

/* 
 * Socket server which provides functionality for
 * clients connecting to our proxy.
 */
var socket = io.listen(server);
socket.on("connection", function(client) {

	var state = new ClientState(client);

	/* Here we have the option to set the heartbeat
	 * interval for this specific client.
	 *
	 * The default is 10 seconds, but for some clients we may
	 * want to increase this figure (e.g. iPhone for batter life
	 * purposes.
	 *
	 * client.options.heartbeatInterval = <new interval in msec>;
	 */

	client.on("message", function(message) {
		
		if(state.state == ClientState.State.Initial) {
			
			/* 
			 * Todo: Some Authentication and channel query protocol...
			 */
			state.guid = message;
			console.log("Received Identity from client: " + state.guid);

			state.state = ClientState.State.Authenticated;
			
			/* 
			 * Add this user to the global state collection as soon as we
			 * know who they are.
			 */
			global_state.add_client_state(state);

			/* 
			 * Join this user to the active topics they should be subscribed to.
			 *
			 * In this prorotype user:<lowercase guid>:topics is a set containing
			 * the topics they should be subscribed to.
			 */
			commands_client.smembers("user:" + state.guid + ":events", function(err, members) {
				if (err) console.log(err, "TODO: Error Handling..." + err);
				if (members) {
					members.forEach(function(member) {
						console.log("Adding User " + state.guid + " to Event (topic) " + member);
						global_state.add_client_to_topic(member.toString(), state);
					});
				}
			});

		}
		else {
			console.log("Received some sort of message from client:" + state.guid);
		}

	});

	client.on("disconnect", function() {
		console.log("Recieved disconnect from client:" + state.guid);
		
		/* cleanup the global client state this this client and 
		 * then delete this state (will be cleaned up when we 
		 * return from socket.on anyway).
		 */
		global_state.remove_client_state(state);
		delete state;

	});

});
