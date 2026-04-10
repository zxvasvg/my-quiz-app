const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// 'public' 폴더 안에 있는 정적 파일(HTML, CSS 등)을 서빙합니다.
app.use(express.static('public'));

// 누군가 웹페이지에 접속했을 때 발생하는 이벤트
io.on('connection', (socket) => {
    console.log('새로운 유저 접속!');

    // 플레이어가 정답을 보냈을 때
    socket.on('submit_answer', (data) => {
        console.log(`${data.nickname}님의 정답: ${data.choice}`);
        
        // 모든 접속자(호스트 포함)에게 누가 뭘 골랐는지 다시 뿌려줍니다.
        io.emit('show_result', data);
    });

    socket.on('disconnect', () => {
        console.log('유저 접속 종료');
    });
});

// 서버가 제공하는 포트를 쓰고, 없으면 3000을 씁니다.
const PORT = process.env.PORT || 3000; 
http.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});