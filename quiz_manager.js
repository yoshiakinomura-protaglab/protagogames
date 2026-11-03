/**
 * quiz_manager.js - 歴史修練（典学）専用モード制御エンジン
 */

let cachedQuizData = {
    choice: [],
    text: []
};

// 選択状態の管理
let quizSelection = {
    step: 'title', // 'title' | 'era' | 'level' | 'trial'
    era: 'nara',
    eraName: '奈良',
    level: 'basic',
    levelName: '初級',
    levelData: null,
    trial: 1,
    trialType: 'fixed', // 'fixed' | 'random'
    trialName: '第一試練'
};

let currentQuizSession = {
    questions: [],
    currentIndex: 0,
    score: 0,
    timer: null,
    timeRemaining: 15.0,
    perQuestionTime: 15.0,
    isLocked: false
};

// 進行度管理
const STORAGE_KEY_QUIZ_PROGRESS = 'yamato_quiz_progress_v2';

function getQuizProgress() {
    const defaultData = {
        nara: {
            basic: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            normal: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            hard: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 }
        }
    };
    const raw = localStorage.getItem(STORAGE_KEY_QUIZ_PROGRESS);
    if (!raw) return defaultData;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.nara) parsed.nara = defaultData.nara;
        return parsed;
    } catch (e) {
        return defaultData;
    }
}

function saveQuizProgress(data) {
    localStorage.setItem(STORAGE_KEY_QUIZ_PROGRESS, JSON.stringify(data));
}

// 奈良時代：等級マスターデータ
const NARA_LEVELS = [
    {
        id: 'basic',
        name: '初級',
        banner: 'images/quiz_nara_lv1_banner.jpg',
        rewardCard: '平城京',
        stages: 3
    },
    {
        id: 'normal',
        name: '中級',
        banner: 'images/quiz_nara_lv2_banner.jpg',
        rewardCard: '墾田永年私財法',
        stages: 4
    },
    {
        id: 'hard',
        name: '上級',
        banner: 'images/quiz_nara_lv3_banner.jpg',
        rewardCard: '東大寺盧舎那仏',
        stages: 3
    }
];

// 星（5段階：20%ごとに1つ明るく点灯、100%で全点灯）
function renderStarGauge(rate) {
    const filledStars = Math.min(5, Math.floor(rate / 0.20));
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= filledStars) {
            starsHtml += '<span class="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]">★</span>';
        } else {
            starsHtml += '<span class="text-stone-600/80">★</span>';
        }
    }
    return starsHtml;
}

// 時代区分リスト
const QUIZ_ERAS = [
    { id: 'paleo_jomon',   name: '旧石器・縄文', banner: null },
    { id: 'yayoi',          name: '弥生',        banner: null },
    { id: 'kofun_asuka',    name: '古墳・飛鳥',  banner: null },
    { id: 'nara',           name: '奈良',        banner: 'images/quiz_nara_banner.jpg' },
    { id: 'heian',          name: '平安',        banner: null },
    { id: 'kamakura',       name: '鎌倉',        banner: null },
    { id: 'muromachi',      name: '南北朝・室町', banner: null },
    { id: 'sengoku',        name: '戦国・安土桃山', banner: null },
    { id: 'edo',            name: '江戸',        banner: null },
    { id: 'bakumatsu',      name: '幕末',        banner: null },
    { id: 'meiji',          name: '明治',        banner: null },
    { id: 'taisho_prewar',  name: '大正・戦前',  banner: null },
    { id: 'postwar',        name: '戦後・現代',  banner: null }
];

const NUMBER_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

// ==========================================
// 1. CSVパース & ロード
// ==========================================
function parseQuizCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.match(/(?:[^\s",]+|"[^"]*")+/g) || line.split(',');
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = cols[idx] ? cols[idx].replace(/^"|"$/g, '').trim() : '';
        });
        result.push(row);
    }
    return result;
}

async function loadQuizData(type = 'choice', era = 'nara', level = 'basic') {
    const fileName = `quiz/quiz_${era}_${type}_${level}.csv`;
    try {
        const res = await fetch(fileName);
        const text = await res.text();
        const data = parseQuizCSV(text);
        cachedQuizData[type] = data;
        return data;
    } catch (e) {
        console.error(`[Quiz] ${fileName} のロードに失敗:`, e);
        return [];
    }
}

