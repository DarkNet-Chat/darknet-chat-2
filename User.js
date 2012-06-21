var Database = require("./Database");
var Utility = require("./Utility");
var History = require("./History");
var User = require("./User");

var mysql = new require("mysql").Client();
mysql.user = require("./dbInfo").DBInfo.Username;
mysql.password = require("./dbInfo").DBInfo.Password;
mysql.database = require("./dbInfo").DBInfo.Database;

var regexPM = /^\/msg ([\S]*) (.*)/i;

var topic = "";

var Users = {};
var createUser = function(dbRow)
{
	if(!dbRow.ID)
		return null;
	
	var user = null;
	if(Users[dbRow.ID])
	{
		var user = Users[dbRow.ID];
		user.AvatarFilename = dbRow.AvatarFilename;
		user.Class = dbRow.Userclass;
		user.Title = dbRow.Rank;
		user.Role = dbRow.Role;
		user.Logon = dbRow.SignonTime;
		user.Token = dbRow.Token;
		user.TokenTimeout = dbRow.TokenTimeout;
	}
	else
	{
		var user = {
			ID: dbRow.ID,
			Username: dbRow.Username,
			AFKTime: -1,
			AFKMessage: "",
			AvatarFilename: dbRow.AvatarFilename,
			AvatarID: -1,
			Class: dbRow.Userclass,
			Title: dbRow.Rank,
			Role: dbRow.Role,
			Muted: false,
			Logon: dbRow.SignonTime,
			Token: dbRow.Token,
			TokenTimeout: dbRow.TokenTimeout,
			OfflineMessages: [],
			Connection: null,
			toString: function()
			{
				var json = "{";
				json += "\"ID\":\"" + this.ID + "\",";
				json += "\"Username\":\"" + this.Username + "\",";
				json += "\"AvatarPath\":\"http://chat.darkcooger.net/avatars/" + this.AvatarFilename + "?user=" + this.Username + "\",";
				json += "\"Class\":\"" + this.Class + "\",";
				json += "\"Role\":\"" + this.Role + "\",";
				json += "\"Title\":\"" + this.Title + "\",";
				json += "\"AFKTime\":" + this.AFKTime + ",";
				json += "\"AFKMessage\":\"" + this.AFKMessage + "\",";
				json += "\"Logon\":" + this.Logon;
				json += "}";
				return json;
			},
			Rooms: [],
			PendingMessages: [],
			AvatarHistory: [],
			LoadAvatars: function()
			{
				mysql.connect();
				var user = this;
				mysql.query("SELECT ID,Filename,LastUsed FROM AvatarHistory WHERE UserID='" + this.ID + "' ORDER BY LastUsed DESC", function(e, rows, c)
				{
					for(var row in rows)
					{
						row = rows[row];
						if(!row.ID)
							continue;
						if(user.AvatarFilename == row.Filename)
							user.AvatarID = row.ID;
						if(row.LastUsed <= 0)
							continue;
						user.AvatarHistory.push({ID:row.ID, URL:"http://chat.darkcooger.net/avatars/" + row.Filename});
					}
					mysql.destroy();
				});
			},
			DeleteAvatar: function(avatarID)
			{
				if(isNaN(avatarID))
					return;
					
				var user = this;
				mysql.connect();
				mysql.query("SELECT Filename FROM AvatarHistory WHERE ID=? AND UserID=?", [ avatarID, user.ID ], function(e, rows, c)
				{
					if(rows.length > 0)
					{
						var fn = rows[0].Filename;
						require("fs").unlink("/domains/darkcooger.net/chat/avatars/" + fn, function(err) { console.log("In DeleteAvatar, error on unlink: " + error); });
					}
						
					mysql.query("DELETE FROM AvatarHistory WHERE ID=? AND UserID=?", [avatarID, user.ID], function(e, r, c)
					{
						output = "AvatarHistory={";
						var comma = "";
				
						for(var i = 0; i < user.AvatarHistory.length; i++)
						{
							if(user.AvatarHistory[i].ID == avatarID)
							{
								user.AvatarHistory.remove(i--);
								continue;
							}
					
							output += comma;
							output += "\"" + user.AvatarHistory[i].ID + "\":\"" + user.AvatarHistory[i].URL + "\"";
							comma = ",";
						}
						output += "};Preferences.UpdateAvatarHistory();";
						user.SendMessage(output);
				
						mysql.destroy();
					});
				});
			},
			SwitchAvatar: function(avatarID)
			{
				if(isNaN(avatarID))
					return;
					
				var user = this;
				
				mysql.connect();
				mysql.query("SELECT Filename FROM AvatarHistory WHERE ID=? AND UserID=?", [ avatarID, user.ID ], function(e, rows, c)
				{
					if(rows.length > 0)
					{
						var fn = rows[0].Filename;
												
						user.AvatarHistory.unshift({ID:user.AvatarID, URL:"http://chat.darkcooger.net/avatars/" + user.AvatarFilename});
						
						user.AvatarFilename = fn;
						user.AvatarID = avatarID;
						
						// Either this or the client is flaking out on updating avatar history.  Takes two clicks.
						
						var output = "$('prefAvatarCurrentImg').src = 'avatars/" + fn + "';";
						output += "AvatarHistory={";
						var avsInHistory = 0;
						
						for(var i = 0; i < user.AvatarHistory.length; i++)
						{
							if(user.AvatarHistory[i].ID == avatarID)
							{
								user.AvatarHistory.remove(i--);
								continue;
							}
							
							if(avsInHistory > 0)
								output += ",";
							output += "\"" + user.AvatarHistory[i].ID + "\":\"" + user.AvatarHistory[i].URL + "\"";
							avsInHistory++;
						}
						output += "};Preferences.UpdateAvatarHistory();";
						user.SendMessage(output);
						
						require("./User").Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"userdata\",\"Room\":\"public\",\"User\":" + user.toString() + "}]});", "public");
						
						Database.QueueUpdate("UPDATE Users SET AvatarFilename='" + fn + "',JSON='%0' WHERE ID='" + user.ID + "'", user.toString());
						Database.QueueUpdate("UPDATE AvatarHistory SET LastUsed=" + Utility.Now() + " WHERE LastUsed=0");
						Database.QueueUpdate("UPDATE AvatarHistory SET LastUsed=0 WHERE ID=%0", avatarID);
					}
					mysql.destroy();
				});
			},
			SendMessage: function(msg)
			{				
				if(this.Connection != null)
				{
					this.Connection.write(msg);
					return true;
				}
				return false;
			},
			ProcessMessage: function()
			{
				var self = this;
				return function(msg)
				{
					try { msg = JSON.parse(msg); } catch(exception) { return; };
					
					if(!msg.Type)
						return;
					
					var type = msg.Type.toUpperCase();
					var room = safeRoomName(msg.Room);
					
					switch(type)
					{
						case "SWITCHAVATAR":
							self.SwitchAvatar(msg.Data);
							break;
							
						case "DELETEAVATAR":
							self.DeleteAvatar(msg.Data);
							break;
						
						case "SAVEPREF":
							if(!msg.Data)
								return;
								
							var name = msg.Data;
							var val = msg.Value;
								
							if(name != null && name != "")
								Database.ExecuteNonReader("INSERT INTO Preferences (UserID,PreferenceName,PreferenceValue) VALUES('%0','%1','%2') ON DUPLICATE KEY UPDATE PreferenceValue='%2'", self.ID, name, val);
							
						case "JOIN":
							if(self.Rooms.contains(room))
								return;
						
							if(room == "public")
							{
								self.Logon = Utility.Now();
								Database.QueueUpdate("UPDATE Users SET SignonTime=" + self.Logon + " WHERE ID='" + self.ID + "'");
								self.SendMessage("setTimeout(Server.IdleTimer, 1000);");
							}
						
							User.JoinRoom(self, msg.Room);
							
							var output = "Me = " + self.toString() + ";Server.Update({\"Type\":\"RoomInfo\",\"Data\":[{\"Room\":\"" + room + "\",\"Users\":[";

							var users = User.FromRoom(room);
							for(var i = 0; i < users.length; i++)
							{
								if(users[i].Role == "bot")
									continue;
									
								if(i > 0)
									output += ",";
								output += users[i].toString();
							}
							output += "]}]});";
							if(room == "public")
							{
								output += "Server.Update({\"Type\":\"Chat\",\"Data\":[" + History.toString() + "]});";
								output += "AvatarHistory={";
								for(var i = 0; i < self.AvatarHistory.length; i++)
								{
									if(i > 0)
										output += ",";
									output += "\"" + self.AvatarHistory[i].ID + "\":\"" + self.AvatarHistory[i].URL + "\"";
								}
								output += "};Preferences.UpdateAvatarHistory();";
							}
							output += "Server.Update({\"Type\":\"Topic\",\"Data\":\"" + topic + "\"});";

							self.SendMessage(output);
							break;
							
						case "LEAVE":
							if(room != "public")
							{
								User.LeaveRoom(self, room);
							}
							break;
						
						case "POST":
						case "AFK":
							var eid = Utility.MilliNow();
							var ts = Utility.Now();
							
							var msg = msg.Data.trim().replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
							
							if(msg.substr(0, 1) == "/")
							{
								var serverResponse = "Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"private\",\"Message\":\"@\",\"Timestamp\":" + ts + ",\"User\":{\"Username\":\"HAL 9000\",\"AvatarPath\":\"/images/eye.png\"}}]});";

								var role = self.Role.toLowerCase();
								var isAdmin = (role == "admin");
								var isMod = (isAdmin || role == "mod" || role == "bot");
								var isUser = (isMod || role == "user");

								if(msg.substr(0, 6).toLowerCase() == "/topic" && isUser)
								{
									var data = msg.substr(6);
									topic = data.trim();
									User.Broadcast("Server.Update({\"Type\":\"Topic\",\"Data\":\"" + data + "\"});");
									break;
								}

								if(msg.substr(0, 7).toLowerCase() == "/update" && isUser)
								{
									var user = self;
									var attr, val;
									var validAttributes = "CLASS and TITLE";
									
									if(isAdmin)
									{
										var bits = /\/update (\S*)\s*(\S*)\s*(.*)/i.exec(msg);
										if(bits == null)
										{
											self.Broadcast("alert('Bad format.  Format should be:\\n\\n   /update <user> <ROLE | CLASS | TITLE> [value]');");
											return;
										}
										user = User.FromName(bits[1]);
										attr = bits[2];
										val = bits[3];
										validAttributes = "ROLE, CLASS, and TITLE";
									}
									else
									{
										var bits = /\/update (\S*)\s*(.*)/i.exec(msg);
										if(bits == null)
										{
											self.Broadcast("alert('Bad format.  Format should be:\\n\\n   /update <CLASS | TITLE> [value]');");
											return;
										}
										attr = bits[1];
										val = bits[2];
										
										if(attr.toUpperCase() == "ROLE") { attr = "NONE"; }
									}
									
									if(user == null)
										self.SendMessage("alert('No such user.');");
									else
									{
										var updateColumn = false;
										
										switch(attr.toUpperCase())
										{
											case "ROLE":
												if(self == user)
													self.SendMessage("alert('Cannot change own role.');");
												else if(user.Username != "darkcooger")
												{
													val = val.toLowerCase();
													if(val != "admin" && val != "mod" && val != "user" && val != "subuser")
														self.SendMessage("Invalid role.  Valid roles are ADMIN, MOD, USER and SUBUSER.");
													else
													{
														user.Role = val;
														updateColumn = "Role";
														
														/*user.SendMessage("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"private\",\"Message\":\"Your role has been changed to @" + val + "@.\",\"Room\":\"" + room + "\",\"Timestamp\":" + Utility.Now() + ",\"User\":" + self.toString() + "}]});");
														
														var admins = User.FromRole("admin");
														for(var i = 0; i < admins.length; i++)
														{
															if(admins[i] == user)
																continue;
															
															admins[i].SendMessage("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"private\",\"Message\":\"" + user.Username + "'s role has been changed to @" + val + "@.\",\"Room\":\"" + room + "\",\"Timestamp\":" + Utility.Now() + ",\"User\":" + self.toString() + "}]});");
														}*/
														User.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"userdata\",\"Room\":\"public\",\"User\":" + user.toString() + "}]});", "public");
													}
												}
												break;
												
											case "CLASS":
												val = val.toLowerCase();
												if(val != "admin" && val != "mod" && val != "brown" && val != "green" && val != "blue" && val != "orange" && val != "red" && val != "purple" && val != "white")
												{
													self.SendMessage("alert('Invalid class.  Valid classes are: admin, mod, brown, green, blue, orange, red, purple, white');");
												}
												else
												{
													user.Class = val;
													User.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"userdata\",\"Room\":\"public\",\"User\":" + user.toString() + "}]});");
													updateColumn = "Userclass";
												}
												break;
												
											case "TITLE":
												user.Title = val;
												updateColumn = "Rank";
												User.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"userdata\",\"Room\":\"public\",\"User\":" + user.toString() + "}]});");
												break;
											
											default:
												self.SendMessage("alert('Invalid property.  Valid properties are " + validAttributes + "');");
												break;
										}
										
										if(updateColumn != false)
											Database.QueueUpdate("UPDATE Users SET " + updateColumn + "='" + val + "' WHERE ID='" + user.ID + "'");
									}
									
									return;
								}
								if(msg.substr(0, 6).toLowerCase() == "/alert" && isAdmin)
								{
									var alert = msg.substr(7).trim();
									if(alert == "")
										self.SendMessage("alert('Bad format.  Format should be:\\n\\n   /alert <message>');");
									else
										User.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"alert\",\"Message\":\"" + alert + "\",\"Room\":\"\",\"Timestamp\":" + ts + ",\"User\":" + self.toString() + "}]});");
									return;
								}
								
								if((msg.substr(0, 5).toLowerCase() == "/mute" || msg.substr(0, 7).toLowerCase() == "/unmute") && isAdmin)
								{
									var bits = /\/(un)?mute (\S*)/i.exec(msg);
									if(bits == null)
										self.SendMessage("alert('Format: /[un]mute <user>');");
									else
									{
										var isMute = (bits[1] != "un");
										var user = User.FromName(bits[2]);
										if(user == null)
											self.SendMessage("alert('No such user.');");
										else if(user.Role.toLowerCase() == "admin")
											self.SendMessage("alert('You cannot mute " + user.Username + "');");
										else
											user.Muted = isMute;
									}
									return;
								}

								if(msg.substr(0, 5).toLowerCase() == "/kick" && isMod)
								{
									var bits = /\/kick (\S*)\s*(.*)/i.exec(msg);
									if(bits == null)
										self.SendMessage("alert('Format: /kick <user> [message]');");
									else
									{
										var user = User.FromName(bits[1]);
										var reason = bits[2];
										if(reason == null || reason.trim() == "")
											reason = "";

										if(user == null || user.Connection == null)
											self.SendMessage("alert('No such user, or user not logged in.');");
										else
										{
											if(user.Role.toLowerCase() == "admin")
											{
												self.SendMessage("alert('You cannot kick " + user.Username + "');");
												return;
											}
											
											var message = "You have been kicked by " + self.Username + ".";
											var chatMessage = "/me has been kicked by *" + self.Username + "*";
											if(reason != "")
											{
												message += " [" + reason.trim().replace(/'/g, "\\'") + "]";
												chatMessage += " [" + reason.trim().replace(/'/g, "\\'") + "]";
											}											
											
											user.SendMessage("alert('" + message + "');");
											Database.QueueUpdate("INSERT INTO ChatEvents (EventID,UserID,Type,Message,Room,Timestamp,JSON) VALUES(" + eid + ",'" + user.ID + "','chat','%0','public'," + ts + ",'{\"EventID\":" + eid + ",\"Type\":\"chat\",\"Message\":\"%0\",\"Room\":\"public\",\"Timestamp\":" + ts + ",\"User\":%USER%}')", chatMessage);
											setTimeout(function()
											{
												User.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"chat\",\"Message\":\"" + chatMessage + "\",\"Room\":\"public\",\"Timestamp\":" + ts + ",\"User\":" + user.toString() + "}]});");
												History.Add({EventID:eid,Type:"chat",Message:chatMessage,Room:"public",Timestamp:ts,User:user});
												user.Connection.end();
											}, 500);
										}
									}
									return;
								}
							}
							
							if(!self.Rooms.contains(room))
								return;
							
							var pm = msg.match(regexPM);
							if(pm != null)
							{
								msg = pm[2].trim().replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");

								var target = User.FromName(pm[1]);
								if(target == null)
									self.SendMessage("alert('User " + pm[1] + " not found.');");
								else
								{
									var now = Utility.Now();
									if(target.SendMessage("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"private\",\"Message\":\"" + msg + "\",\"Room\":\"" + room + "\",\"Timestamp\":" + Utility.Now() + ",\"User\":" + self.toString() + "}]});") == true)
										self.SendMessage("function f" + now + "() { if(!Preferences.ShowPMAck) return; var d = document.createElement('div'); d.setAttribute('class', 'status'); d.appendChild(document.createTextNode('Private message sent to " + pm[1] + "')); Server.CurrentRoom.ChatLogDiv.appendChild(d); Server.CurrentRoom.ShouldScroll = (Server.CurrentRoom.ChatLogDiv.scrollTop > (Server.CurrentRoom.TotalHeight() - Server.CurrentRoom.ChatLogDiv.offsetHeight - 150)); Server.CurrentRoom.Scroll(); }; f" + now + "();");
									else
									{
										target.OfflineMessages.push("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"private\",\"Message\":\"" + msg + "\",\"Room\":\"" + room + "\",\"Timestamp\":" + Utility.Now() + ",\"User\":" + self.toString() + "}]});");
										self.SendMessage("function f" + now + "() { if(!Preferences.ShowPMAck) return; var d = document.createElement('div'); d.setAttribute('class', 'status'); d.appendChild(document.createTextNode('" + pm[1] + " is offline.  Your message will be delivered when they sign in again.')); Server.CurrentRoom.ChatLogDiv.appendChild(d); Server.CurrentRoom.ShouldScroll = (Server.CurrentRoom.ChatLogDiv.scrollTop > (Server.CurrentRoom.TotalHeight() - Server.CurrentRoom.ChatLogDiv.offsetHeight - 150)); Server.CurrentRoom.Scroll(); }; f" + now + "();");
									}
								}
							}
							else if(!self.Muted)
							{
								var msgType = "chat";
								if(type == "AFK")
									msgType = "afk";
								var json = "{\"Type\":\"" + msgType + "\",\"Message\":\"" + msg + "\",\"Room\":\"" + room + "\",\"Timestamp\":" + ts + ",\"User\":" + self.toString() + "}";
								User.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[" + json + "]});", room);
							
								History.Add({EventID:eid,Type:"chat",Message:msg,Room:room,Timestamp:ts,User:self});
								if(room == "public")
									Database.QueueUpdate("INSERT INTO ChatEvents (EventID,UserID,Type,Message,Room,Timestamp,JSON) VALUES(" + eid + ",'" + self.ID + "','chat','%0','%1'," + ts + ",'{\"EventID\":" + eid + ",\"Type\":\"chat\",\"Message\":\"%0\",\"Room\":\"%1\",\"Timestamp\":" + ts + ",\"User\":%USER%}')", msg, room);
							}
							break;
							
						case "SCROLLBACK":
							var ts = msg.Data / 1.0;
							if(ts == 0)
								return;
							
							if(room != "public")
								return;
								
							var limit = 10;
							var json = "{\"Type\":\"Scrollback\",\"Data\":[";
						
							mysql.connect();
							mysql.query("SELECT EventID,UserID,JSON FROM ChatEvents WHERE Room='public' AND EventID<" + ts + " ORDER BY EventID DESC LIMIT " + limit, function(e, rows, c)
							{
								if(rows)
								{
									for(var i = 0; i < rows.length; i++)
									{
										if(i > 0)
											json += ",";
										json += rows[i].JSON.replace("%USER%", Users[rows[i].UserID].toString());									
									}
								}
								mysql.destroy();
								
								json += "]}";
								self.SendMessage("Server.Update(" + json + ");");
							});																					
							break;

						case "PING":
							self.SendMessage("Server.Pong();");
							break;

						case "SETAFK":
							var msg = msg.Data.trim().replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
														
							if(msg == "")
							{
								self.AFKTime = -1;
								self.AFKMessage = "";
							}
							else
							{
								self.AFKTime = Utility.Now();
								self.AFKMessage = msg;
							}
							
							User.Broadcast("Server.Update({\"Type\":\"AFK\",\"Data\":\"" + msg + "\",\"User\":" + self.toString() + "})");								
							break;
						
						default:
							console.log("Unknown message from " + self.Username);
							console.log(msg);
							console.log("=========================");
							break;
					}
				}
			}
		};
		Users[user.ID] = user;
	}
	
	if(user != null)
	{
		if(user.AvatarFilename == "")
			user.AvatarFilename = "assvatar.jpg"
		if(user.Class == "")
			user.Class = "white";
		if(user.Role == "")
			user.Role = "User";
	}
	
	return user;
};

