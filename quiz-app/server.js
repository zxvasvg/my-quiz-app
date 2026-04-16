const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {}; 
let currentQuestionIndex = -1;
let submittedCount = 0; 
let gameState = "intro"; 
let scoreMultiplier = 1; 
let showIDs = false; // 디버그용 ID 표시 상태 [cite: 600]

const quizBank = [
    { type: "single", q: "연습문제: 준비되셨나요?", a: ["네", "아니오"], cor: [0], desc: "튜토리얼 완료!" },
    { type: "single", q: "한라산의 높이는?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: [0], desc: "1,947m입니다!" },
    { type: "multi", q: "닌텐도 기기가 아닌 것은?", a: ["스위치", "플스", "게임보이", "엑박"], cor: [1, 3], desc: "플스는 소니, 엑박은 MS 제품입니다." }
];

io.on('connection', (socket) => {
    socket.on('join_waiting_room', (data) => {
        const { userID, nickname } = data;
        
        // [수정] 새 유저일 경우 점수와 상태를 확실히 초기화 
        if (!players[userID]) {
            players[userID] = { 
                userID, nickname, 
                score: 0, 
                answered: false, 
                socketID: socket.id, 
                online: true 
            };
        } else {
            // 기존 유저인 경우 닉네임과 접속 상태만 업데이트
            players[userID].nickname = nickname;
            players[userID].socketID = socket.id;
            players[userID].online = true;
        }
        
        socket.userID = userID;
        io.emit('update_user_list', { players: Object.values(players), showIDs });
    });

    // 디버그용 ID 토글 [cite: 601, 606]
    socket.on('toggle_show_ids', (password) => {
        if (password === '1234') {
            showIDs = !showIDs;
            io.emit('update_user_list', { players: Object.values(players), showIDs });
        }
    });

    socket.on('request_start', (password) => {
        if (password === '1234') {
            currentQuestionIndex++;
            submittedCount = 0;
            scoreMultiplier = 1;
            gameState = (currentQuestionIndex === 0) ? "tutorial" : "quiz";
            
            if (currentQuestionIndex < quizBank.length) {
                Object.values(players).forEach(p => p.answered = false); // 제출 상태 초기화
                io.emit('next_question', {
                    index: currentQuestionIndex,
                    gameState: gameState,
                    type: quizBank[currentQuestionIndex].type,
                    q: quizBank[currentQuestionIndex].q,
                    a: quizBank[currentQuestionIndex].a,
                    total: Object.values(players).filter(p => p.online).length
                });
                io.emit('update_user_list', { players: Object.values(players), showIDs });
            } else {
                io.emit('game_over', Object.values(players).sort((a,b) => b.score - a.score));
            }
        }
    });

    socket.on('submit_answer', (selectedIndices) => {
        const p = players[socket.userID];
        if (p && !p.answered) {
            p.answered = true;
            submittedCount++;
            const correctAnswers = quizBank[currentQuestionIndex].cor;
            const isCorrect = selectedIndices.length === correctAnswers.length &&
                              selectedIndices.every(val => correctAnswers.includes(val));
            
            if (isCorrect && gameState !== "tutorial") p.score += (10 * scoreMultiplier);
            
            // 실시간 제출 상태 반영을 위해 리스트 전송 
            io.emit('update_remaining', Object.values(players).filter(p => p.online).length - submittedCount);
            io.emit('update_user_list', { players: Object.values(players), showIDs });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userID && players[socket.userID]) {
            players[socket.userID].online = false;
            io.emit('update_user_list', { players: Object.values(players), showIDs });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`));