function getFixedPackageQuestions(type = 'choice', packageId = 1) {
    const pool = cachedQuizData[type] || [];
    return pool.filter(q => parseInt(q.package_id, 10) === parseInt(packageId, 10))
               .sort((a, b) => parseInt(a.q_no, 10) - parseInt(b.q_no, 10));
}

function getShuffledChoices(questionItem) {
    const choices = [
        { text: questionItem.choice1, isCorrect: true },
        { text: questionItem.choice2, isCorrect: false },
        { text: questionItem.choice3, isCorrect: false },
        { text: questionItem.choice4, isCorrect: false }
    ];
    for (let i = choices.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[r]] = [choices[r], choices[i]];
    }
    return choices;
}

// ==========================================
// 2. モード開閉 & BGM
// ==========================================
function switchQuizBGM(startQuiz) {
    const titleBgm = document.getElementById('bgm-title');
    const quizBgm = document.getElementById('bgm-quiz');

    if (startQuiz) {
        if (titleBgm && !titleBgm.paused) {
            titleBgm.pause();
            titleBgm.dataset.wasPlaying = 'true';
        }
        if (quizBgm) {
            quizBgm.currentTime = 0;
            quizBgm.play().catch(() => {});
        }
    } else {
        if (quizBgm) quizBgm.pause();
        if (titleBgm && titleBgm.dataset.wasPlaying === 'true') {
            titleBgm.play().catch(() => {});
        }
    }
}

