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
		util  = require("util"),
		http  = require("http");

var redis = require("./lib/vendor/redis-client"),
		io    = require("./lib/vendor/socket.io/lib/socket.io");

var GlobalState = require("./lib/global_state"),
		ClientState = require("./lib/client_state"),
    Dispatcher = require("./lib/dispatcher"),
    commands = require("./lib/commands");

/*
 * Base URL for RESTful calls to the Web Application
 */
var api_base_url = "http://localhost:3000/"

/* 
 * Number of raw connections (including unidentified clients)
 */
var raw_connections = 0;

/*
 * commands_client will allow us to issue queries to
 * our redis client store.
 */
commands_client = redis.createClient();

/* 
 * pubsub_client will be subscribed to the required 
 * topics on the redis pub-sub on clients behalf.
 */
pubsub_client = redis.createClient();

/* Initialize global state */
var global_state = new GlobalState(pubsub_client, commands_client, api_base_url);

/* Initialize the dispatcher */
var dispatcher = new Dispatcher(global_state);

/* Attach commands to the dispatcher */
dispatcher.on("authenticate", commands.authenticate);
dispatcher.on("create_user", commands.create_user);
dispatcher.on("location_update", commands.location_update);
dispatcher.on("create_event", commands.create_event);
dispatcher.on("join_event", commands.join_event);

/* 
 * System information page for our proxy .
 */
server = http.createServer(function(req, res) {
	var str = "<html><head><title>Statistics</title></head><body>";
	str += "<h1>Statistics</h1>";
	str += "Number of clients Connected: " + raw_connections + "<br />";
	str += "Number of clients Connected and Identified: " + global_state.num_clients();
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

var ip = "0.0.0.0";
var port = 8124;
if(process.argv[2]) ip = process.argv[2];
if(process.argv[3]) port = process.argv[3];

server.listen(port, ip);
util.log("Server running at http://" + ip + ":" + port + "/");

/* 
 * Socket server which provides functionality for
 * clients connecting to our proxy.
 */
var socket = io.listen(server/*, {log: null}*/);
socket.on("connection", function(client) {
		
	raw_connections++;

	var state = new ClientState(client);

	/* Here we have the option to set the heartbeat
	 * interval for this specific client.
	 *
	 * The default is 10 seconds, but for some clients we may
	 * want to increase this figure (e.g. iPhone for batter life
	 * purposes.
	 *
	 * client.options.heartbeatInterval = <new interval in msec>;
	 *
	 * We add an added random component to try and combat the
	 * bunching up of heartbeats which occurs with the setTimeout 
	 * method.
	 */
	client.options.heartbeatInterval = 120000 + (Math.random() * 60000);

	client.on("message", function(message) {
		
		if (message instanceof String) {
			sys.debug("String from user[guid=" + (state.guid != null ? state.guid : "<Unauthenticated>") + "]:" + message);
		}
		else {
			sys.debug("JSON Object from user[guid=" + (state.guid != null ? state.guid : "<Unauthenticated>") + "]:" + JSON.stringify(message));
		}

		try {
			dispatcher.dispatch_message(state, message);
		}
		catch(e) {
			sys.debug(e);
		}
	});

	client.on("disconnect", function() {
		raw_connections--;
		
		sys.debug("recieved disconnect from client " + state.guid);
		
		/* cleanup the global client state this this client and 
		 * then delete this state (will be cleaned up when we 
		 * return from socket.on anyway).
		 */
		global_state.remove_client_state(state);
		delete state;
	});

});
