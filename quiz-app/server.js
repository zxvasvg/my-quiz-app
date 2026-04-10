const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentQuestionIndex = -1; // -1은 게임 시작 전 상태

const quizBank = [
    { q: "제주도 한라산의 높이는 정확히 몇 m일까요?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: 0 },
    { q: "닌텐도의 마리오가 1981년 '동키콩'에 처음 등장했을 때의 직업은?", a: ["배관공", "목수", "요리사", "의사"], cor: 1 },
    { q: "웹페이지를 움직이게 만드는 실시간 통신 기술의 이름은?", a: ["Socket.io", "HTTP 1.1", "C++ Direct", "FTP"], cor: 0 },
    { q: "포켓몬스터의 마스코트 '피카츄'의 전국도감 번호는?", a: ["001", "007", "025", "151"], cor: 2 },
    { q: "딸기의 식물학적 분류로 맞는 것은?", a: ["장미과", "국화과", "백합과", "버드나무과"], cor: 0 }
];

io.on('connection', (socket) => {
    // 닉네임 참여
    socket.on('join_waiting_room', (nickname) => {
        socket.nickname = nickname;
        players[socket.id] = { nickname: nickname, score: 0 };
        io.emit('update_user_list', Object.values(players).map(p => p.nickname));
    });

    // 방장의 시작/다음 문제 요청
    socket.on('request_start', (password) => {
        console.log("방장이 시작 요청을 보냄! 입력한 비번:", password); // 로그 추가
        
        if (password === '1234') {
            currentQuestionIndex++;
            console.log("현재 문제 인덱스:", currentQuestionIndex); // 로그 추가

            if (currentQuestionIndex < quizBank.length) {
                const questionData = {
                    index: currentQuestionIndex,
                    q: quizBank[currentQuestionIndex].q,
                    a: quizBank[currentQuestionIndex].a
                };
                io.emit('next_question', questionData);
                console.log("클라이언트로 문제 전송 완료!");
            } else {
                const sortedRank = Object.values(players).sort((a, b) => b.score - a.score);
                io.emit('game_over', sortedRank);
                currentQuestionIndex = -1;
            }
        } else {
            console.log("비밀번호 불일치!");
            socket.emit('error_msg', '방장 비밀번호가 틀렸습니다!');
        }
    });

    // 플레이어의 정답 제출
    socket.on('submit_answer', (answerIdx) => {
        if (currentQuestionIndex >= 0 && currentQuestionIndex < quizBank.length) {
            if (answerIdx === quizBank[currentQuestionIndex].cor) {
                if (players[socket.id]) players[socket.id].score += 10; // 맞으면 10점
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update_user_list', Object.values(players).map(p => p.nickname));
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server is running on ${PORT}`));