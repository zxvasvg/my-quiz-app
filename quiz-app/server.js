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
    { type: "ox", q: "1.[O/X 퀴즈] 이광욱은 시스템팀입니다.", a: ["O", "X"], cor: [0], desc: "시스템팀 맞습니다." },
    { type: "ox", q: "2.[O/X 퀴즈] 오늘 키즈(4월 19일) 점심은 용우동의 '소고기 비빔밥'이다?", a: ["O", "X"], cor: [1], desc: "카카오 워크 확인하시면 교반의 소고기 비빔밥입니다." },
    { type: "ox", q: "3.[O/X 퀴즈] 퀴즈 당사자는 26년 3월 1일에 친구 결혼식을 다녀왔는데, 가서 축가를 불렀을까요? 안불렀을까요?", a: ["O", "X"], cor: [1], desc: "안불렀습니다 ㅎㅎ" },
    { type: "ox", q: "4.[O/X 퀴즈] 퀴즈 당사자는 현재 연애를 하거나 썸을 타고 있을까요..?", a: ["O", "X"], cor: [1], desc: "아직 없습니다.. 괜찮은 사람 있으면 소개 부탁드려요 ㅎㅎㅎㅎㅎㅎㅎㅎㅎ" },
    { type: "single", q: "5.[4지선다형] 퀴즈 당사자의 회사 영어닉네임은?", a: ["Shrimp", "Shanks", "Whale", "Shark"], cor: [3], desc: "Shark Lee 입니다." },
    { type: "single", q: "6.[4지선다형] 퀴즈 당사자가 살았던 뮤지엄 기숙사 방번호는?", a: ["201호", "202호", "203호", "204호"], cor: [2], desc: "203호입니다." },
    { type: "single", q: "7.[4지선다형] 퀴즈 당사자는 1992년생입니다. 동갑 인플루언서가 아닌 사람은..?", a: ["안소희(원더걸스)", "손흥민", "박은빈", "이지은"], cor: [3], desc: "이지은(아이유)는 93년생입니다." },
    { type: "single", q: "8.[4지선다형] 퀴즈 당사자의 첫 키스 나이는..?", a: ["중2", "중3", "고1", "고2"], cor: [1], desc: "키스는 중3 입니다..ㅎㅎ" },
    { type: "single", q: "9.[4지선다형] 퀴즈 당사자의 태어난 날은 92년 9월 8일 입니다. 당시에 당일에 발생했던 이슈는?", a: ["자연농원(에버랜드) 국내 최초 서스펜디드 롤러코스터 독수리요새 개장", "롯데리아 불고기 버거 출시", "롯데자이언츠 한국시리즈에서 빙그레 이글스 꺾고 통산 두 번째 한국 시리즈 정상에 올랐다.", "육상선수 황영조가 바로셀로나 올림픽 마라톤에서 금메달을 땄다."], cor: [0], desc: "독수리요새 9월 8일 개장, 불고기 버거 9월 1일 출시, 롯데자이언츠 10월 14일 우승, 황영조선수 8월 9일에 금메달 획득" },
    { type: "balance", q: "10.[밸런스] 치킨선호도", a: ["후라이드치킨", "양념치킨"], desc: "선호하는 치킨은?" },
    { type: "balance", q: "11.[밸런스] 평생 견디기 힘든 상황은?", a: ["한여름 에어컨없이 지내기", "한겨울 온수 없이 샤워하기", "탄산음료/커피 금지.!"], desc: "더 견디기 힘든 상황은..?" },
    { type: "balance", q: "12.[밸런스] 어느 것이 더 좋을까?", a: ["월 170 백수 (다른일 가능)", "월 580 현재 키즈 업무(9:00~19:00)"], desc: "어느 것이 더 좋을까요..?ㅎㅎ" },
    { type: "balance", q: "13.[밸런스] 최악의 인간은..?", a: ["거짓말쟁이형 (걸려도 또 다른 거짓말로 핑계)", "남탓형 (맨날 자기가 제일 불쌍하고, 남탓함)", "뒷담형(맨날 다른 사람 욕하고 이간질)"], desc: "최악의 인간은 뭘까요..?" },
    { type: "balance", q: "14.[밸런스] 초능력이 있다면..?", a: ["순간이동", "투명인간", "시간조절(미래로가기, 정지)"], desc: "각자 선호하는 초능력은..?" },
    { type: "balance", q: "15.[밸런스] 평생 이런집에서 살게 된다면..?", a: ["12평 서울특별시", "23평 부산광역시", "34평 제주특별자치도"], desc: "각자 어떤집을 좋아할까요..?" },
    { type: "balance", q: "16.[밸런스] 호감있는 이성에게 설레는 순간..?", a: ["갑작스러운 스킨십(급정거, 손잡기)", "갑자기 나한테 여행가서 찍은 자기 사진을 보내줌", "밤 늦게 갑자기 전화옴"], desc: "어떤것이 좀 더 설렐까요..?" },
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
        // [수정] 기존 유저가 있으면 정보만 업데이트(점수 유지), 없으면 신규 생성
        if (players[userID]) {
            players[userID].nickname = nickname;
            players[userID].online = true;
            players[userID].socketID = socket.id;
        } else {
            players[userID] = { userID, nickname, score: 0, answered: false, online: true, socketID: socket.id };
        }
        socket.userID = userID;
        broadcastUserList();
        socket.emit('prize_updated', prizeWinners);
    });

    socket.on('request_start', (data) => {
        if (data.pw === HOST_PASSWORD) {
            if (gameState === "scene1") {
                currentBank = (data.mode === 'tutorial') ? tutorialBank : mainBank;
                currentQuestionIndex = -1;
                // 새 게임 시작 시에만 점수 0으로 리셋
                Object.values(players).forEach(p => { p.score = 0; p.answered = false; });
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
                    if (choice !== undefined) { 
                        counts[choice]++; 
                        votersByOption[choice].push(off.nickname); 
                    }
                });
                const maxVotes = Math.max(...counts);
                const winners = [];
                counts.forEach((c, i) => { if (c === maxVotes && maxVotes > 0) winners.push(i); });
                
                Object.values(players).forEach(p => { if (p.answered && winners.includes(p.lastChoice)) { p.isCorrect = true; p.score += (10 * scoreMultiplier); } });
                // 오프라인 유저 밸런스 게임 점수 추가
                offlineData.forEach(off => { if (winners.includes(off.answers[currentQuestionIndex]?.[0])) offlinePlayers[off.userID].score += (10 * scoreMultiplier); });
                
                resultData.counts = counts; resultData.winners = winners; resultData.votersByOption = votersByOption;
            } else {
                // 일반 퀴즈 정답자 추출 및 오프라인 유저 점수 추가
                const correctOnline = Object.values(players).filter(p => p.answered && p.isCorrect).map(p => p.nickname);
                const correctOffline = [];
                
                offlineData.forEach(off => {
                    const offAns = off.answers[currentQuestionIndex];
                    const isCorrect = JSON.stringify(offAns?.sort()) === JSON.stringify(currentQuiz.cor.sort());
                    if (isCorrect) {
                        offlinePlayers[off.userID].score += (10 * scoreMultiplier);
                        correctOffline.push(off.nickname);
                    }
                });
                
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