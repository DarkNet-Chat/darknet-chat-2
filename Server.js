var parser = require("url");

var Database = require("./Database");
var Utility = require("./Utility");
var History = require("./History");
var User = require("./User");

var incomingConnection = function(socket)
{
	console.log(socket.manager.handshaken[socket.id].query.token);
	socket.disconnect();
	//socket.addListener("connect", function(resource, token)
	//{
	//	console.log("Connect with token: " + token);
	//	User.FromToken(token, socket);
	//});
	//socket.addListener("error", function(e)
	//{
	//	console.log("Error on socket: " + e);
	//	socket.end();
	//});
};

var attachToUser = function(user, socket)
{
	console.log(user.Username + " connected!");
};

exports.Start = function(port)
{	
	//require("./ws").createServer(incomingConnection).listen(port);
	var io = require("socket.io").listen(port);
	io.sockets.on("connection", incomingConnection);
};

var Shutdown = function()
{
	console.log("Shutting down...");
	User.LogoutAll();
	
	Database.Finalize();
};

exports.Shutdown = Shutdown;