function openQuizModal() {
    const modal = document.getElementById('quiz-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    switchQuizBGM(true);
    showView('title');
}

function closeQuizModal() {
    clearInterval(currentQuizSession.timer);
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.add('hidden');
    closeQuizConfirmDialog();
    switchQuizBGM(false);
}

function showView(viewName) {
    const titleEl = document.getElementById('quiz-view-title');
    const selectEl = document.getElementById('quiz-view-select');
    const battleEl = document.getElementById('quiz-view-battle');
    const countdownEl = document.getElementById('quiz-view-countdown');
    const resultEl = document.getElementById('quiz-result-view');

    [titleEl, selectEl, battleEl, countdownEl, resultEl].forEach(el => el?.classList.add('hidden'));

    if (viewName === 'title' && titleEl) {
        titleEl.classList.remove('hidden');
        titleEl.style.display = 'none';
        void titleEl.offsetHeight;
        titleEl.style.display = '';
    } else if (viewName === 'select') {
        selectEl?.classList.remove('hidden');
    } else if (viewName === 'battle') {
        battleEl?.classList.remove('hidden');
    }
}

// ==========================================
// 3. 多段選択メニュー（時代 ➔ 等級 ➔ 試練）
// ==========================================
function goToQuizMenuStep(step) {
    quizSelection.step = step;
    showView('select');

    const grid = document.getElementById('quiz-select-grid');
    const heading = document.getElementById('quiz-select-heading');
    const breadcrumb = document.getElementById('quiz-select-breadcrumb');
    if (!grid || !heading || !breadcrumb) return;

    grid.innerHTML = '';

    // --- 1. 時代選択 ---
    if (step === 'era') {
        heading.innerText = '挑む時代を選択せよ';
        breadcrumb.innerText = '時代選択';
        grid.className = "grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 max-h-[75vh] overflow-y-auto px-1 py-1 w-full";

        QUIZ_ERAS.forEach(era => {
            const btn = document.createElement('button');
            if (era.banner) {
                btn.className = "relative w-full h-28 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-xl text-left bg-stone-900";
                btn.innerHTML = `
                    <img src="${era.banner}" alt="${era.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    <div class="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-transparent to-black/30"></div>
                    <div class="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] sm:text-xs font-serif">
                        <div class="flex space-x-1.5">
                            <span class="px-1.5 py-0.5 bg-amber-950/80 border border-amber-500/70 text-amber-300 rounded">初級 : 極</span>
                            <span class="px-1.5 py-0.5 bg-stone-900/80 border border-stone-600 text-stone-400 rounded">中級 : 初</span>
                            <span class="px-1.5 py-0.5 bg-stone-900/80 border border-stone-600 text-stone-400 rounded">上級 : 未 </span>
                        </div>
                        <span class="text-amber-400 font-mono font-bold drop-shadow">進捗 33%</span>
                    </div>
                `;
            } else {
                btn.className = "py-4 sm:py-5 px-3 bg-stone-900/90 hover:bg-amber-950/70 active:scale-[0.98] border-2 border-amber-900/60 hover:border-amber-500 rounded-xl flex items-center justify-center text-center transition duration-150 group shadow-md";
                btn.innerHTML = `
                    <span class="text-base sm:text-xl font-serif font-bold text-amber-100 group-hover:text-amber-300 tracking-wider">
                        ${era.name}
                    </span>
                `;
            }

            btn.onclick = () => {
                quizSelection.era = era.id;
                quizSelection.eraName = era.name;
                goToQuizMenuStep('level');
            };
            grid.appendChild(btn);
        });

    // --- 2. 等級選択（初級・中級・上級 バナー一覧：テキスト廃止・星ゲージ＋進捗バー特化版） ---
    } else if (step === 'level') {
        heading.innerText = '等級を選択せよ';
        breadcrumb.innerText = quizSelection.eraName;

        grid.className = "flex flex-col justify-between gap-2.5 sm:gap-3 h-[72vh] w-full max-w-xl mx-auto overflow-hidden px-2 py-1";

        const progressData = getQuizProgress();
        const progress = progressData[quizSelection.era] || {
            basic: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            normal: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 },
            hard: { cleared: false, stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 }
        };

        NARA_LEVELS.forEach((lvl, idx) => {
            // ロック判定：初級クリアで中級解放、中級クリアで上級解放
            let isUnlocked = true;
            if (idx === 1) isUnlocked = progress.basic.cleared;
            if (idx === 2) isUnlocked = progress.normal.cleared;

            const lvlData = progress[lvl.id] || { stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 };

            // 仕様通りの進捗率計算
            // 進捗率 = (固定クリア数 + 周回達成数 + ランダムクリア数) / 必要総数
            const fixedCleared = Math.min(lvl.stages, lvlData.stagesCleared || 0);
            const loopDone = Math.min(10, lvlData.loops || 0) + Math.min(10, lvlData.randomLoops || 0);
            const randomCleared = lvlData.randomCleared ? 1 : 0;

            const currentSum = fixedCleared + loopDone + randomCleared;
            const requiredTotal = lvl.stages + 10 + 1 + 10; // 固定ステージ数 + 固定10周 + 検定1回 + 検定10周

            const rate = Math.min(1.0, currentSum / requiredTotal);
            const stars = renderStarGauge(rate);
            const ratePercent = Math.min(100, Math.floor(rate * 100));

            const btn = document.createElement('button');
            const fitStyle = "height: calc((72vh - 24px) / 3); max-width: calc((72vh - 24px) / 3 * 16 / 7); aspect-ratio: 16 / 7;";

            if (isUnlocked) {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-xl sm:rounded-2xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-2xl text-left bg-stone-900 block cursor-pointer mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <img src="${lvl.banner}" alt="${lvl.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    <div class="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-950/25 to-transparent"></div>

                    <!-- 下部：星ゲージ（⭐⭐☆☆☆） ＆ 細身の進捗バーのみ表示（テキスト全廃） -->
                    <div class="absolute bottom-2 left-4 right-4 flex flex-col gap-1.5 pointer-events-none">
                        <div class="flex items-center justify-between">
                            <div class="text-sm sm:text-base tracking-widest flex items-center select-none">
                                ${stars}
                            </div>
                            <div class="text-[10px] sm:text-xs text-amber-400 font-mono font-bold drop-shadow">
                                ${ratePercent}%
                            </div>
                        </div>
                        <div class="w-full bg-stone-950/90 h-1.5 rounded-full overflow-hidden border border-amber-900/60 shadow-inner">
                            <div class="bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 h-full transition-all duration-300" style="width: ${ratePercent}%;"></div>
                        </div>
                    </div>
                `;
                btn.onclick = () => {
                    quizSelection.level = lvl.id;
                    quizSelection.levelName = lvl.name;
                    quizSelection.levelData = lvl;
                    goToQuizMenuStep('trial');
                };
            } else {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-xl sm:rounded-2xl overflow-hidden border-2 border-stone-800 text-left bg-stone-950 opacity-60 grayscale pointer-events-none block mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <img src="${lvl.banner}" alt="${lvl.name}" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-stone-950/75 flex flex-col items-center justify-center">
                        <i class="fa-solid fa-lock text-amber-500/80 text-xl sm:text-2xl mb-1 drop-shadow"></i>
                        <span class="text-stone-300 font-serif text-[11px] sm:text-xs tracking-wider">${idx === 1 ? '初級 満点クリアで解放' : '中級 満点クリアで解放'}</span>
                    </div>
                `;
            }
            grid.appendChild(btn);
        });

    // --- 3. 試練一覧（固定試練セット ＋ ランダム検定） ---
    } else if (step === 'trial') {
        const lvl = quizSelection.levelData || NARA_LEVELS[0];
        heading.innerText = `${quizSelection.eraName}【${quizSelection.levelName}】：試練を選択せよ`;
        breadcrumb.innerText = `${quizSelection.eraName} > ${quizSelection.levelName} > 試練一覧`;
        grid.className = "grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto w-full";

        for (let i = 1; i <= lvl.stages; i++) {
            const trialName = `第${NUMBER_KANJI[i - 1]}試練`;
            const btn = document.createElement('button');
            btn.className = "p-4 bg-stone-900/90 hover:bg-amber-950/60 border-2 border-amber-900/60 hover:border-amber-500 rounded-xl text-center transition duration-150 group shadow-md";
            btn.innerHTML = `
                <div class="text-base sm:text-lg font-serif font-bold text-amber-200 group-hover:text-amber-300">${trialName}</div>
                <div class="text-[11px] text-stone-500 font-serif mt-1">拾問（10問）</div>
            `;
            btn.onclick = () => {
                quizSelection.trial = i;
                quizSelection.trialType = 'fixed';
                quizSelection.trialName = trialName;
                openQuizConfirmDialog();
            };
            grid.appendChild(btn);
        }

        const randomBtn = document.createElement('button');
        randomBtn.className = "col-span-2 p-4 bg-gradient-to-r from-amber-950/80 to-stone-900/90 hover:from-amber-900/90 border-2 border-amber-500/80 rounded-xl text-center transition duration-150 shadow-lg";
        randomBtn.innerHTML = `
            <div class="text-base sm:text-lg font-serif font-bold text-amber-300 flex items-center justify-center space-x-2">
                <i class="fa-solid fa-dice text-amber-400"></i>
                <span>昇段ランダム検定</span>
            </div>
            <div class="text-[11px] text-stone-400 font-serif mt-1">全問からランダム10問抽出</div>
        `;
        randomBtn.onclick = () => {
            quizSelection.trial = 0;
            quizSelection.trialType = 'random';
            quizSelection.trialName = '昇段ランダム検定';
            openQuizConfirmDialog();
        };
        grid.appendChild(randomBtn);
    }
}