var safeRoomName = function(room)
{
	if(room == null || room.trim() == "")
		room = "public";
	return room.trim().toLowerCase();
};

var attachSocketToUser = function(user, socket)
{
	if(user == null || socket == null)
	{
		if(socket != null)
			socket.write("Server.InitForLogin();");
		return;
	}
		
	socket.addListener("data", user.ProcessMessage());
	socket.addListener("close", function()
	{
		console.log("Connection closed: " + user.Username);
		if(user.Connection == socket)
		{
			for(var i = 0; i < user.Rooms.length; i++)
				User.LeaveRoom(user, user.Rooms[i]);
			if(user.Connection != null)
				user.Connection = null;
		}
		socket.end();
	});
	user.Connection = socket;
	socket.write("Server.Start();");
	
	if(user.OfflineMessages.length > 0)
	{
		setTimeout(function()
		{
			for(var i = 0; i < user.OfflineMessages.length; i++)
				user.SendMessage(user.OfflineMessages[i]);
			user.OfflineMessages = [];
		}, 3000);
	};
}

exports.GetAll = function() { return Users; };

exports.LoadAll = function()
{
	mysql.connect();
	var users = mysql.query("SELECT * FROM Users", function(e, rows, f)
	{
		for(var row in rows)
		{
			var row = rows[row]; // ... your boat
			if(!row.ID)
				continue;
				
			createUser(row);
		}
		mysql.destroy();
		
		for(var uid in Users)
			Users[uid].LoadAvatars();
	});
};

