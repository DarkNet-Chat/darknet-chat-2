var SERVER_PORT = 8889;

require("./User").LoadAll();
setTimeout(require("./History").Init, 2000);
setTimeout(function()
{
	require("./Server").Start(SERVER_PORT);
	console.log("Server listening on port " + SERVER_PORT);
}, 4000);

process.on("SIGINT", function()
{
	require("./Server").Shutdown();
});


/* * /

var sstart = function(port) { return function() { require("./Server").Start(port); console.log("Server listening on port " + port); } };

require("./User").LoadAll();
setTimeout(require("./History").Init, 3000);
setTimeout(sstart(SERVER_PORT), 6000);
//require("./Server").Start(SERVER_PORT);
//console.log("Server listening on port " + SERVER_PORT);

process.on("uncaughtException", function(e)
{
	console.log("UNHANDLED EXCEPTION: " + e);
	//console.log(arguments.callee.trace());
	//console.log(trace(arguments.callee.trace()));
});

process.on("SIGINT", function()
{
	require("./Server").Shutdown();
});

Function.prototype.trace = function()
{
    var trace = [];
    var current = this;
    while(current)
    {
        trace.push(current.signature());
        current = current.caller;
    }
    return trace;
}
Function.prototype.signature = function()
{
    var signature = {
        name: this.getName(),
        params: [],
        toString: function()
        {
            var params = this.params.length > 0 ?
                "'" + this.params.join("', '") + "'" : "";
            return this.name + "(" + params + ")"
        }
    };
    if(this.arguments)
    {
        for(var x=0; x<this .arguments.length; x++)
            signature.params.push(this.arguments[x]);
    }
    return signature;
}
Function.prototype.getName = function()
{
    if(this.name)
        return this.name;
    var definition = this.toString().split("\n")[0];
    var exp = /^function ([^\s(]+).+/;
    if(exp.test(definition))
        return definition.split("\n")[0].replace(exp, "$1") || "anonymous";
    return "anonymous";
}
//*/

/*
var sockets = [];

var ws = require("./ws");
ws.createServer(function(sock)
{
	sock.addListener("connect", function(r)
	{
		console.log("Connect: " + r);
		sockets.push(sock);
	});
	
	sock.addListener("data", function(d)
	{
		console.log("Data: " + d);
		try { d = JSON.parse(d); } catch(exception){ return };
		console.log(d);
	});
	
	sock.addListener("close", function()
	{
		console.log("Closed");
		sockets.removeValue(sock);
		sock.close();
	});
	
}).listen(8888);

setInterval(function()
{
	for(var i = 0; i < sockets.length; i++)
		sockets[i].write("You're still alive!");
}, 3000);

Array.prototype.remove = function(index)
{
	index = index / 1.0;
	
	var rest = this.slice(index + 1);
	this.length = this.length - (rest.length + 1);
	return this.push.apply(this, rest);
};

Array.prototype.contains = function(element)
{
	for(key in this)
		if(this[key] == element)
			return true;
	return false;
};

Array.prototype.removeValue = function(element)
{
	for(var i = 0; i < this.length; i++)
		if(this[i] == element)
			return this.remove(i);
	return this;
};
*/
