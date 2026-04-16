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
    { type: "single", q: "닌텐도 기기가 아닌 것은?", a: ["스위치", "플스", "게임보이", "wii"], cor: [1], desc: "플스는 소니제품입니다." },
    { type: "ox", q: "딸기는 식물학적으로 '채소'에 해당한다?", a: ["O (맞음)", "X (틀림)"], cor: [0], desc: "밭에서 자라는 딸기는 채소(과채류)입니다." },
    { type: "balance", q: "[밸런스] 평생 한 가지만 먹어야 한다면?", a: ["짜장면", "짬뽕"], desc: "다수가 선택한 메뉴가 승리!" },
    { type: "balance", q: "[밸런스] 가위 바위 보!", a: ["가위", "바위", "보"], desc: "가장 많이 나온 손이 승리!" }
];

function startNextQuestion() {
    currentQuestionIndex++;
    submittedCount = 0;
    scoreMultiplier = 1;

    if (currentQuestionIndex < quizBank.length) {
        Object.values(players).forEach(p => {
            p.answered = false;
            p.isCorrect = false; // 정답 여부 초기화
        });
        
        io.emit('next_question', {
            index: currentQuestionIndex,
            gameState: (currentQuestionIndex === 0) ? "tutorial" : "quiz",
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
            players[userID] = { userID, nickname, score: 0, answered: false, isCorrect: false, socketID: socket.id, online: true };
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

    // 정답 공개 (밸런스 게임 집계 로직 포함)
    socket.on('request_reveal', (password) => {
        if (password === '1234' && currentQuestionIndex >= 0) {
            const currentQuiz = quizBank[currentQuestionIndex];
            let resultData = {
                type: currentQuiz.type,
                desc: currentQuiz.desc
            };

            if (currentQuiz.type === "balance") {
                // 1. 투표 집계 (C++의 map이나 배열 카운팅과 유사)
                let counts = new Array(currentQuiz.a.length).fill(0);
                Object.values(players).forEach(p => {
                    if (p.answered && p.lastChoice !== undefined) {
                        counts[p.lastChoice]++;
                    }
                });

                // 2. 최대 득표수 찾기
                const maxVotes = Math.max(...counts);
                
                // 3. 공동 우승자 처리 (동률 시 모두 정답) 
                const winners = [];
                counts.forEach((count, idx) => {
                    if (count === maxVotes && maxVotes > 0) winners.push(idx);
                });

                // 4. 승자들에게 점수 부여
                Object.values(players).forEach(p => {
                    if (p.answered && winners.includes(p.lastChoice)) {
                        p.isCorrect = true;
                        p.score += (10 * scoreMultiplier);
                    } else {
                        p.isCorrect = false;
                    }
                });

                resultData.counts = counts; // 각 항목별 득표수 전송
                resultData.winners = winners; // 승리한 항목 인덱스 전송
            } else {
                // 기존 퀴즈 타입 정답자 추출 로직 [cite: 1424]
                const correctPlayers = Object.values(players).filter(p => p.answered && p.isCorrect);
                resultData.totalCorrect = correctPlayers.length;
                const shuffled = [...correctPlayers].sort(() => 0.5 - Math.random());
                resultData.randomFive = shuffled.slice(0, 5).map(p => p.nickname);
                resultData.correct = currentQuiz.cor;
            }

            io.emit('reveal_answer', resultData);
            io.emit('update_user_list', { players: Object.values(players) }); // 점수 갱신 반영
        }
    });

    // 중간 점검 (1~3등 이름 공개, 나머지 점수만)
    socket.on('request_mid_rank', (password) => {
        if (password === '1234') {
            const sorted = Object.values(players).sort((a, b) => b.score - a.score);
            const formattedRank = sorted.map((p, i) => {
                if (i < 3) return { rank: i + 1, name: p.nickname, score: p.score, type: 'full' };
                return { rank: i + 1, score: p.score, type: 'scoreOnly' };
            });
            io.emit('show_mid_rank', formattedRank);
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
            p.lastChoice = selectedIndices[0]; // 밸런스 게임용 선택값 저장

            const currentQuiz = quizBank[currentQuestionIndex];
            
            // 일반 퀴즈는 즉시 정답 체크, 밸런스는 나중에 체크
            if (currentQuiz.type !== "balance") {
                const correctAnswers = currentQuiz.cor;
                const isCorrect = selectedIndices.length === correctAnswers.length &&
                                  selectedIndices.every(val => correctAnswers.includes(val));
                p.isCorrect = isCorrect;
                if (isCorrect && currentQuestionIndex > 0) p.score += (10 * scoreMultiplier);
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
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));