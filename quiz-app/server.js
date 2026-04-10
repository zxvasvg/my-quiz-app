const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentQuestionIndex = -1;
let submittedCount = 0; // 현재 문제에 답한 인원

const quizBank = [
    { 
        type: "single", // 4지 선다
        q: "한라산의 높이는?", 
        a: ["1,947m", "1,950m", "2,024m", "1,850m"], 
        cor: [0], 
        desc: "1,947m입니다!" 
    },
    { 
        type: "ox", // 2지 선다 (O/X)
        q: "딸기는 식물학적으로 '채소'에 해당한다?", 
        a: ["O (맞음)", "X (틀림)"], 
        cor: [0], 
        desc: "딸기, 수박, 참외는 나무가 아닌 밭에서 자라므로 '채소(과채류)'로 분류됩니다." 
    },
    { 
        type: "multi", // 중복 정답
        q: "다음 중 닌텐도의 게임기가 '아닌' 것을 모두 고르세요.", 
        a: ["스위치", "플레이스테이션", "게임보이", "엑스박스"], 
        cor: [1, 3], // 2번, 4번 중복 정답
        desc: "플레이스테이션은 소니, 엑스박스는 마이크로소프트의 제품입니다." 
    },
    { 
        type: "multi", // 중복 정답
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

    socket.on('submit_answer', (selectedIndices) => {
    // selectedIndices는 클라이언트에서 보낸 배열 형태 [0, 2]
    if (players[socket.id] && !players[socket.id].answered) {
        players[socket.id].answered = true;
        submittedCount++;

        // 정답 체크 (C++ 배열 비교하듯 처리)
        const correctAnswers = quizBank[currentQuestionIndex].cor;
        const isCorrect = 
            selectedIndices.length === correctAnswers.length &&
            selectedIndices.every(val => correctAnswers.includes(val));

        if (isCorrect) {
            players[socket.id].score += 10;
        }

        const remaining = Object.keys(players).length - submittedCount;
        io.emit('update_remaining', remaining);
    }});

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update_user_list', Object.values(players).map(p => p.nickname));
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`));