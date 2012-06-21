var User = require("./User");
var history = [];

var ChatHistoryMessages = 0;
var HistoryLength = 50;

var Add = function(msgObj)
{
	// leave, join
	
	while(ChatHistoryMessages > HistoryLength)
	{
		var historyObj = history.shift();
		if(historyObj.Type == "chat")
			ChatHistoryMessages--;
	}
	
	if(msgObj.Type == "chat")
		ChatHistoryMessages++;
	
	history.push(msgObj);
}

exports.Init = function()
{
	var mysql = new require("mysql").createClient();
	mysql.user = require("./dbInfo").DBInfo.Username;
	mysql.password = require("./dbInfo").DBInfo.Password;
	mysql.database = require("./dbInfo").DBInfo.Database;
	
	mysql.connect();
	mysql.query("SELECT EventID,UserID,Type,Message,Room,Timestamp FROM ChatEvents WHERE Type='chat' OR Type='leave' OR Type='join' ORDER BY EventID DESC LIMIT " + HistoryLength, function(e, rows, columns)
	{
		for(var i = rows.length - 1; i >= 0; i--)
		//for(var i = 0; i < rows.length; i++)
			Add({EventID:rows[i].EventID, Type:rows[i].Type, Message:rows[i].Message, Room:rows[i].Room, Timestamp:rows[i].Timestamp, User:User.FromID(rows[i].UserID)});
		mysql.destroy();
	});
}

exports.Add = Add;

exports.toString = function()
{
	var str = "";
	var comma = "";
	for(var i = 0; i < history.length; i++)
	//for(var i = history.length - 1; i >= 0; i--)
	{
		//if(i > 0)
		//if(i < history.length - 1)
		//	str += ",";
		str += comma;
		str += "{\"EventID\":" + history[i].EventID + ",\"Type\":\"" + history[i].Type + "\",\"Message\":\"" + history[i].Message + "\",\"Room\":\"" + history[i].Room + "\",\"Timestamp\":" + history[i].Timestamp + ",\"User\":" + history[i].User.toString() + "}";
		comma = ",";
	}
	return str;
}