function handleQuizMenuBack() {
    if (quizSelection.step === 'era') {
        showView('title');
    } else if (quizSelection.step === 'level') {
        goToQuizMenuStep('era');
    } else if (quizSelection.step === 'trial') {
        goToQuizMenuStep('level');
    }
}

// ==========================================
// 4. 確認ダイアログ ＆ カウントダウン
// ==========================================
function openQuizConfirmDialog() {
    const dialog = document.getElementById('quiz-confirm-dialog');
    const text = document.getElementById('quiz-confirm-target-text');
    if (dialog && text) {
        text.innerText = `${quizSelection.eraName} ${quizSelection.levelName} ${quizSelection.trialName}`;
        dialog.classList.remove('hidden');
    }
}

function closeQuizConfirmDialog() {
    const dialog = document.getElementById('quiz-confirm-dialog');
    if (dialog) dialog.classList.add('hidden');
}

function executeQuizStartCountdown() {
    closeQuizConfirmDialog();

    const countdownView = document.getElementById('quiz-view-countdown');
    const countdownNum = document.getElementById('quiz-countdown-num');
    const countdownSub = document.getElementById('quiz-countdown-sub');

    countdownSub.innerText = `${quizSelection.eraName} ${quizSelection.levelName} ${quizSelection.trialName}`;
    countdownView.classList.remove('hidden');

    let count = 5;
    countdownNum.innerText = count;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNum.innerText = count;
            countdownNum.classList.remove('animate-ping');
            void countdownNum.offsetWidth;
            countdownNum.classList.add('animate-ping');
        } else if (count === 0) {
            countdownNum.innerText = "始！";
        } else {
            clearInterval(timer);
            countdownView.classList.add('hidden');
            startSelectedQuiz();
        }
    }, 1000);
}

