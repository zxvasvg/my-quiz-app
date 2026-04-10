const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let connectedUsers = 0;

io.on('connection', (socket) => {
    // 1. 새로운 사람이 들어오면 전체 인원수 업데이트
    connectedUsers++;
    io.emit('update_count', connectedUsers);
    console.log(`현재 접속자: ${connectedUsers}명`);

    // 2. 닉네임 입력하고 대기실 입장
    socket.on('join_waiting_room', (nickname) => {
        socket.nickname = nickname;
        console.log(`${nickname}님이 대기실에 입장했습니다.`);
    });

    // 3. 방장이 '시작' 버튼을 눌렀을 때 모든 플레이어에게 알림
    socket.on('request_start', (password) => {
        // 간단한 방장 인증 (예: 비번 '1224')
        if (password === '1224') {
            io.emit('game_started');
        } else {
            socket.emit('error_msg', '방장 비밀번호가 틀렸습니다!');
        }
    });

    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('update_count', connectedUsers);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});