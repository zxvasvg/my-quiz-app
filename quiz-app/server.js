const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// [추가] 방장 비밀번호 상수 관리
const HOST_PASSWORD = "1224";

let players = {};
let offlinePlayers = {};
let currentQuestionIndex = -1;
let submittedCount = 0; 
let gameState = "scene1"; 
let scoreMultiplier = 1; 

const quizBank = [
    { type: "single", q: "0.연습문제: 준비되셨나요?", a: ["네!", "아니오"], cor: [0], desc: "튜토리얼 완료!" },
    { type: "single", q: "1.한라산의 높이는?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: [0], desc: "한라산은 해발 1,947m입니다!" },
    { type: "single", q: "2.닌텐도 기기가 아닌 것은?", a: ["스위치", "플스", "게임보이", "wii"], cor: [1], desc: "플스는 소니제품입니다." },
    { type: "ox", q: "3.딸기는 식물학적으로 '채소'에 해당한다?", a: ["O (맞음)", "X (틀림)"], cor: [0], desc: "밭에서 자라는 딸기는 채소(과채류)입니다." },
    { type: "balance", q: "[밸런스] 4.좋아하는 치킨 종류는?", a: ["양념치킨", "후라이드치킨"], desc: "가장 많이 나온 답이 승리!" },
    { type: "balance", q: "[밸런스] 5.더 선호하는 스타일은?", a: ["월급 170 백수", "월급 580 키즈(9:00 ~ 19:00)"], desc: "가장 많이 나온 답이 승리!" },
    { type: "balance", q: "[밸런스] 6.견디기 힘든 최악의 상황은..?", a: ["한여름에 에어컨 없이 지내기", "한겨울에 온수 없이 샤워하기", "1년 동안 탄산음료/커피 금지"], desc: "가장 많이 나온 답이 승리!" },
    { type: "balance", q: "[밸런스] 7.초능력을 딱 하나만 가질 수 있다면", a: ["순간이동", "시간조절(과거로가기/멈추기)", "투명인간"], desc: "가장 많이 나온 답이 승리!" },
    { type: "balance", q: "[밸런스] 8.한 곳에서만 살 수 있다면..?", a: ["10평 서울", "20평 부산", "30평 제주"], desc: "가장 많이 나온 답이 승리!" }
];

const offlineData = [
    { userID: "off_01", nickname: "JJO", answers: [[0], [0], [1], [0], [0], [1], [0], [0], [1]] },
    { userID: "off_02", nickname: "choyoung", answers: [[0], [1], [1], [1], [1], [0], [1], [0], [0]] }
];

// 온라인+오프라인 통합 리스트를 클라이언트에 전송하는 함수
function broadcastUserList() {
    const all = [...Object.values(players), ...Object.values(offlinePlayers)];
    io.emit('update_user_list', { players: all });
}

function startNextQuestion() {
    currentQuestionIndex++;
    submittedCount = 0;
    scoreMultiplier = 1;

    io.emit('multiplier_update', 1);

    if (currentQuestionIndex < quizBank.length) {
        Object.values(players).forEach(p => {
            p.answered = false;
            p.isCorrect = false;
        });
        
        io.emit('next_question', {
            index: currentQuestionIndex,
            gameState: (currentQuestionIndex === 0) ? "tutorial" : "quiz",
            type: quizBank[currentQuestionIndex].type,
            q: quizBank[currentQuestionIndex].q,
            a: quizBank[currentQuestionIndex].a,
            total: Object.values(players).filter(p => p.online).length
        });
        broadcastUserList();
    } else {
        const all = [...Object.values(players), ...Object.values(offlinePlayers)];
        const sortedRank = all.sort((a, b) => b.score - a.score);
        io.emit('game_over', sortedRank);
        currentQuestionIndex = -1;
        gameState = "scene1"; 
    }
}

io.on('connection', (socket) => {
    socket.on('join_waiting_room', (data) => {
        const { userID, nickname } = data;
        if (!players[userID]) {
            players[userID] = { userID, nickname, score: 0, answered: false, isCorrect: false, socketID: socket.id, online: true };
        } else {
            players[userID].nickname = nickname;
            players[userID].online = true;
            players[userID].socketID = socket.id;
        }
        socket.userID = userID;
        broadcastUserList();
    });

    socket.on('request_start', (password) => {
        if (password === HOST_PASSWORD) {
            if (gameState === "scene1") {
                Object.values(players).forEach(p => {
                    p.score = 0; p.answered = false; p.isCorrect = false; p.lastChoice = undefined;
                });
                offlinePlayers = {};
                offlineData.forEach(off => {
                    offlinePlayers[off.userID] = { userID: off.userID, nickname: off.nickname, score: 0, online: false };
                });
                broadcastUserList();
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
        if (password === HOST_PASSWORD && currentQuestionIndex >= 0) {
            const currentQuiz = quizBank[currentQuestionIndex];
            // [정의 필요] resultData 생성
            let resultData = { type: currentQuiz.type, desc: currentQuiz.desc };

            // 오프라인 채점 (일반 퀴즈)
            if (currentQuiz.type !== "balance") {
                offlineData.forEach(off => {
                    const offPlayer = offlinePlayers[off.userID];
                    const offAnswer = off.answers[currentQuestionIndex];
                    const isCorrect = JSON.stringify(offAnswer.sort()) === JSON.stringify(currentQuiz.cor.sort());
                    if (isCorrect && currentQuestionIndex > 0) offPlayer.score += (10 * scoreMultiplier);
                });
            }

            let counts = new Array(currentQuiz.a.length).fill(0);
            if (currentQuiz.type === "balance") {
                Object.values(players).forEach(p => { if (p.answered && p.lastChoice !== undefined) counts[p.lastChoice]++; });
                offlineData.forEach(off => { const choice = off.answers[currentQuestionIndex][0]; if (choice !== undefined) counts[choice]++; });

                const maxVotes = Math.max(...counts);
                const winners = [];
                counts.forEach((count, idx) => { if (count === maxVotes && maxVotes > 0) winners.push(idx); });

                offlineData.forEach(off => { if (winners.includes(off.answers[currentQuestionIndex][0]) && currentQuestionIndex > 0) offlinePlayers[off.userID].score += (10 * scoreMultiplier); });
                Object.values(players).forEach(p => {
                    if (p.answered && winners.includes(p.lastChoice)) { p.isCorrect = true; p.score += (10 * scoreMultiplier); }
                    else { p.isCorrect = false; }
                });

                resultData.counts = counts;
                resultData.winners = winners;
            } else {
                const correctPlayers = Object.values(players).filter(p => p.answered && p.isCorrect);
                resultData.totalCorrect = correctPlayers.length + Object.values(offlinePlayers).filter(off => {
                    const offAns = offlineData.find(d => d.userID === off.userID).answers[currentQuestionIndex];
                    return JSON.stringify(offAns.sort()) === JSON.stringify(currentQuiz.cor.sort());
                }).length;
                const shuffled = [...correctPlayers].sort(() => 0.5 - Math.random());
                resultData.randomFive = shuffled.slice(0, 5).map(p => p.nickname);
                resultData.correct = currentQuiz.cor;
            }
            io.emit('reveal_answer', resultData);
            broadcastUserList();
        }
    });

    socket.on('request_mid_rank', (password) => {
        if (password === HOST_PASSWORD) {
            const all = [...Object.values(players), ...Object.values(offlinePlayers)];
            const sorted = all.sort((a, b) => b.score - a.score);
            const formattedRank = sorted.map((p, i) => {
                if (i < 3) return { rank: i + 1, name: p.nickname, score: p.score, type: 'full' };
                return { rank: i + 1, score: p.score, type: 'scoreOnly' };
            });
            io.emit('show_mid_rank', formattedRank);
        }
    });

    socket.on('toggle_multiplier', (password) => {
        if (password === HOST_PASSWORD) {
            scoreMultiplier = (scoreMultiplier === 1) ? 2 : 1;
            io.emit('multiplier_update', scoreMultiplier);
        }
    });

    socket.on('submit_answer', (selectedIndices) => {
        const p = players[socket.userID];
        if (p && !p.answered) {
            p.answered = true;
            submittedCount++;
            p.lastChoice = selectedIndices[0];
            const currentQuiz = quizBank[currentQuestionIndex];
            if (currentQuiz.type !== "balance") {
                const correctAnswers = currentQuiz.cor;
                const isCorrect = selectedIndices.length === correctAnswers.length &&
                                  selectedIndices.every(val => correctAnswers.includes(val));
                p.isCorrect = isCorrect;
                if (isCorrect && currentQuestionIndex > 0) p.score += (10 * scoreMultiplier);
            }
            io.emit('update_remaining', Object.values(players).filter(p => p.online).length - submittedCount);
            broadcastUserList();
        }
    });

    socket.on('disconnect', () => {
        if (socket.userID && players[socket.userID]) {
            players[socket.userID].online = false;
            broadcastUserList();
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));