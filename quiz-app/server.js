const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {}; 
let currentQuestionIndex = -1;
let submittedCount = 0; 
let gameState = "scene1"; 
let scoreMultiplier = 1; 

const quizBank = [
    { type: "single", q: "연습문제: 준비되셨나요?", a: ["네!", "아니오"], cor: [0], desc: "튜토리얼 완료!" },
    { type: "single", q: "한라산의 높이는?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: [0], desc: "한라산은 해발 1,947m입니다!" },
    { type: "multi", q: "닌텐도 기기가 아닌 것은?", a: ["스위치", "플스", "게임보이", "엑박"], cor: [1, 3], desc: "플스는 소니, 엑박은 MS 제품입니다." },
    { type: "ox", q: "딸기는 식물학적으로 '채소'에 해당한다?", a: ["O (맞음)", "X (틀림)"], cor: [0], desc: "밭에서 자라는 딸기는 채소(과채류)입니다." }
];

function startNextQuestion() {
    currentQuestionIndex++;
    submittedCount = 0;
    scoreMultiplier = 1;

    if (currentQuestionIndex < quizBank.length) {
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
        io.emit('update_user_list', { players: Object.values(players) });
    } else {
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
                gameState = "scene2";
                io.emit('change_scene', "scene2");
            } else if (gameState === "scene2") {
                gameState = "quiz"; 
                startNextQuestion();
            } else {
                startNextQuestion();
            }
        }
    });

    socket.on('request_reveal', (password) => {
        if (password === '1234' && currentQuestionIndex >= 0) {
            io.emit('reveal_answer', {
                correct: quizBank[currentQuestionIndex].cor,
                desc: quizBank[currentQuestionIndex].desc,
                ranking: Object.values(players).sort((a, b) => b.score - a.score)
            });
        }
    });

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
            
            if (isCorrect && currentQuestionIndex > 0) p.score += (10 * scoreMultiplier);
            
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
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));