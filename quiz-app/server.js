const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentQuestionIndex = -1;
let submittedCount = 0; // 현재 문제에 답한 인원

const quizBank = [
    { q: "1번 제주도 한라산의 높이는 정확히 몇 m일까요?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: 0, desc: "한라산은 해발 1,947m로 대한민국에서 가장 높은 산입니다!" },
    { q: "마리오가 1981년 처음 등장했을 때의 직업은?", a: ["배관공", "목수", "요리사", "의사"], cor: 1, desc: "처음 '동키콩'에 등장했을 때는 건설 현장의 목수였습니다." },
    { q: "웹페이지 실시간 통신 기술 이름은?", a: ["Socket.io", "HTTP 1.1", "C++ Direct", "FTP"], cor: 0, desc: "Socket.io는 양방향 실시간 통신을 가능하게 해주는 라이브러리입니다." },
    { q: "피카츄의 전국도감 번호는?", a: ["001", "007", "025", "151"], cor: 2, desc: "피카츄는 25번입니다. 1번은 이상해씨, 151번은 뮤죠!" },
    { q: "딸기의 식물학적 분류로 맞는 것은?", a: ["장미과", "국화과", "백합과", "버드나무과"], cor: 0, desc: "딸기는 놀랍게도 장미과에 속하는 다년생 초본입니다." },
    { q: "6번 답은 2번이다.", a: ["맞다", "아니다"], cor: 1, desc: "답은 2번이 맞습니다." }

];

io.on('connection', (socket) => {
    socket.on('join_waiting_room', (nickname) => {
        socket.nickname = nickname;
        players[socket.id] = { nickname: nickname, score: 0, answered: false };
        io.emit('update_user_list', Object.values(players).map(p => p.nickname));
    });

    socket.on('request_start', (password) => {
        if (password === '1234') {
            currentQuestionIndex++;
            submittedCount = 0; // 카운트 초기화
            
            if (currentQuestionIndex < quizBank.length) {
                // 유저들의 '답변 상태' 초기화
                Object.values(players).forEach(p => p.answered = false);
                
                const questionData = {
                    index: currentQuestionIndex,
                    q: quizBank[currentQuestionIndex].q,
                    a: quizBank[currentQuestionIndex].a,
                    total: Object.keys(players).length
                };
                io.emit('next_question', questionData);
            } else {
                const sortedRank = Object.values(players).sort((a, b) => b.score - a.score);
                io.emit('game_over', sortedRank);
                currentQuestionIndex = -1;
            }
        }
    });

    // 정답 공개 요청 (방장이 버튼 누를 때)
    socket.on('request_reveal', (password) => {
        if (password === '1234' && currentQuestionIndex >= 0) {
            const resultData = {
                correct: quizBank[currentQuestionIndex].cor,
                desc: quizBank[currentQuestionIndex].desc,
                ranking: Object.values(players).sort((a, b) => b.score - a.score)
            };
            io.emit('reveal_answer', resultData);
        }
    });

    socket.on('submit_answer', (answerIdx) => {
        if (players[socket.id] && !players[socket.id].answered) {
            players[socket.id].answered = true;
            submittedCount++;
            
            // 정답 체크
            if (answerIdx === quizBank[currentQuestionIndex].cor) {
                players[socket.id].score += 10;
            }
            
            // 모든 유저에게 "현재 X명 남음" 알림
            const remaining = Object.keys(players).length - submittedCount;
            io.emit('update_remaining', remaining);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update_user_list', Object.values(players).map(p => p.nickname));
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`));