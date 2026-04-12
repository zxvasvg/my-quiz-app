const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {}; // userID를 키로 점수와 상태 저장
let currentQuestionIndex = -1;
let submittedCount = 0; 
let gameState = "waiting"; // waiting, quiz, reveal

const quizBank = [
    { 
        type: "single", 
        q: "한라산의 높이는?", 
        a: ["1,947m", "1,950m", "2,024m", "1,850m"], 
        cor: [0], 
        desc: "1,947m입니다!" 
    },
    { 
        type: "ox", 
        q: "딸기는 식물학적으로 '채소'에 해당한다?", 
        a: ["O (맞음)", "X (틀림)"], 
        cor: [0], 
        desc: "딸기, 수박, 참외는 밭에서 자라므로 채소(과채류)로 분류됩니다." 
    },
    { 
        type: "multi", 
        q: "다음 중 닌텐도의 게임기가 '아닌' 것을 모두 고르세요.", 
        a: ["스위치", "플레이스테이션", "게임보이", "엑스박스"], 
        cor: [1, 3], 
        desc: "플레이스테이션은 소니, 엑스박스는 마이크로소프트 제품입니다." 
    },
    { 
        type: "multi", 
        q: "제주도 하면 떠오르는 것을 모두 고르세요.", 
        a: ["돌하르방", "한라봉", "남산타워", "흑돼지"], 
        cor: [0, 1, 3], 
        desc: "남산타워는 서울에 있습니다!" 
    },
    { 
        type: "single",
        q: "포켓몬 '피카츄'의 타입은?", 
        a: ["전기", "물", "불", "풀"], 
        cor: [0], 
        desc: "피카츄는 전기 타입 포켓몬입니다." 
    }
];

io.on('connection', (socket) => {
    // 유저 로그인 및 재접속 처리
    socket.on('join_waiting_room', (data) => {
        const { userID, userPW, nickname } = data;

        if (players[userID]) {
            if (players[userID].userPW === userPW) {
                players[userID].socketID = socket.id;
                socket.userID = userID;
                console.log(`${nickname}님 재접속`);
                syncClientState(socket);
            } else {
                socket.emit('error_msg', '비밀번호가 틀렸습니다.');
            }
        } else {
            players[userID] = {
                userID, userPW, nickname,
                score: 0, answered: false, socketID: socket.id
            };
            socket.userID = userID;
        }
        io.emit('update_user_list', Object.values(players).map(p => p.nickname));
    });

    // 방장의 문제 전송 (시작)
    socket.on('request_start', (password) => {
        if (password === '1234') {
            currentQuestionIndex++;
            submittedCount = 0;
            gameState = "quiz";

            if (currentQuestionIndex < quizBank.length) {
                Object.values(players).forEach(p => p.answered = false);
                io.emit('next_question', {
                    index: currentQuestionIndex,
                    type: quizBank[currentQuestionIndex].type,
                    q: quizBank[currentQuestionIndex].q,
                    a: quizBank[currentQuestionIndex].a,
                    total: Object.keys(players).length
                });
            } else {
                const sortedRank = Object.values(players).sort((a, b) => b.score - a.score);
                io.emit('game_over', sortedRank);
                currentQuestionIndex = -1;
                gameState = "waiting";
            }
        }
    });

    // 방장의 정답 공개
    socket.on('request_reveal', (password) => {
        if (password === '1234' && currentQuestionIndex >= 0) {
            gameState = "reveal";
            io.emit('reveal_answer', {
                correct: quizBank[currentQuestionIndex].cor,
                desc: quizBank[currentQuestionIndex].desc,
                ranking: Object.values(players).sort((a, b) => b.score - a.score)
            });
        }
    });

    // 정답 제출 처리
    socket.on('submit_answer', (selectedIndices) => {
        const p = players[socket.userID];
        if (p && !p.answered) {
            p.answered = true;
            submittedCount++;

            const correctAnswers = quizBank[currentQuestionIndex].cor;
            const isCorrect = selectedIndices.length === correctAnswers.length &&
                              selectedIndices.every(val => correctAnswers.includes(val));

            if (isCorrect) p.score += 10;
            io.emit('update_remaining', Object.keys(players).length - submittedCount);
        }
    });

    // 중간에 들어온 유저에게 현재 상태 맞춰주기
    function syncClientState(targetSocket) {
        if (currentQuestionIndex >= 0) {
            if (gameState === "quiz") {
                targetSocket.emit('next_question', {
                    index: currentQuestionIndex,
                    type: quizBank[currentQuestionIndex].type,
                    q: quizBank[currentQuestionIndex].q,
                    a: quizBank[currentQuestionIndex].a,
                    total: Object.keys(players).length
                });
            } else if (gameState === "reveal") {
                targetSocket.emit('reveal_answer', {
                    correct: quizBank[currentQuestionIndex].cor,
                    desc: quizBank[currentQuestionIndex].desc,
                    ranking: Object.values(players).sort((a, b) => b.score - a.score)
                });
            }
        }
    }

    socket.on('disconnect', () => {
        console.log("연결 끊김");
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));