exports.FromID = function(userID)
{
	return Users[userID];
};

exports.FromName = function(username)
{
	for(var uid in Users)
		if(Users[uid].Username.toLowerCase() == username.toLowerCase())
			return Users[uid];
	return null;
};

exports.FromRole = function(role)
{
	role = role.toLowerCase();
	var users = [];
	for(var uid in Users)
		if(Users[uid].Role == role)
			users.push(Users[uid]);
	return users;
};

exports.FromToken = function(token, socket)
{
	if(token == null || token == "")
	{
		socket.write("Server.InitForLogin();");
		return;
	}
			
	for(var uid in Users)
	{
		if(Users[uid].Token == token && Users[uid].TokenTimeout > Utility.Now())
		{
			// Update timeout to 5 days from now
			Users[uid].TokenTimeout = Utility.Now() + 432000;
			Database.QueueUpdate("UPDATE Users SET TokenTimeout=" + Users[uid].TokenTimeout + " WHERE ID='" + uid + "'");
			attachSocketToUser(Users[uid], socket);
			return Users[uid];
		}
	}
	
	// If we're here, either the token is invalid or
	// our metadata is old.  Hit the database.
	var proceed = false;
	mysql.connect();
	
	mysql.query("SELECT * FROM Users WHERE Token=? AND TokenTimeout>?", [token, Utility.Now()], function(e, rows, f)
	{
		var user = null;
		if(rows.length > 0)
		{
			user = createUser(rows[0]);
			if(user != null)
				Database.QueueUpdate("UPDATE Users SET TokenTimeout=" + user.TokenTimeout + " WHERE ID='" + user.ID + "'");
		}
		mysql.destroy();
		
		if(user != null)
			attachSocketToUser(user, socket);
		else
			socket.write("Server.InitForLogin();");
	});
	
	return null;
};

