const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const HOST_PASSWORD = "1224";

let players = {};
let offlinePlayers = {};
let currentQuestionIndex = -1;
let currentBank = []; // 현재 진행 중인 퀴즈 뱅크
let submittedCount = 0; 
let gameState = "scene1"; 
let scoreMultiplier = 1; 
let prizeWinners = {};

// 1. 튜토리얼용 퀴즈 (연습용)
const tutorialBank = [
    { type: "single", q: "1. 오늘의 날짜는..?", a: ["18일", "19일", "20일", "21일"], cor: [1], desc: "오늘 날짜는 19일입니다." },
    { type: "ox", q: "2. OX 퀴즈 : 오늘 키즈 점심은 용우동의 소고기비빔밥이다", a: ["O", "X"], cor: [1], desc: "오늘 점심은 교반의 소고기 비빔밥입니다." },
    { type: "balance", q: "3. 밸런스: 중국집 메뉴를 시킨다면..?", a: ["짜장", "짬뽕"], desc: "다수가 선택한 쪽이 점수를 얻는 방식입니다." }
];

// 2. 본 게임용 퀴즈
const mainBank = [
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
    { userID: "off_01", nickname: "JJO", answers: [[1], [0], [0], [0], [0], [1], [0], [0], [1]] },
    { userID: "off_02", nickname: "choyoung", answers: [[1], [1], [1], [1], [1], [0], [1], [0], [0]] }
];

function broadcastUserList() {
    const all = [...Object.values(players), ...Object.values(offlinePlayers)];
    io.emit('update_user_list', { players: all });
}

