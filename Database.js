var mysql = new require("mysql").Client();
mysql.user = require("./dbInfo").DBInfo.Username;
mysql.password = require("./dbInfo").DBInfo.Password;
mysql.database = require("./dbInfo").DBInfo.Database;

var PendingUpdates = [];
var timer = setTimeout(Do, 60000);

exports.QueueUpdate = function(sql)
{
	for(var i = 0; i < arguments.length - 1; i++)
		sql = sql.replace(new RegExp("%" + i, "ig"), Escape(arguments[i + 1]));
	
	PendingUpdates.push(sql);
};

exports.ExecuteNonReader = function(sql)
{
	for(var i = 0; i < arguments.length - 1; i++)
		sql = sql.replace(new RegExp("%" + i, "ig"), Escape(arguments[i + 1]));
		
	mysql.connect();
	mysql.query(sql, function() { mysql.destroy(); });
}

exports.Finalize = function()
{
	console.log("Purging database queue...");
	clearTimeout(timer);
	Do(true);
	
	console.log("Exiting in 10 seconds or less");
	setTimeout(process.exit, 10000);
}

function Escape(str)
{
	return str.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "\\\"").replace(/\x00/g, "").replace(/\x1a/g, "");
}

function Do(final)
{
	if(PendingUpdates.length > 0)
	{
		mysql.connect();

		var i = -1;
		var DoInternal = function()
		{
			i++;
			if(i == PendingUpdates.length)
			{
				mysql.destroy();
				PendingUpdates = [];
				timer = setTimeout(Do, 60000);
				if(final)
					process.exit();
				return;
			}
			
			if(final)
				console.log("  -> Executing query: " + PendingUpdates[i]);
			
			mysql.query(PendingUpdates[i], DoInternal);
		};
		DoInternal();
	}
	else
	{
		if(final)
			process.exit();
		timer = setTimeout(Do, 60000);
	}
}