// ==========================================
// 5. 出題エンジン
// ==========================================
async function startSelectedQuiz() {
    showView('battle');

    const type = 'choice';
    const era = quizSelection.era;
    const level = quizSelection.level || 'basic';
    const pkg = quizSelection.trial;

    if (!cachedQuizData[type] || cachedQuizData[type].length === 0) {
        await loadQuizData(type, era, level);
    }

    let questions = [];
    if (quizSelection.trialType === 'random') {
        const pool = [...(cachedQuizData[type] || [])];
        for (let i = pool.length - 1; i > 0; i--) {
            const r = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[r]] = [pool[r], pool[i]];
        }
        questions = pool.slice(0, 10);
    } else {
        questions = getFixedPackageQuestions(type, pkg);
    }

    if (!questions || questions.length === 0) {
        alert(`${quizSelection.eraName}【${quizSelection.levelName}】の ${quizSelection.trialName} データがまだ存在しません。`);
        goToQuizMenuStep('trial');
        return;
    }

    currentQuizSession = {
        questions: questions,
        currentIndex: 0,
        score: 0,
        timer: null,
        timeRemaining: 15.0,
        perQuestionTime: 15.0,
        isLocked: false
    };

    document.getElementById('quiz-result-view')?.classList.add('hidden');
    document.getElementById('quiz-feedback-box')?.classList.add('hidden');
    document.getElementById('quiz-title-badge').innerText = `${quizSelection.eraName}・${quizSelection.levelName}`;

    renderCurrentQuestion();
}

function renderCurrentQuestion() {
    const session = currentQuizSession;
    const q = session.questions[session.currentIndex];
    session.isLocked = false;
    session.timeRemaining = session.perQuestionTime;

    document.getElementById('quiz-progress-text').innerText = `第 ${session.currentIndex + 1} / ${session.questions.length} 問`;
    document.getElementById('quiz-question-text').innerText = q.question;
    document.getElementById('quiz-feedback-box').classList.add('hidden');

    const container = document.getElementById('quiz-choices-container');
    container.innerHTML = '';
    const choices = getShuffledChoices(q);

    choices.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = "w-full py-4 sm:py-5 px-5 bg-stone-900/90 hover:bg-stone-800 active:scale-[0.98] border-2 border-amber-900/60 hover:border-amber-500 rounded-xl text-left text-base sm:text-xl font-serif font-bold text-stone-200 transition duration-150 flex items-center justify-between shadow-md";
        btn.innerHTML = `<span>${ch.text}</span><i class="fa-solid fa-chevron-right text-stone-600 text-sm"></i>`;
        btn.onclick = () => handleChoiceAnswer(ch.isCorrect, q);
        container.appendChild(btn);
    });

    startQuestionTimer(q);
}

function startQuestionTimer(currentQuestion) {
    clearInterval(currentQuizSession.timer);
    updateTimerUI();

    const interval = 50;
    currentQuizSession.timer = setInterval(() => {
        currentQuizSession.timeRemaining -= interval / 1000;
        if (currentQuizSession.timeRemaining <= 0) {
            currentQuizSession.timeRemaining = 0;
            clearInterval(currentQuizSession.timer);
            handleChoiceAnswer(false, currentQuestion, true);
        }
        updateTimerUI();
    }, interval);
}

