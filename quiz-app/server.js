const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {}; 
let currentQuestionIndex = -1;
let submittedCount = 0; 
let gameState = "intro"; // intro, tutorial, waiting, quiz, reveal
let scoreMultiplier = 1; // 점수 이벤트 배율
let showIDs = false; //디버그용 ID 표시 상태

const quizBank = [
    { type: "single", q: "연습문제: 당신은 제주도에 있나요?", a: ["네", "아니오"], cor: [0], desc: "튜토리얼 완료! 이제 대기실로 이동합니다." }, // 0번은 튜토리얼용
    { type: "single", q: "한라산의 높이는?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: [0], desc: "1,947m입니다!" },
    { type: "multi", q: "닌텐도 기기가 아닌 것은?", a: ["스위치", "플스", "게임보이", "엑박"], cor: [1, 3], desc: "플스는 소니, 엑박은 MS 제품입니다." }
];

io.on('connection', (socket) => {
    // 접속 시 자동 로직 실행 [cite: 531, 544]
    socket.on('join_waiting_room', (data) => {
        const { userID, nickname } = data;

        // 유저 정보 저장 또는 업데이트
        players[userID] = { 
            ...players[userID], // 기존 점수 등이 있다면 유지
            userID, 
            nickname, 
            socketID: socket.id, 
            online: true 
        };

        socket.userID = userID;

        // 접속 시 현재 디버그 상태(showIDs)를 포함하여 리스트 전송
        io.emit('update_user_list', { players: Object.values(players), showIDs });
    });

    // [추가] 방장의 ID 표시 토글 요청
    socket.on('toggle_show_ids', (password) => {
        if (password === '1234') {
            showIDs = !showIDs;
            io.emit('update_user_list', { players: Object.values(players), showIDs });
        }
    });

    // 방장의 컨트롤 신호 처리 [cite: 552]
    socket.on('request_start', (password) => {
        if (password === '1234') {
            currentQuestionIndex++;
            submittedCount = 0;
            scoreMultiplier = 1; // 새 문제 시작 시 배율 초기화
            
            if (currentQuestionIndex === 0) gameState = "tutorial";
            else if (currentQuestionIndex < quizBank.length) gameState = "quiz";
            else { 
                io.emit('game_over', Object.values(players).sort((a,b) => b.score - a.score));
                return;
            }

            io.emit('next_question', {
                index: currentQuestionIndex,
                gameState: gameState,
                type: quizBank[currentQuestionIndex].type,
                q: quizBank[currentQuestionIndex].q,
                a: quizBank[currentQuestionIndex].a,
                total: Object.values(players).filter(p => p.online).length
            });
        }
    });

    // 2배 이벤트 토글 (방장 전용)
    socket.on('toggle_multiplier', (password) => {
        if (password === '1234') {
            scoreMultiplier = (scoreMultiplier === 1) ? 2 : 1;
            io.emit('multiplier_update', scoreMultiplier);
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
            
            if (isCorrect && gameState !== "tutorial") { 
                p.score += (10 * scoreMultiplier); // 이벤트 배율 적용
            }
            io.emit('update_remaining', Object.values(players).filter(p => p.online).length - submittedCount);
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