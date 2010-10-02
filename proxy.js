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
	res.writeHead(200, {"Content-Type": "text/html"});
	res.write("<html><head><title>Statistics</title></head><body>");
	res.write("<h1>Statistics</h1>");
	res.write("Clients: " + global_state.num_clients() );
	res.write("</body></html>");
	res.end();
});
server.listen(8124, "127.0.0.1");
console.log("Server running at http://127.0.0.1:8124/");

/* 
 * Socket server which provides functionality for
 * clients connecting to our proxy.
 */
var socket = io.listen(server);
socket.on("connection", function(client) {

	var state = new ClientState(client);

	client.on("message", function(message) {
		
		if(state.state == ClientState.State.Initial) {
			/* 
			 * Todo: Some Authentication and channel query protocol...
			 */
			state.guid = message;
			console.log("Received Identity from client: " + state.guid);
			global_state.add_client_state(state);
			global_state.add_client_to_topic("TopicA", state);
		}
		else {
			console.log("Received message from client:" + state.guid);
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