function updateTimerUI() {
    const remain = Math.max(0, currentQuizSession.timeRemaining);
    document.getElementById('quiz-timer').innerText = remain.toFixed(2);
    const pct = (remain / currentQuizSession.perQuestionTime) * 100;
    const bar = document.getElementById('quiz-timer-bar');
    bar.style.width = `${pct}%`;
    bar.className = pct < 30 ? "bg-rose-500 h-full w-full transition-all" : "bg-amber-500 h-full w-full transition-all";
}

function handleChoiceAnswer(isCorrect, questionItem, isTimeout = false) {
    if (currentQuizSession.isLocked) return;
    currentQuizSession.isLocked = true;
    clearInterval(currentQuizSession.timer);

    const feedbackBox = document.getElementById('quiz-feedback-box');
    const resultText = document.getElementById('quiz-feedback-result');
    const descText = document.getElementById('quiz-feedback-desc');
    feedbackBox.classList.remove('hidden');

    if (isCorrect) {
        currentQuizSession.score++;
        feedbackBox.className = "mt-4 p-4 rounded-xl border border-emerald-600 bg-emerald-950/70 text-stone-200 shadow-lg";
        resultText.innerHTML = `<span class="text-emerald-400 text-lg"><i class="fa-solid fa-circle-check mr-2"></i>正解</span>`;
    } else {
        feedbackBox.className = "mt-4 p-4 rounded-xl border border-rose-600 bg-rose-950/70 text-stone-200 shadow-lg";
        const reason = isTimeout ? "時間切れ！" : "不正解...";
        resultText.innerHTML = `<span class="text-rose-400 text-lg"><i class="fa-solid fa-circle-xmark mr-2"></i>${reason}</span><span class="ml-3 text-sm text-stone-300">正解: <strong class="text-amber-300 font-serif">${questionItem.choice1}</strong></span>`;
    }
    descText.innerText = questionItem.explanation || "";

    setTimeout(() => {
        currentQuizSession.currentIndex++;
        if (currentQuizSession.currentIndex < currentQuizSession.questions.length) {
            renderCurrentQuestion();
        } else {
            showQuizResult();
        }
    }, 1200);
}

function showQuizResult() {
    const session = currentQuizSession;
    const resultView = document.getElementById('quiz-result-view');
    const scoreText = document.getElementById('quiz-result-score');
    const rewardText = document.getElementById('quiz-reward-text');
    
    scoreText.innerText = `${session.questions.length}問中 ${session.score}問 正解`;
    
    // 満点判定
    const isPerfect = session.score === session.questions.length;
    if (isPerfect) {
        const progressData = getQuizProgress();
        const eraProg = progressData[quizSelection.era];
        const lvlProg = eraProg[quizSelection.level];

        if (quizSelection.trialType === 'fixed') {
            lvlProg.stagesCleared = Math.max(lvlProg.stagesCleared, quizSelection.trial);
            // 全ステージ満点クリアでその難易度を完全クリア済みに
            if (lvlProg.stagesCleared >= (quizSelection.levelData?.stages || 3)) {
                lvlProg.cleared = true;
            }
        } else if (quizSelection.trialType === 'random') {
            lvlProg.randomCleared = true;
        }

        saveQuizProgress(progressData);

        rewardText.innerHTML = `<span class="text-amber-300 font-bold text-lg">【満点達成】カード『${quizSelection.levelData?.rewardCard || '平城京'}』進捗更新！</span>`;
        if (window.addMagatamaDirect) addMagatamaDirect(500);
    } else {
        rewardText.innerText = "満点達成で進行度アップ！再挑戦しよう。";
    }

    resultView.classList.remove('hidden');
}

function restartCurrentTrial() {
    document.getElementById('quiz-result-view').classList.add('hidden');
    executeQuizStartCountdown();
}

// グローバル公開
window.openQuizModal = openQuizModal;
window.closeQuizModal = closeQuizModal;
window.goToQuizMenuStep = goToQuizMenuStep;
window.handleQuizMenuBack = handleQuizMenuBack;
window.openQuizConfirmDialog = openQuizConfirmDialog;
window.closeQuizConfirmDialog = closeQuizConfirmDialog;
window.executeQuizStartCountdown = executeQuizStartCountdown;
window.restartCurrentTrial = restartCurrentTrial;