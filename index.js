var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var gameStatuses = {
    NOT_STARTED: 0,
    STARTED: 1,
    IDLE: 2
};
app.get('/', function(req, res){
  res.sendFile(__dirname +'/index.html');
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
var rooms = [];
var games = [];
var ticks = 0;
var ticksIntervalWord = 10;
var ticksUpdateLevel = 50;
var WORDS = ["bedroom", "supply", "dead", "battle", "clear", "tasteful", "coordinated", "writer", "hammer", "snobbish", "crush", "curve", "near", "number", "industrious", "morning", "jittery", "strip", "silver", "well-groomed", "swing", "cheap", "slow", "pause", "faded", "idiotic", "angle", "cattle", "rare", "top"];

var progressWords = function(words, level) {
    for(var i = 0;i<words.length;i++) {
        words[i].hPos+=1*level;
    }
    return words;
}
var clearWords = function(words) {
    var index = 0;
    for(var i =0;i<words.length;i++) {
        if(words[i].hPos < 600) {
            index = i;
            break;
        }
    }
    words.splice(0, index);
    return words;
}
var allGamesUpdate = function() {
    ticks++;
    for(var i=0;i<rooms.length;i++) {
        if(rooms[i].status === gameStatuses.STARTED) {
            games[i].ticks++;
            if(ticks%Math.floor((ticksIntervalWord/games[i].players.length)) == 0) {
                games[i].players[Math.floor((ticks/ticksIntervalWord))%games[i].players.length].words.push({
                    hPos: 0,
                    vPos: Math.floor(Math.random()*500+100),
                    word: WORDS[Math.floor(Math.random()*WORDS.length)]
                });
            }
            for(var j = 0; j < games[i].players.length; j++) {
                if(games[i].players[j].words !== undefined){
                    games[i].players[j].words = clearWords(progressWords(games[i].players[j].words, games[i].level));
                }
            }
            if(games[i].ticks%ticksUpdateLevel == 0) {
                games[i].level++;
            }
            io.to('room'+i).emit('game update', games[i]);
        }
    }
}
var gameUpdateTask = setInterval(allGamesUpdate, 100);
var deleteAnswersFromWords = function(words, answer) {
      var toDelete = [];
      for(var i = words.length-1;i >=0;i--) {
          if(words[i].word === answer) {
              toDelete.push(i);
          }
      }
      for(var i = 0; i < toDelete.length ; i++) {
        words.splice(toDelete[i],1)
      }
      return {leftWords: words,points: toDelete.length};
}
io.on('connection', function(socket) {
  console.log('a user connected '+socket.id);
  io.emit('new room', rooms);
  socket.send(socket.id);
  socket.on('answer', function(data){
      var room = data.room;
      var playerId = data.pid-1;
      var sid = data.sid;
      var answer = data.text;
      if(games[room].status !== gameStatuses.STARTED || rooms[room].players[playerId].sid !== sid) {
        console.log('validation error');
      }
      var toDeleteIndexes = [];
      var result = deleteAnswersFromWords(games[room].players[playerId].words, answer);
      games[room].players[playerId].words = result.leftWords;
      games[room].players[playerId].points += Math.pow(result.points, 2)*100*games[room].level;
      io.to('room'+room).emit('game update', games[room]);
      
      
  });
  socket.on('disconnect', function() {
    console.log('user disconnected');
  });
  socket.on('create room', function() {
    console.log('user creates room');
    var newRoom = {
        roomName: 'room no.'+rooms.length,
        roomNumber: rooms.length,
        players: [],
        status: gameStatuses.NOT_STARTED
    };
    //var roomName = 'room no.'+rooms.length;
    rooms.push(newRoom);
    games.push({
        players: [],
        level: 1,
        ticks: 0
    });
    io.emit('room update', rooms);
  });
  socket.on('get rooms', function(id) {
      io.to(id).emit('room update', rooms);
  });
  socket.on('start game', function(id) {
      if(rooms[id].status === gameStatuses.STARTED) {
        return;
      }
      if(rooms[id].players.length < 2) {
        console.log('not enough players');
      //  return;
      }
      rooms[id].status = gameStatuses.STARTED;
      io.emit('room update', rooms);
  });
  socket.on('check user', function(sid) {
    for(var i=0;i<rooms.length;i++) {
        for(var j=0;j<rooms[i].players.length;j++) {
            if(rooms[i].players[j].sid === sid) {
                socket.join('room'+i);
                i = rooms.length;
                break;
            }
        }
    }
  });
  socket.on('join room', function(data) {
    var room = rooms[data.roomid];
    if(room.players.length < 6) {
        if(room.players.length > 0 && room.players.some(function(player){return player.sid === data.sid})) {
            return "already connected";
        }
        for(var i=0;i<rooms.length;i++) {
            for(var j=0;j<rooms[i].players.length;j++) {
                if(rooms[i].players[j].sid === data.sid) {
                    rooms[i].players.splice(j,1);
                    games[i].players.splice(j,1);
                    if(rooms[i].players.length === 0) {
                        rooms[i].status = gameStatuses.IDLE;
                    }
                    socket.leave('room'+i);
                    i = rooms.length;
                    break;
                }
            }
        }
        var newPlayer = {
            sid: data.sid,
            number: room.players.length
        };
        rooms[data.roomid].players.push(newPlayer);
        games[data.roomid].players.push({
            words: [],
            points: 0,
            sid: data.sid
        });
        socket.join('room'+data.roomid);
        io.emit('room update', rooms);
    }
  });
});
