var mysql = new require("mysql").Client();
mysql.user = require("./dbInfo").DBInfo.Username;
mysql.password = require("./dbInfo").DBInfo.Password;
mysql.database = require("./dbInfo").DBInfo.Database;

setInterval(function()
{

	mysql.connect();
	mysql.query("SELECT COUNT(*) FROM ChatEvents", function(a, b, c)
	{
		console.log(b);
		mysql.destroy();
	});

}, 1000);

