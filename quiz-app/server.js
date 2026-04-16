const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {}; 
let currentQuestionIndex = -1;
let submittedCount = 0; 
let gameState = "scene1"; // [시작] scene1: 접속 대기
let scoreMultiplier = 1; 
let showIDs = false; 

const quizBank = [
    { type: "single", q: "연습문제: 준비되셨나요?", a: ["네", "아니오"], cor: [0], desc: "튜토리얼 완료!" },
    { type: "single", q: "한라산의 높이는?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: [0], desc: "1,947m입니다!" },
    { type: "multi", q: "닌텐도 기기가 아닌 것은?", a: ["스위치", "플스", "게임보이", "엑박"], cor: [1, 3], desc: "플스는 소니, 엑박은 MS 제품입니다." }
];

// [추가] 다음 문제를 전송하는 핵심 함수
function startNextQuestion() {
    currentQuestionIndex++;
    submittedCount = 0;
    scoreMultiplier = 1;

    if (currentQuestionIndex < quizBank.length) {
        // 모든 유저의 제출 상태 초기화
        Object.values(players).forEach(p => p.answered = false);
        
        const qTag = (currentQuestionIndex === 0) ? "tutorial" : "quiz";
        io.emit('next_question', {
            index: currentQuestionIndex,
            gameState: qTag,
            type: quizBank[currentQuestionIndex].type,
            q: quizBank[currentQuestionIndex].q,
            a: quizBank[currentQuestionIndex].a,
            total: Object.values(players).filter(p => p.online).length
        });
        // 사이드바의 ✅ 아이콘 초기화를 위해 리스트 전송
        io.emit('update_user_list', { players: Object.values(players) });
    } else {
        // 게임 종료: 결과 전송
        const sortedRank = Object.values(players).sort((a, b) => b.score - a.score);
        io.emit('game_over', sortedRank);
        currentQuestionIndex = -1;
        gameState = "scene1";
    }
}

io.on('connection', (socket) => {
    socket.on('join_waiting_room', (data) => {
        const { userID, nickname } = data;
        if (!players[userID]) {
            players[userID] = { userID, nickname, score: 0, answered: false, socketID: socket.id, online: true };
        } else {
            players[userID].nickname = nickname;
            players[userID].online = true;
            players[userID].socketID = socket.id;
        }
        socket.userID = userID;
        io.emit('update_user_list', { players: Object.values(players) });
    });

    socket.on('request_start', (password) => {
        if (password === '1234') {
            if (gameState === "scene1") {
                gameState = "scene2"; // 설명 씬으로 전환
                io.emit('change_scene', "scene2");
            } else if (gameState === "scene2") {
                gameState = "quiz"; 
                startNextQuestion(); // 첫 번째 문제 시작
            } else {
                startNextQuestion(); // 다음 문제로 진행
            }
        }
    });

    socket.on('submit_answer', (selectedIndices) => {
        const p = players[socket.userID];
        if (p && !p.answered) {
            p.answered = true;
            submittedCount++;
            
            // 정답 체크 (밸런스 퀴즈 기능은 이후 quizBank에 type: "balance" 추가 시 구현 가능) [cite: 657]
            const correctAnswers = quizBank[currentQuestionIndex].cor;
            const isCorrect = selectedIndices.length === correctAnswers.length &&
                              selectedIndices.every(val => correctAnswers.includes(val));
            
            if (isCorrect && currentQuestionIndex > 0) { // 튜토리얼(0번) 제외 점수 부여
                p.score += (10 * scoreMultiplier);
            }
            
            io.emit('update_remaining', Object.values(players).filter(p => p.online).length - submittedCount);
            io.emit('update_user_list', { players: Object.values(players) });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userID && players[socket.userID]) {
            players[socket.userID].online = false;
            io.emit('update_user_list', { players: Object.values(players) });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`));