exports.FromRoom = function(room)
{
	room = safeRoomName(room);
	
	var users = [];
	for(var userID in Users)
		if(Users[userID].Rooms.contains(room))
			users.push(Users[userID]);
			
	return users;
};

exports.JoinRoom = function(user, room)
{
	room = safeRoomName(room);
	if(!user.Rooms.contains(room))
	{
		var eid = Utility.MilliNow();
		var timestamp = Utility.Now();
		if(user.Role != "bot")
		{
			this.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"join\",\"Message\":\"\",\"Room\":\"" + room + "\",\"Timestamp\":" + timestamp + ",\"User\":" + user.toString() + "}]})", room);
			History.Add({EventID:eid,Type:"join",Message:"",Room:room,Timestamp:timestamp,User:user});
			if(room == "public")
				Database.QueueUpdate("INSERT INTO ChatEvents (EventID,UserID,Type,Message,Room,Timestamp,JSON) VALUES(" + eid + ",'" + user.ID + "','join','','%0'," + timestamp + ",'{\"EventID\":" + eid + ",\"Type\":\"join\",\"Message\":\"\",\"Room\":\"%0\",\"Timestamp\":" + timestamp + ",\"User\":%USER%}')", room);
		}
		user.Rooms.push(room);
	}
};

exports.LeaveRoom = function(user, room)
{
	room = safeRoomName(room);
	if(user.Rooms.contains(room))
	{
		var eid = Utility.MilliNow();
		var timestamp = Utility.Now();
		
		user.Rooms.removeValue(room);
		
		if(user.Role != "bot")
		{
			this.Broadcast("Server.Update({\"Type\":\"Chat\",\"Data\":[{\"Type\":\"leave\",\"Message\":\"\",\"Room\":\"" + room + "\",\"Timestamp\":" + timestamp + ",\"User\":" + user.toString() + "}]})", room);
			History.Add({EventID:eid,Type:"leave",Message:"",Room:room,Timestamp:timestamp,User:user});
			if(room == "public")
				Database.QueueUpdate("INSERT INTO ChatEvents (EventID,UserID,Type,Message,Room,Timestamp,JSON) VALUES(" + eid + ",'" + user.ID + "','leave','','%0'," + timestamp + ",'{\"EventID\":" + eid + ",\"Type\":\"leave\",\"Message\":\"\",\"Room\":\"%0\",\"Timestamp\":" + timestamp + ",\"User\":%USER%}')", room);
		}
	}
};

exports.Broadcast = function(msg, type, room)
{
	room = safeRoomName(room);
	
	var post = "";
	if(msg != null && msg.trim() != "")
	{
		msg = msg.trim() + "\r\n";
		for(var userID in Users)
		{
			var user = Users[userID];
			if(!user.Rooms.contains(room))
				continue;
				
			user.SendMessage(msg, type);
		}
	}
};

exports.LogoutAll = function()
{
	var eid = Utility.MilliNow();
	var timestamp = Utility.Now();
	
	for(var userID in Users)
	{
		var user = Users[userID];
		if(user.Rooms.length > 0)
		{
			Database.QueueUpdate("INSERT INTO ChatEvents (EventID,UserID,Type,Message,Room,Timestamp,JSON) VALUES(" + eid + ",'" + user.ID + "','leave','','public'," + timestamp + ",'{\"EventID\":" + eid + ",\"Type\":\"leave\",\"Message\":\"\",\"Room\":\"public\",\"Timestamp\":" + timestamp + ",\"User\":%USER%}')");			
			eid++;
		}
		if(user.Connection != null)
			user.Connection.end();
	}
};

var GetJSON = function(msg, type, room)
{
	var json = "";
	switch(type)
	{
	}
	return json;
};

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
