const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentQuestionIndex = -1;
let submittedCount = 0; // 현재 문제에 답한 인원
let gameState = "waiting"; // 현재 게임 상태 (waiting, quiz, reveal)

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
    // 로그인/참여 로직
    socket.on('join_waiting_room', (data) => {
        const { userID, userPW, nickname } = data;

        // 1. 이미 존재하는 아이디인 경우 (재접속)
        if (players[userID]) {
            if (players[userID].userPW === userPW) {
                // 비밀번호 일치 시 소켓 업데이트 (Re-binding)
                players[userID].socketID = socket.id;
                socket.userID = userID; // 소켓에 유저 아이디 저장
                console.log(`${nickname}님 재접속 성공!`);
                
                // 현재 게임 상태와 문제 정보를 바로 쏴줍니다 (상태 동기화)
                syncClientState(socket);
            } else {
                socket.emit('error_msg', '비밀번호가 틀렸습니다.');
            }
        } 
        // 2. 처음 접속하는 경우
        else {
            players[userID] = {
                userID, userPW, nickname,
                score: 0, answered: false, socketID: socket.id
            };
            socket.userID = userID;
            io.emit('update_user_list', Object.values(players).map(p => p.nickname));
        }
    });

    // 재접속한 유저에게 현재 화면을 맞춰주는 함수
    function syncClientState(targetSocket) {
        if (currentQuestionIndex >= 0) {
            // 현재 게임 진행 상황에 따라 다른 이벤트를 보냄
            if (gameState === "quiz") {
                targetSocket.emit('next_question', {
                    index: currentQuestionIndex,
                    type: quizBank[currentQuestionIndex].type,
                    q: quizBank[currentQuestionIndex].q,
                    a: quizBank[currentQuestionIndex].a,
                    total: Object.keys(players).length
                });
            } else if (gameState === "reveal") {
                // 정답 공개 중이었다면 결과 화면으로 보냄
                targetSocket.emit('reveal_answer', {
                    correct: quizBank[currentQuestionIndex].cor,
                    desc: quizBank[currentQuestionIndex].desc,
                    ranking: Object.values(players).sort((a, b) => b.score - a.score)
                });
            }
        }
    }

    // disconnect 시 players에서 삭제하지 않고 '접속 끊김' 표시만 하거나 그대로 둠
    socket.on('disconnect', () => {
        console.log(`유저 연결 끊김 (ID: ${socket.userID})`);
        // players 데이터는 지우지 않습니다! (이게 핵심)
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running`));