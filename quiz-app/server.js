const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// 접속 중인 유저 정보를 저장할 객체 { socketId: nickname }
let players = {};

io.on('connection', (socket) => {
    console.log('유저 접속 시도...');

    // 닉네임 입력 후 대기실 입장
    socket.on('join_waiting_room', (nickname) => {
        socket.nickname = nickname;
        players[socket.id] = nickname; // 소켓 ID를 키로 닉네임 저장
        
        // 전체 유저에게 업데이트된 리스트 전송
        io.emit('update_user_list', Object.values(players));
        console.log(`${nickname} 입장. 현재 인원: ${Object.keys(players).length}명`);
    });

    socket.on('request_start', (password) => {
        if (password === '1234') {
            io.emit('game_started');
        } else {
            socket.emit('error_msg', '방장 비밀번호가 틀렸습니다!');
        }
    });

    socket.on('disconnect', () => {
        if (socket.nickname) {
            delete players[socket.id]; // 나간 유저 제거
            io.emit('update_user_list', Object.values(players));
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});