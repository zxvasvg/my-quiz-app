const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
app.use(express.static('public'));

const HOST_PASSWORD = "1224"; // 방장 비밀번호

let players = {};
let offlinePlayers = {};
let currentQuestionIndex = -1;
let currentBank = [];
let gameState = "scene1"; 
let scoreMultiplier = 1; 
let prizeWinners = {}; 

const tutorialBank = [
    { type: "single", q: "[연습] 4지선다: 1+1은?", a: ["1", "2", "3", "4"], cor: [1], desc: "연습용 4지선다입니다." },
    { type: "ox", q: "[연습] OX: 고래는 포유류이다?", a: ["O", "X"], cor: [0], desc: "연습용 OX입니다." },
    { type: "balance", q: "[연습] 밸런스: 짜장 vs 짬뽕?", a: ["짜장", "짬뽕"], desc: "연습용 밸런스입니다." }
];

const mainBank = [
    { type: "single", q: "1. 한라산의 높이는?", a: ["1,947m", "1,950m", "2,024m", "1,850m"], cor: [0], desc: "한라산은 1,947m!" },
    { type: "balance", q: "[밸런스] 2. 선호하는 스타일은?", a: ["월급 170 백수", "월급 580 키즈 직원"], desc: "다수가 승리!" }
];

const offlineData = [
    { userID: "off_01", nickname: "JJO", answers: [[1], [0], [0]] },
    { userID: "off_02", nickname: "choyoung", answers: [[1], [1], [1]] }
];

function broadcastUserList() {
    const all = [...Object.values(players), ...Object.values(offlinePlayers)];
    io.emit('update_user_list', { players: all });
}

function startNextQuestion() {
    currentQuestionIndex++;
    scoreMultiplier = 1;
    io.emit('multiplier_update', 1);
    if (currentQuestionIndex < currentBank.length) {
        Object.values(players).forEach(p => { p.answered = false; p.isCorrect = false; });
        io.emit('next_question', {
            index: currentQuestionIndex,
            q: currentBank[currentQuestionIndex].q,
            a: currentBank[currentQuestionIndex].a,
            type: currentBank[currentQuestionIndex].type,
            total: Object.values(players).filter(p => p.online).length
        });
        broadcastUserList();
    } else {
        const all = [...Object.values(players), ...Object.values(offlinePlayers)];
        io.emit('game_over', all.sort((a,b) => b.score - a.score));
        currentQuestionIndex = -1;
        gameState = "scene1";
    }
}

io.on('connection', (socket) => {
    socket.on('join_waiting_room', (data) => {
        const { userID, nickname } = data;
        players[userID] = { userID, nickname, score: 0, answered: false, online: true, socketID: socket.id };
        socket.userID = userID;
        broadcastUserList();
        socket.emit('prize_updated', prizeWinners);
    });

    socket.on('request_start', (data) => {
        if (data.pw === HOST_PASSWORD) {
            if (gameState === "scene1") {
                currentBank = (data.mode === 'tutorial') ? tutorialBank : mainBank;
                currentQuestionIndex = -1;
                Object.values(players).forEach(p => p.score = 0);
                offlinePlayers = {};
                offlineData.forEach(off => offlinePlayers[off.userID] = { userID: off.userID, nickname: off.nickname, score: 0, online: false });
                gameState = "scene2";
                io.emit('change_scene', "scene2");
                broadcastUserList();
            } else if (gameState === "scene2") {
                gameState = "quiz";
                startNextQuestion();
            } else {
                startNextQuestion();
            }
        }
    });

    socket.on('request_reveal', (pw) => {
        if (pw === HOST_PASSWORD && currentQuestionIndex >= 0) {
            const currentQuiz = currentBank[currentQuestionIndex];
            let resultData = { type: currentQuiz.type, desc: currentQuiz.desc, questionText: currentQuiz.q, options: currentQuiz.a };
            
            if (currentQuiz.type === "balance") {
                let counts = new Array(currentQuiz.a.length).fill(0);
                let votersByOption = currentQuiz.a.map(() => []);
                Object.values(players).forEach(p => { if (p.answered && p.lastChoice !== undefined) { counts[p.lastChoice]++; votersByOption[p.lastChoice].push(p.nickname); } });
                offlineData.forEach(off => { 
                    const choice = off.answers[currentQuestionIndex]?.[0];
                    if (choice !== undefined) { counts[choice]++; votersByOption[choice].push(off.nickname); }
                });
                const maxVotes = Math.max(...counts);
                const winners = [];
                counts.forEach((c, i) => { if (c === maxVotes && maxVotes > 0) winners.push(i); });
                Object.values(players).forEach(p => { if (p.answered && winners.includes(p.lastChoice)) { p.isCorrect = true; p.score += (10 * scoreMultiplier); } });
                offlineData.forEach(off => { if (winners.includes(off.answers[currentQuestionIndex]?.[0])) offlinePlayers[off.userID].score += (10 * scoreMultiplier); });
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

    socket.on('request_mid_rank', (pw) => {
        if (pw === HOST_PASSWORD) {
            const all = [...Object.values(players), ...Object.values(offlinePlayers)];
            io.emit('show_mid_rank', all.sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1, name:p.nickname, score:p.score, type:i<3?'full':'scoreOnly'})));
        }
    });

    socket.on('request_final_rank', (pw) => {
        if (pw === HOST_PASSWORD) {
            const all = [...Object.values(players), ...Object.values(offlinePlayers)];
            io.emit('show_mid_rank', all.sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1, name:p.nickname, score:p.score, type:'full'})));
        }
    });

    socket.on('toggle_multiplier', (pw) => { if (pw === HOST_PASSWORD) { scoreMultiplier = (scoreMultiplier === 1) ? 2 : 1; io.emit('multiplier_update', scoreMultiplier); } });
    socket.on('claim_prize', (data) => { if (data.pw === HOST_PASSWORD) { prizeWinners[data.prizeId] = data.winnerName; io.emit('prize_updated', prizeWinners); } });
    socket.on('request_prize_sync', () => socket.emit('prize_updated', prizeWinners));
    socket.on('request_scene', (data) => { if (data.pw === HOST_PASSWORD) io.emit('change_scene', data.scene); });
    socket.on('request_reset', (pw) => { if (pw === HOST_PASSWORD) { players={}; offlinePlayers={}; prizeWinners={}; currentQuestionIndex=-1; gameState="scene1"; io.emit('change_scene', "scene1"); io.emit('prize_updated', {}); broadcastUserList(); } });
    socket.on('submit_answer', (indices) => {
        const p = players[socket.userID];
        if (p && !p.answered) {
            p.answered = true; p.lastChoice = indices[0];
            const currentQuiz = currentBank[currentQuestionIndex];
            if (currentQuiz.type !== "balance") {
                const isCorrect = JSON.stringify(indices.sort()) === JSON.stringify(currentQuiz.cor.sort());
                p.isCorrect = isCorrect;
                if (isCorrect) p.score += (10 * scoreMultiplier);
            }
            broadcastUserList();
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`)); 