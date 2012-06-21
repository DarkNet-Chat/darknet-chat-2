var parser = require("url");

var Database = require("./Database");
var Utility = require("./Utility");
var History = require("./History");
var User = require("./User");

var incomingConnection = function(socket)
{
	User.FromToken(socket.manager.handshaken[socket.id].query.token, socket);
};

var attachToUser = function(user, socket)
{
	console.log(user.Username + " connected!");
};

exports.Start = function(port)
{	
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