function startNextQuestion() {
    currentQuestionIndex++;
    submittedCount = 0;
    scoreMultiplier = 1;
    io.emit('multiplier_update', 1);

    if (currentQuestionIndex < currentBank.length) {
        Object.values(players).forEach(p => { p.answered = false; p.isCorrect = false; });
        io.emit('next_question', {
            index: currentQuestionIndex,
            gameState: "quiz",
            type: currentBank[currentQuestionIndex].type,
            q: currentBank[currentQuestionIndex].q,
            a: currentBank[currentQuestionIndex].a,
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
        players[userID] = { ...players[userID], userID, nickname, score: players[userID]?.score || 0, answered: false, isCorrect: false, socketID: socket.id, online: true };
        socket.userID = userID;
        broadcastUserList();
    });

    // 퀴즈 시작 (어떤 뱅크를 쓸지 결정)
    socket.on('request_start', (data) => {
        if (data.pw === HOST_PASSWORD) {
            if (gameState === "scene1") {
                // 모드 설정
                currentBank = (data.mode === 'tutorial') ? tutorialBank : mainBank;
                
                // 초기화
                Object.values(players).forEach(p => { p.score = 0; p.answered = false; p.isCorrect = false; });
                offlinePlayers = {};
                offlineData.forEach(off => {
                    offlinePlayers[off.userID] = { userID: off.userID, nickname: off.nickname, score: 0, online: false };
                });
                
                broadcastUserList();
                gameState = "scene2";
                io.emit('change_scene', "scene2");
            } else {
                startNextQuestion();
            }
        }
    });

    // 엔딩 크레딧 & 경품 씬 전환
    socket.on('request_scene', (data) => {
        if (data.pw === HOST_PASSWORD) {
            io.emit('change_scene', data.scene);
        }
    });

    socket.on('claim_prize', (data) => {
        if (data.pw === HOST_PASSWORD) {
            prizeWinners[data.prizeId] = data.winnerName;
            io.emit('prize_updated', prizeWinners); // 모든 유저에게 품절 현황 전송
        }
    });

    socket.on('request_reset', (password) => {
        if (password === HOST_PASSWORD) {
            players = {}; offlinePlayers = {}; prizeWinners = {}; // 경품도 초기화
            currentQuestionIndex = -1; gameState = "scene1";
            io.emit('change_scene', "scene1");
            io.emit('prize_updated', prizeWinners);
            broadcastUserList();
        }
    });

    socket.on('request_reset', (password) => {
        if (password === HOST_PASSWORD) {
            players = {}; offlinePlayers = {}; currentQuestionIndex = -1; gameState = "scene1";
            io.emit('change_scene', "scene1");
            broadcastUserList();
        }
    });

    socket.on('request_reveal', (password) => {
        if (password === HOST_PASSWORD && currentQuestionIndex >= 0) {
            const currentQuiz = currentBank[currentQuestionIndex];
            let resultData = { type: currentQuiz.type, desc: currentQuiz.desc, questionText: currentQuiz.q, options: currentQuiz.a };

            if (currentQuiz.type !== "balance") {
                offlineData.forEach(off => {
                    const offPlayer = offlinePlayers[off.userID];
                    const offAnswer = off.answers[currentQuestionIndex];
                    const isCorrect = JSON.stringify(offAnswer?.sort()) === JSON.stringify(currentQuiz.cor.sort());
                    if (isCorrect) offPlayer.score += (10 * scoreMultiplier);
                });
            }

            if (currentQuiz.type === "balance") {
                let counts = new Array(currentQuiz.a.length).fill(0);
                let votersByOption = currentQuiz.a.map(() => []);
                Object.values(players).forEach(p => { if (p.answered) { counts[p.lastChoice]++; votersByOption[p.lastChoice].push(p.nickname); } });
                offlineData.forEach(off => { 
                    const choice = off.answers[currentQuestionIndex][0];
                    if (choice !== undefined) { counts[choice]++; votersByOption[choice].push(off.nickname); }
                });
                const maxVotes = Math.max(...counts);
                const winners = [];
                counts.forEach((c, i) => { if (c === maxVotes && maxVotes > 0) winners.push(i); });
                offlineData.forEach(off => { if (winners.includes(off.answers[currentQuestionIndex][0])) offlinePlayers[off.userID].score += (10 * scoreMultiplier); });
                Object.values(players).forEach(p => { if (p.answered && winners.includes(p.lastChoice)) { p.isCorrect = true; p.score += (10 * scoreMultiplier); } });
                resultData.counts = counts; resultData.winners = winners; resultData.votersByOption = votersByOption;
            } else {
                const correctOnline = Object.values(players).filter(p => p.answered && p.isCorrect).map(p => p.nickname);
                const correctOffline = Object.values(offlinePlayers).filter(off => {
                    const offAns = offlineData.find(d => d.userID === off.userID).answers[currentQuestionIndex];
                    return JSON.stringify(offAns?.sort()) === JSON.stringify(currentQuiz.cor.sort());
                }).map(p => p.nickname);
                resultData.allCorrectNames = [...correctOnline, ...correctOffline];
                resultData.totalCorrect = resultData.allCorrectNames.length;
            }
            io.emit('reveal_answer', resultData);
            broadcastUserList();
        }
    });

    socket.on('request_mid_rank', (password) => {
        if (password === HOST_PASSWORD) {
            const all = [...Object.values(players), ...Object.values(offlinePlayers)];
            const sorted = all.sort((a, b) => b.score - a.score);
            io.emit('show_mid_rank', sorted.map((p, i) => ({ rank: i + 1, name: p.nickname, score: p.score, type: i < 3 ? 'full' : 'scoreOnly' })));
        }
    });

    socket.on('toggle_multiplier', (password) => { if (password === HOST_PASSWORD) { scoreMultiplier = (scoreMultiplier === 1) ? 2 : 1; io.emit('multiplier_update', scoreMultiplier); } });
    socket.on('submit_answer', (selectedIndices) => {
        const p = players[socket.userID];
        if (p && !p.answered) {
            p.answered = true; submittedCount++; p.lastChoice = selectedIndices[0];
            if (currentBank[currentQuestionIndex].type !== "balance") {
                const isCorrect = JSON.stringify(selectedIndices.sort()) === JSON.stringify(currentBank[currentQuestionIndex].cor.sort());
                p.isCorrect = isCorrect;
                if (isCorrect) p.score += (10 * scoreMultiplier);
            }
            io.emit('update_remaining', Object.values(players).filter(p => p.online).length - submittedCount);
            broadcastUserList();
        }
    });
    socket.on('disconnect', () => { if (socket.userID && players[socket.userID]) { players[socket.userID].online = false; broadcastUserList(); } });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`));