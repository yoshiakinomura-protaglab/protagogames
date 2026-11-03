/**
 * js/quiz/quiz_ui.js - 典学モード DOM自己生成 ＆ 画面制御（完全マスターCSV駆動版）
 */

// 木札画像アセット定義
const QUIZ_TAG_ASSETS = {
    choice: {
        type: 'choice',
        name: '四択',
        image: 'images/tag_choice.png',
        badgeColor: 'border-emerald-500/80 text-emerald-300 bg-emerald-950/80'
    },
    input: {
        type: 'input',
        name: '一問一答',
        image: 'images/tag_input.png',
        badgeColor: 'border-sky-500/80 text-sky-300 bg-sky-950/80'
    },
    desc: {
        type: 'desc',
        name: '記述',
        image: 'images/tag_desc.png',
        badgeColor: 'border-purple-500/80 text-purple-300 bg-purple-950/80'
    },
    random: {
        type: 'random',
        name: '最終試練',
        image: 'images/tag_random.png',
        badgeColor: 'border-amber-400 text-amber-300 bg-amber-950/80'
    }
};

const NUMBER_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

let quizSelection = {
    step: 'title',
    era: '',
    eraName: '',
    level: '',
    levelName: '',
    levelRow: null,      // quiz_master.csv の対象行データ
    dynamicStages: [],   // CSVから自動判定されたステージリスト
    trial: 1,
    trialType: 'fixed',
    trialName: '第一試練'
};

let currentTrialActiveIndex = 0;

// ==========================================
// 1. BGM制御
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
            quizBgm.play().catch(e => console.warn("クイズBGM再生失敗:", e));
        }
    } else {
        if (quizBgm) quizBgm.pause();
        if (titleBgm && titleBgm.dataset.wasPlaying === 'true') {
            titleBgm.play().catch(e => console.warn("タイトルBGM再開失敗:", e));
        }
    }
}

// ==========================================
// 2. モーダルDOM自己生成
// ==========================================
function ensureQuizModalDOM() {
    if (document.getElementById('quiz-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.className = 'fixed inset-0 z-50 hidden flex flex-col justify-between p-2 sm:p-6 select-none bg-stone-950 quiz-screen-bg';
    modal.innerHTML = `
        <audio id="bgm-quiz" src="audio/quiz_bgm.mp3" loop preload="none"></audio>

        <!-- 1. 典学 タイトル幕 -->
        <div id="quiz-view-title" onclick="goToQuizMenuStep('era')" class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer z-30 bg-stone-950/40">
            <div class="text-center flex flex-col items-center">
                <p class="animate-quiz-fade-1 text-amber-500/80 font-serif text-base sm:text-xl tracking-[0.4em] mb-4">歴史修練場</p>
                <div class="animate-quiz-fade-2 mb-8 flex justify-center">
                    <img src="images/quiz_logo.png" alt="典学" class="max-w-[280px] sm:max-w-[420px] md:max-w-[500px] w-auto h-auto drop-shadow-[0_15px_30px_rgba(0,0,0,0.95)] pointer-events-none select-none">
                </div>
                <div class="animate-quiz-fade-3 inline-block">
                    <div class="py-2.5 px-8 border-y-2 border-amber-600/60 text-amber-200 font-serif text-lg sm:text-xl tracking-widest animate-pulse bg-stone-900/60 backdrop-blur-sm shadow-xl">
                        画面に触れて修練を開始
                    </div>
                </div>
            </div>
            <button onclick="event.stopPropagation(); closeQuizModal();" class="absolute top-6 right-6 px-4 py-1.5 bg-stone-900/80 border border-stone-700 hover:border-rose-500 text-stone-300 hover:text-rose-300 rounded text-sm transition z-50 cursor-pointer">
                <i class="fa-solid fa-person-walking-arrow-right mr-1.5"></i>戻る
            </button>
        </div>

        <!-- 2. 選択メニュー階層コンテナ（時代 ➔ 等級 ➔ 試練） -->
        <div id="quiz-view-select" class="absolute inset-0 flex flex-col justify-between p-3 sm:p-6 z-20 hidden">
            <div class="w-full max-w-5xl mx-auto flex items-center justify-between border-b border-amber-900/60 pb-3">
                <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
                    <span class="text-amber-400 font-serif text-lg sm:text-2xl font-bold flex items-center">
                        <i class="fa-solid fa-scroll mr-2 text-amber-500"></i>典学修練録
                    </span>
                    <span id="quiz-select-breadcrumb" class="text-stone-400 text-xs sm:text-sm font-serif"></span>
                    <h2 id="quiz-select-heading" class="text-amber-200 font-serif text-sm sm:text-base font-bold pl-2 border-l border-amber-800/80"></h2>
                </div>
                <button onclick="handleQuizMenuBack()" class="px-3 py-1 bg-stone-900/80 border border-stone-700 hover:border-amber-600 text-stone-300 rounded text-sm transition cursor-pointer">
                    <i class="fa-solid fa-arrow-left mr-1"></i>戻る
                </button>
            </div>
            <div class="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-start pt-2 pb-2 overflow-hidden relative">
                <div id="quiz-select-grid" class="w-full h-full overflow-hidden flex flex-col"></div>
            </div>
            <div class="w-full max-w-4xl mx-auto text-center text-stone-500 text-xs tracking-widest font-serif">
                大和の縁 〜典学修練場〜
            </div>
        </div>

        <!-- 3. 開始直前カウントダウン幕 -->
        <div id="quiz-view-countdown" class="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/80 backdrop-blur-sm z-40 hidden select-none pointer-events-none">
            <p id="quiz-countdown-sub" class="text-amber-400/90 font-serif text-xl sm:text-2xl mb-4 tracking-widest"></p>
            <div id="quiz-countdown-num" class="text-8xl sm:text-9xl font-mono font-black text-amber-300 drop-shadow-[0_0_35px_rgba(245,158,11,0.8)] animate-ping">5</div>
            <p class="text-stone-400 text-sm font-serif mt-6 tracking-widest">いざ、尋常に修練へ入らん――</p>
        </div>

        <!-- 4. 出題画面 -->
        <div id="quiz-view-battle" class="flex flex-col justify-between h-full w-full hidden">
            <header class="w-full max-w-4xl mx-auto flex items-center justify-between border-b border-amber-900/60 pb-3">
                <div class="flex items-center space-x-3">
                    <span id="quiz-title-badge" class="px-3 py-1 bg-amber-950/80 border border-amber-600/60 text-amber-300 font-bold text-sm tracking-widest rounded shadow"></span>
                    <span id="quiz-progress-text" class="text-stone-400 font-serif text-sm sm:text-base font-semibold"></span>
                </div>
                <div class="flex items-center space-x-2 bg-stone-900/80 px-4 py-1.5 rounded-full border border-amber-800/50 shadow-inner">
                    <i class="fa-solid fa-stopwatch text-amber-400 text-base animate-pulse"></i>
                    <span id="quiz-timer" class="font-mono text-lg sm:text-xl font-bold text-amber-300 w-20 text-center">15.00</span>
                </div>
                <button onclick="closeQuizModal()" class="px-3 py-1 bg-stone-900/90 border border-stone-700 hover:border-rose-500/80 text-stone-300 hover:text-rose-300 rounded text-sm transition">
                    <i class="fa-solid fa-person-walking-arrow-right mr-1"></i>退出
                </button>
            </header>

            <div class="w-full max-w-4xl mx-auto bg-stone-900 h-2 rounded-full overflow-hidden border border-stone-800 my-2">
                <div id="quiz-timer-bar" class="bg-amber-500 h-full w-full transition-all duration-75"></div>
            </div>

            <main class="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center py-2 sm:py-6">
                <div class="bg-stone-900/90 border-2 border-amber-800/60 rounded-2xl p-6 sm:p-8 shadow-2xl mb-4 relative overflow-hidden">
                    <div id="quiz-type-indicator" class="absolute top-3 left-4 px-2 py-0.5 rounded text-[11px] font-bold border"></div>
                    <p id="quiz-question-text" class="text-lg sm:text-2xl font-serif font-bold text-stone-100 leading-relaxed text-center min-h-[70px] flex items-center justify-center pt-2">
                        読み込み中...
                    </p>
                </div>

                <div id="quiz-answer-mount" class="w-full"></div>

                <div id="quiz-feedback-box" class="mt-4 p-4 rounded-xl border text-sm sm:text-base hidden transition shadow-lg">
                    <div id="quiz-feedback-result" class="font-bold text-base sm:text-lg mb-1 flex items-center"></div>
                    <div id="quiz-feedback-desc" class="text-stone-300 font-serif leading-relaxed"></div>
                </div>
            </main>

            <footer class="w-full max-w-4xl mx-auto text-center py-2 text-stone-500 text-xs tracking-widest font-serif">
                大和の縁 〜典学修練場〜
            </footer>
        </div>

        <!-- 5. 出陣確認ダイアログ -->
        <div id="quiz-confirm-dialog" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-stone-900 border-2 border-amber-600/80 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl">
                <div class="text-amber-400 text-3xl mb-3"><i class="fa-solid fa-feather-pointed"></i></div>
                <h3 class="text-lg font-serif font-bold text-stone-300 mb-2">試練への出陣確認</h3>
                <p id="quiz-confirm-target-text" class="text-xl sm:text-2xl font-serif font-bold text-amber-200 mb-6 border-y border-amber-900/60 py-3"></p>
                <div class="flex space-x-4">
                    <button onclick="closeQuizConfirmDialog()" class="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg border border-stone-600 font-bold transition">選び直す</button>
                    <button onclick="executeQuizStartCountdown()" class="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg border border-amber-500 font-bold shadow-lg transition">はい（挑む）</button>
                </div>
            </div>
        </div>

        <!-- 6. リザルト画面 -->
        <div id="quiz-result-view" class="absolute inset-0 bg-stone-950/98 flex flex-col items-center justify-center p-6 hidden z-40">
            <div class="max-w-md w-full bg-stone-900/90 border-2 border-amber-600/70 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
                <i class="fa-solid fa-award text-5xl text-amber-400 mb-3 animate-bounce"></i>
                <h3 class="text-2xl sm:text-3xl font-serif font-bold text-amber-200 mb-2">修練完了</h3>
                <p id="quiz-result-score" class="text-stone-300 font-mono text-lg mb-6"></p>
                <div class="bg-stone-950 border border-amber-600/60 rounded-xl p-4 mb-6 shadow-inner">
                    <div id="quiz-reward-text" class="text-base sm:text-lg font-serif font-bold text-amber-100"></div>
                </div>
                <div class="flex space-x-4">
                    <button onclick="restartCurrentTrial()" class="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold rounded-lg border border-stone-600 transition">再挑戦</button>
                    <button onclick="goToQuizMenuStep('trial')" class="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-amber-50 font-bold rounded-lg border border-amber-500 shadow-lg transition">試練選択へ</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function renderStarGauge(rate) {
    const filledStars = Math.min(5, Math.floor(rate / 0.20));
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        starsHtml += i <= filledStars 
            ? '<span class="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]">★</span>' 
            : '<span class="text-stone-600/80">★</span>';
    }
    return starsHtml;
}

function showView(viewName) {
    ensureQuizModalDOM();
    const titleEl = document.getElementById('quiz-view-title');
    const selectEl = document.getElementById('quiz-view-select');
    const battleEl = document.getElementById('quiz-view-battle');
    const countdownEl = document.getElementById('quiz-view-countdown');
    const resultEl = document.getElementById('quiz-result-view');

    [titleEl, selectEl, battleEl, countdownEl, resultEl].forEach(el => el?.classList.add('hidden'));

    if (viewName === 'title' && titleEl) {
        titleEl.classList.remove('hidden');
    } else if (viewName === 'select') {
        selectEl?.classList.remove('hidden');
    } else if (viewName === 'battle') {
        battleEl?.classList.remove('hidden');
    }
}

// ==========================================
// 3. 階層選択メニュー（完全マスターCSV駆動）
// ==========================================
async function goToQuizMenuStep(step) {
    quizSelection.step = step;
    showView('select');

    await loadQuizMasterCSV();

    const grid = document.getElementById('quiz-select-grid');
    const heading = document.getElementById('quiz-select-heading');
    const breadcrumb = document.getElementById('quiz-select-breadcrumb');
    if (!grid || !heading || !breadcrumb) return;

    grid.innerHTML = '';

    // 1. 時代選択（is_active === "1" の時代のみ動的表示）
    if (step === 'era') {
        heading.innerText = '挑む時代を選択せよ';
        breadcrumb.innerText = '時代選択';
        grid.className = "grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 max-h-[75vh] overflow-y-auto px-1 py-1 w-full";

        const activeEras = getActiveErasFromMaster();

        if (activeEras.length === 0) {
            grid.innerHTML = `<div class="text-stone-400 font-serif text-center col-span-2 py-12">現在開放されている修練場はありません。</div>`;
            return;
        }

        activeEras.forEach(era => {
            const btn = document.createElement('button');
            btn.className = "relative w-full h-28 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-xl text-left bg-stone-900 cursor-pointer";
            btn.innerHTML = `
                <img src="${era.banner}" alt="${era.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='images/quiz_carousel_bg.jpg'">
                <div class="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-transparent to-black/30"></div>
                <div class="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs font-serif">
                    <span class="text-amber-100 font-bold text-lg drop-shadow">${era.name}</span>
                    <span class="text-amber-400 font-mono font-bold drop-shadow">修練開放中</span>
                </div>
            `;
            btn.onclick = () => {
                quizSelection.era = era.id;
                quizSelection.eraName = era.name;
                goToQuizMenuStep('level');
            };
            grid.appendChild(btn);
        });

    // 2. 等級選択（選択中の時代で is_active === "1" の等級のみ動的表示）
    } else if (step === 'level') {
        heading.innerText = '等級を選択せよ';
        breadcrumb.innerText = quizSelection.eraName;
        grid.className = "flex flex-col justify-center gap-3.5 h-[72vh] w-full max-w-xl mx-auto overflow-hidden px-2 py-1";

        const activeLevels = getActiveLevelsForEra(quizSelection.era);
        const progressData = getQuizProgress();
        const progress = progressData[quizSelection.era] || {};

        activeLevels.forEach((row, idx) => {
            const lvlId = row.level_id;
            const lvlData = progress[lvlId] || { stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 };

            // 前等級クリアアンロック判定
            let isUnlocked = true;
            if (idx > 0) {
                const prevLvlId = activeLevels[idx - 1].level_id;
                isUnlocked = progress[prevLvlId]?.cleared || false;
            }

            const banner = row.level_banner || `images/quiz_${quizSelection.era}_${lvlId}_banner.jpg`;
            const fixedCleared = Math.min(3, lvlData.stagesCleared || 0);
            const loopDone = Math.min(10, lvlData.loops || 0) + Math.min(10, lvlData.randomLoops || 0);
            const randomCleared = lvlData.randomCleared ? 1 : 0;
            const rate = Math.min(1.0, (fixedCleared + loopDone + randomCleared) / 24);
            const stars = renderStarGauge(rate);
            const ratePercent = Math.min(100, Math.floor(rate * 100));

            const btn = document.createElement('button');
            const fitStyle = `height: ${Math.floor(65 / activeLevels.length)}vh; max-height: 180px; aspect-ratio: 16 / 7;`;

            if (isUnlocked) {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-2xl overflow-hidden border-2 border-amber-600/70 hover:border-amber-400 active:scale-[0.99] transition duration-200 group shadow-2xl text-left bg-stone-900 block cursor-pointer mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <img src="${banner}" alt="${row.level_name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='images/quiz_carousel_bg.jpg'">
                    <div class="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-950/25 to-transparent"></div>
                    <div class="absolute top-3 left-4">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/80 border border-amber-500/60 text-amber-300 font-serif">${row.level_name}</span>
                        <h3 class="text-xl sm:text-2xl font-serif font-black text-amber-100 mt-1">${row.level_name}修練</h3>
                    </div>
                    <div class="absolute bottom-2 left-4 right-4 flex flex-col gap-1 pointer-events-none">
                        <div class="flex items-center justify-between">
                            <div class="text-xs sm:text-sm tracking-widest flex items-center select-none">${stars}</div>
                            <div class="text-[10px] sm:text-xs text-amber-400 font-mono font-bold drop-shadow">${ratePercent}%</div>
                        </div>
                        <div class="w-full bg-stone-950/90 h-1.5 rounded-full overflow-hidden border border-amber-900/60 shadow-inner">
                            <div class="bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 h-full transition-all duration-300" style="width: ${ratePercent}%;"></div>
                        </div>
                    </div>
                `;
                btn.onclick = async () => {
                    quizSelection.level = lvlId;
                    quizSelection.levelName = row.level_name;
                    quizSelection.levelRow = row;

                    // 対象CSVをロードして試練構成を自動解析
                    await loadTargetQuizCSV(row.quiz_csv);
                    quizSelection.dynamicStages = getLevelStageInfo();

                    goToQuizMenuStep('trial');
                };
            } else {
                btn.style.cssText = fitStyle;
                btn.className = "relative w-full rounded-2xl overflow-hidden border-2 border-stone-800 text-left bg-stone-950 opacity-60 grayscale pointer-events-none block mx-auto flex-shrink-0";
                btn.innerHTML = `
                    <div class="absolute inset-0 bg-stone-950/85 flex flex-col items-center justify-center">
                        <i class="fa-solid fa-lock text-amber-500/80 text-2xl mb-1 drop-shadow"></i>
                        <span class="text-stone-300 font-serif text-xs tracking-wider">前等級 満点制覇で開放</span>
                    </div>
                `;
            }
            grid.appendChild(btn);
        });

    // 3. 試練一覧（木札カルーセル ＆ 勾玉星図）
    } else if (step === 'trial') {
        const lvl = quizSelection.levelRow || { level_id: quizSelection.level, level_name: quizSelection.levelName };
        heading.innerText = '試練を選択せよ';
        breadcrumb.innerText = `${quizSelection.eraName} > ${quizSelection.levelName}`;
        
        if (!quizSelection.dynamicStages || quizSelection.dynamicStages.length === 0) {
            const csvPath = quizSelection.levelRow?.quiz_csv || `quiz/quiz_${quizSelection.era}_${quizSelection.level}.csv`;
            await loadTargetQuizCSV(csvPath);
            quizSelection.dynamicStages = getLevelStageInfo();
        }

        renderTrialCarouselView(grid, lvl);
    }
}

// ==========================================
// 4. 試練カルーセル ＆ 勾玉星図描画
// ==========================================
const STAR_CHART_COORDS = [
    { x: 18, y: 55 },
    { x: 26, y: 40 },
    { x: 35, y: 32 },
    { x: 44, y: 48 },
    { x: 53, y: 62 },
    { x: 62, y: 50 },
    { x: 70, y: 35 },
    { x: 76, y: 24 },
    { x: 80, y: 45 },
    { x: 84, y: 60 }
];

function renderTrialCarouselView(container, lvl) {
    const eraId = quizSelection.era;
    const levelId = lvl.level_id || quizSelection.level;
    const progressData = getQuizProgress();
    const lvlProg = progressData[eraId]?.[levelId] || { stagesCleared: 0, loops: 0 };

    const stagesList = quizSelection.dynamicStages && quizSelection.dynamicStages.length > 0 
        ? quizSelection.dynamicStages 
        : [
            { stageNum: 1, type: 'choice' },
            { stageNum: 2, type: 'input' },
            { stageNum: 3, type: 'desc' }
        ];

    const totalStages = stagesList.length;
    const randomUnlocked = isRandomTestUnlocked(eraId, levelId, totalStages);
    const totalItemsCount = totalStages + 1; // 通常試練 + 最終試練

    container.className = "w-full h-full flex flex-col overflow-hidden relative";
    container.innerHTML = `
        <!-- ① 上部：格子戸背景 ＆ 縦長木札 横カルーセル（52%） -->
        <div class="relative w-full h-[52%] overflow-hidden flex items-center justify-center border-b border-amber-900/60 rounded-t-xl" 
             style="background-image: url('images/quiz_carousel_bg.jpg'); background-size: cover; background-position: center;">
            <div class="absolute inset-0 bg-stone-950/20 pointer-events-none"></div>

            <!-- 左右送り矢印ボタン -->
            <button onclick="scrollTrialCarousel(-1)" class="absolute left-2 z-30 w-8 h-12 bg-black/60 hover:bg-black/90 active:scale-95 text-amber-400 border border-amber-600/40 rounded flex items-center justify-center cursor-pointer">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button onclick="scrollTrialCarousel(1)" class="absolute right-2 z-30 w-8 h-12 bg-black/60 hover:bg-black/90 active:scale-95 text-amber-400 border border-amber-600/40 rounded flex items-center justify-center cursor-pointer">
                <i class="fa-solid fa-chevron-right"></i>
            </button>

            <!-- 横スクロールコンテナ -->
            <div id="trial-carousel-slider" class="w-full h-full flex items-center gap-6 px-[35%] overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar py-3">
                ${stagesList.map((stg, idx) => {
                    const stageNum = stg.stageNum;
                    const trialType = stg.type;
                    const tagAsset = QUIZ_TAG_ASSETS[trialType] || QUIZ_TAG_ASSETS.choice;
                    const isUnlocked = isTrialUnlocked(eraId, levelId, idx);
                    const trialName = `第${NUMBER_KANJI[idx] || (idx + 1)}試練`;
                    const isCleared = (lvlProg.stagesCleared || 0) > idx;
                    const isMaxLoop = (lvlProg.loops || 0) >= 10;

                    return `
                    <div id="trial-card-${idx}" 
                         onclick="${isUnlocked ? `window.handleTrialCardClick(${idx}, ${stageNum}, '${trialType}', '${trialName}')` : ''}"
                         data-index="${idx}"
                         class="trial-card-item relative flex-shrink-0 h-[92%] aspect-[1/2.4] snap-center rounded-lg transition-transform duration-300 select-none cursor-pointer group ${isUnlocked ? 'hover:scale-[1.03] active:scale-95' : 'filter brightness-75'}">
                        
                        <!-- 木札画像（CSVの形式から自動決定） -->
                        <img src="${tagAsset.image}" class="w-full h-full object-contain pointer-events-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]" alt="${trialName}">

                        <!-- 札の文字 -->
                        <div class="absolute inset-0 pt-24 pb-10 px-4 flex flex-col items-center justify-center pointer-events-none">
                            <div class="font-serif font-black text-amber-100 tracking-[0.25em] text-base sm:text-lg [writing-mode:vertical-rl] drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                                ${trialName}
                            </div>
                        </div>

                        <!-- 封印鎖 -->
                        ${!isUnlocked ? `
                            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <img src="images/tag_locked_overlay.png" class="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" alt="封印">
                            </div>
                        ` : ''}

                        <!-- クリア朱印 -->
                        ${isCleared ? `
                            <div class="absolute top-[30%] right-6 sm:right-6 w-7 h-7 rounded-full border-2 ${
                                isMaxLoop 
                                    ? 'border-yellow-400 bg-amber-950 text-yellow-300 shadow-yellow-500/50' 
                                    : 'border-rose-600 bg-rose-950 text-rose-300'
                            } font-serif font-black text-xs flex items-center justify-center rotate-12 shadow-xl z-20 pointer-events-none">
                                ${isMaxLoop ? '極' : '済'}
                            </div>
                        ` : ''}

                        <!-- 周回カウント -->
                        ${isCleared ? `
                            <div class="absolute bottom-6 sm:bottom-7 inset-x-1 flex justify-center pointer-events-none z-20">
                                <span class="px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-mono font-extrabold tracking-tight shadow-lg border ${
                                    isMaxLoop 
                                        ? 'bg-amber-950/95 border-yellow-400 text-yellow-300 shadow-yellow-500/40' 
                                        : 'bg-stone-950/95 border-amber-600/70 text-amber-200'
                                }">
                                    ${lvlProg.loops || 1}/10 クリア
                                </span>
                            </div>
                        ` : ''}
                    </div>
                    `;
                }).join('')}

                <!-- ★ 最終試練（ランダム検定） -->
                <div id="trial-card-${totalStages}" 
                     onclick="${randomUnlocked ? `window.handleTrialCardClick(${totalStages}, 0, 'random', '最終試練')` : ''}"
                     data-index="${totalStages}"
                     class="trial-card-item relative flex-shrink-0 h-[92%] aspect-[1/2.4] snap-center rounded-lg transition-transform duration-300 select-none cursor-pointer group ${randomUnlocked ? 'hover:scale-[1.03] active:scale-95' : 'filter brightness-75'}">
                    
                    <img src="images/tag_random.png" class="w-full h-full object-contain pointer-events-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]" alt="最終試練" onerror="this.src='images/tag_desc.png'">

                    <div class="absolute inset-0 pt-24 pb-10 px-4 flex flex-col items-center justify-center pointer-events-none">
                        <div class="font-serif font-black text-stone-950 tracking-[0.2em] text-base sm:text-lg [writing-mode:vertical-rl] drop-shadow-[0_1px_1px_rgba(255,215,0,0.8)]">
                            最終試練
                        </div>
                    </div>

                    ${!randomUnlocked ? `
                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <img src="images/tag_locked_overlay.png" class="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" alt="封印">
                        </div>
                    ` : ''}

                    ${lvlProg.randomCleared ? `
                        <div class="absolute top-[30%] right-6 sm:right-6 w-7 h-7 rounded-full border-2 ${
                            (lvlProg.randomLoops || 0) >= 10 
                                ? 'border-yellow-400 bg-amber-950 text-yellow-300 shadow-yellow-500/50' 
                                : 'border-rose-600 bg-rose-950 text-rose-300'
                        } font-serif font-black text-xs flex items-center justify-center rotate-12 shadow-xl z-20 pointer-events-none">
                            ${(lvlProg.randomLoops || 0) >= 10 ? '極' : '済'}
                        </div>
                        <div class="absolute bottom-6 sm:bottom-7 inset-x-1 flex justify-center pointer-events-none z-20">
                            <span class="px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-mono font-extrabold tracking-tight shadow-lg border ${
                                (lvlProg.randomLoops || 0) >= 10 
                                    ? 'bg-amber-950/95 border-yellow-400 text-yellow-300 shadow-yellow-500/40' 
                                    : 'bg-stone-950/95 border-amber-600/70 text-amber-200'
                            }">
                                ${lvlProg.randomLoops || 1}/10 クリア
                            </span>
                        </div>
                    ` : ''}
                </div>

            </div>
        </div>

        <!-- ② 下部：絵巻星図背景 ＆ 勾玉星図マップ -->
        <div class="relative w-full h-[48%] overflow-hidden flex items-center justify-center bg-stone-950 p-2 sm:p-4">
            
            <div class="relative h-full aspect-[16/8] max-w-full rounded-lg shadow-2xl flex items-center justify-center overflow-hidden border border-amber-950"
                 style="background-image: url('images/quiz_star_chart_bg.jpg'); background-size: 100% 100%; background-repeat: no-repeat; background-position: center;">
                
                <div class="absolute inset-0">
                    ${Array.from({ length: totalItemsCount }).map((_, idx) => {
                        const pos = STAR_CHART_COORDS[idx % STAR_CHART_COORDS.length];
                        const isFinal = idx === totalStages;

                        let isUnlocked = false;
                        let isCleared = false;
                        let isMaxLoop = false;
                        let labelText = `${idx + 1}`;

                        if (!isFinal) {
                            isUnlocked = isTrialUnlocked(eraId, levelId, idx);
                            isCleared = (lvlProg.stagesCleared || 0) > idx;
                            isMaxLoop = (lvlProg.loops || 0) >= 10;
                        } else {
                            isUnlocked = randomUnlocked;
                            isCleared = !!lvlProg.randomCleared;
                            isMaxLoop = (lvlProg.randomLoops || 0) >= 10;
                            labelText = "終";
                        }

                        let magatamaImg = 'images/magatama_gray.png';
                        if (isMaxLoop) magatamaImg = 'images/magatama_gold.png';
                        else if (isCleared) magatamaImg = 'images/magatama_green.png';

                        return `
                        <div id="magatama-node-${idx}"
                             onclick="jumpToCarouselIndex(${idx})"
                             style="left: ${pos.x}%; top: ${pos.y}%;"
                             class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 flex flex-col items-center group">
                            
                            <div class="magatama-icon-wrapper relative w-6 h-6 sm:w-8 sm:h-8 transition-all duration-300 group-hover:scale-125">
                                <img src="${magatamaImg}" class="w-full h-full object-contain filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]" alt="勾玉">
                            </div>
                            <span class="text-[9px] font-mono font-bold ${isFinal ? 'text-yellow-300 font-serif' : 'text-amber-200'} -mt-0.5 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                                ${labelText}
                            </span>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

        </div>
    `;

    setupCarouselScrollEvents(totalItemsCount);
}

function setupCarouselScrollEvents(totalStages) {
    const slider = document.getElementById('trial-carousel-slider');
    if (!slider) return;

    slider.onscroll = () => {
        const center = slider.scrollLeft + slider.clientWidth / 2;
        let closestIdx = 0;
        let minDiff = Infinity;

        for (let i = 0; i < totalStages; i++) {
            const card = document.getElementById(`trial-card-${i}`);
            if (card) {
                const cardCenter = card.offsetLeft + card.clientWidth / 2;
                const diff = Math.abs(center - cardCenter);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = i;
                }
            }
        }
        updateActiveIndexDisplay(closestIdx);
    };

    updateActiveIndexDisplay(0);
}

function updateActiveIndexDisplay(index) {
    currentTrialActiveIndex = index;

    document.querySelectorAll('.trial-card-item').forEach((el, i) => {
        if (i === index) {
            el.style.transform = 'scale(1.08)';
            el.style.filter = 'brightness(1.05)';
            el.style.zIndex = '10';
        } else {
            el.style.transform = 'scale(0.92)';
            el.style.filter = 'brightness(0.7)';
            el.style.zIndex = '1';
        }
    });

    document.querySelectorAll('[id^="magatama-node-"]').forEach((node, i) => {
        const wrapper = node.querySelector('.magatama-icon-wrapper');
        if (!wrapper) return;
        if (i === index) {
            wrapper.style.filter = 'drop-shadow(0 0 10px rgba(251, 191, 36, 1)) drop-shadow(0 0 20px rgba(245, 158, 11, 0.8))';
            wrapper.style.transform = 'scale(1.25)';
        } else {
            wrapper.style.filter = 'none';
            wrapper.style.transform = 'scale(1.0)';
        }
    });
}

function scrollTrialCarousel(direction) {
    const slider = document.getElementById('trial-carousel-slider');
    if (!slider) return;
    const nextIdx = Math.max(0, currentTrialActiveIndex + direction);
    jumpToCarouselIndex(nextIdx);
}

window.scrollTrialCarousel = scrollTrialCarousel;

window.jumpToCarouselIndex = function(index) {
    const slider = document.getElementById('trial-carousel-slider');
    const targetCard = document.getElementById(`trial-card-${index}`);
    if (slider && targetCard) {
        const targetScrollLeft = targetCard.offsetLeft - (slider.clientWidth / 2) + (targetCard.clientWidth / 2);
        slider.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    }
};

window.handleTrialCardClick = function(index, stageNum, trialType, trialName) {
    if (currentTrialActiveIndex !== index) {
        jumpToCarouselIndex(index);
    } else {
        quizSelection.trial = stageNum;
        quizSelection.trialType = trialType;
        quizSelection.trialName = trialName;
        openQuizConfirmDialog();
    }
};

window.selectTrialItem = function(stageNum, trialType, trialName) {
    quizSelection.trial = stageNum;
    quizSelection.trialType = 'fixed';
    quizSelection.trialName = trialName;
    openQuizConfirmDialog();
};

window.selectRandomExamItem = function() {
    quizSelection.trial = 0;
    quizSelection.trialType = 'random';
    quizSelection.trialName = '最終試練';
    openQuizConfirmDialog();
};

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
// 5. 出陣カウントダウン ＆ 出題
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
    document.getElementById('quiz-confirm-dialog')?.classList.add('hidden');
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

async function startSelectedQuiz() {
    showView('battle');

    const csvPath = quizSelection.levelRow?.quiz_csv || `quiz/quiz_${quizSelection.era}_${quizSelection.level}.csv`;
    if (cachedQuizData.csvPath !== csvPath || cachedQuizData.allLevelQuestions.length === 0) {
        await loadTargetQuizCSV(csvPath);
    }

    let questions = [];
    if (quizSelection.trialType === 'random') {
        questions = getRandomExamQuestions();
    } else {
        questions = getFixedPackageQuestions(quizSelection.trial);
    }

    if (!questions || questions.length === 0) {
        alert(`${quizSelection.eraName}【${quizSelection.levelName}】の ${quizSelection.trialName} データが存在しません。`);
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

// 1問ごとの制限時間（time_limit）反映 ＆ 動的UI
function renderCurrentQuestion() {
    const session = currentQuizSession;
    const q = session.questions[session.currentIndex];
    session.isLocked = false;

    // ★ CSVの time_limit 列があればその秒数、なければ15秒
    const limitSec = (q.time_limit && !isNaN(parseFloat(q.time_limit))) ? parseFloat(q.time_limit) : 15.0;
    session.perQuestionTime = limitSec;
    session.timeRemaining = limitSec;

    document.getElementById('quiz-progress-text').innerText = `第 ${session.currentIndex + 1} / ${session.questions.length} 問`;
    document.getElementById('quiz-question-text').innerText = q.question;
    document.getElementById('quiz-feedback-box').classList.add('hidden');

    const mount = document.getElementById('quiz-answer-mount');
    mount.innerHTML = '';

    const indicator = document.getElementById('quiz-type-indicator');
    const qType = q.q_type || 'choice';
    const tagInfo = QUIZ_TAG_ASSETS[qType] || QUIZ_TAG_ASSETS.choice;
    indicator.className = `absolute top-3 left-4 px-2 py-0.5 rounded text-[11px] font-bold border ${tagInfo.badgeColor}`;
    indicator.innerText = tagInfo.name;

    // A. 四択UI
    if (qType === 'choice') {
        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4";
        const choices = getShuffledChoices(q);
        choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = "w-full py-4 sm:py-5 px-5 bg-stone-900/90 hover:bg-stone-800 active:scale-[0.98] border-2 border-amber-900/60 hover:border-amber-500 rounded-xl text-left text-base sm:text-xl font-serif font-bold text-stone-200 transition duration-150 flex items-center justify-between shadow-md";
            btn.innerHTML = `<span>${ch.text}</span><i class="fa-solid fa-chevron-right text-stone-600 text-sm"></i>`;
            btn.onclick = () => submitAnswer(ch.isCorrect, q);
            grid.appendChild(btn);
        });
        mount.appendChild(grid);

    // B. 一問一答（直打ち）UI
    } else if (qType === 'input') {
        const wrap = document.createElement('div');
        wrap.className = "flex flex-col sm:flex-row gap-3 w-full max-w-xl mx-auto";
        wrap.innerHTML = `
            <input type="text" id="quiz-direct-input" placeholder="用語を入力（Enterで回答）" 
                   class="flex-1 px-4 py-3.5 bg-stone-950 border-2 border-amber-800/80 focus:border-amber-400 rounded-xl text-amber-100 font-serif text-lg outline-none shadow-inner" autocomplete="off">
            <button id="quiz-direct-submit" class="px-6 py-3.5 bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-serif font-bold rounded-xl border border-amber-500 shadow-lg transition">
                回答する
            </button>
        `;
        mount.appendChild(wrap);

        const inputEl = document.getElementById('quiz-direct-input');
        const submitBtn = document.getElementById('quiz-direct-submit');

        setTimeout(() => inputEl?.focus(), 50);

        const handleInputSubmit = () => {
            const val = inputEl.value;
            if (!val.trim()) return;
            const isOk = judgeUserAnswer(val, q);
            submitAnswer(isOk, q);
        };

        submitBtn.onclick = handleInputSubmit;
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') handleInputSubmit();
        };

    // C. 記述UI
    } else if (qType === 'desc') {
        const wrap = document.createElement('div');
        wrap.className = "flex flex-col gap-3 w-full max-w-xl mx-auto";
        wrap.innerHTML = `
            <textarea id="quiz-desc-input" rows="3" placeholder="要点を簡潔に入力せよ" 
                      class="w-full px-4 py-3 bg-stone-950 border-2 border-amber-800/80 focus:border-amber-400 rounded-xl text-amber-100 font-serif text-base outline-none shadow-inner resize-none"></textarea>
            <button id="quiz-desc-submit" class="w-full py-3 bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-serif font-bold rounded-xl border border-amber-500 shadow-lg transition">
                回答を提出
            </button>
        `;
        mount.appendChild(wrap);

        const descEl = document.getElementById('quiz-desc-input');
        const submitBtn = document.getElementById('quiz-desc-submit');

        setTimeout(() => descEl?.focus(), 50);

        submitBtn.onclick = () => {
            const val = descEl.value;
            if (!val.trim()) return;
            const isOk = judgeUserAnswer(val, q);
            submitAnswer(isOk, q);
        };
    }

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
            submitAnswer(false, currentQuestion, true);
        }
        updateTimerUI();
    }, interval);
}

// 分:秒 フォーマット対応タイマーUI
function updateTimerUI() {
    const remain = Math.max(0, currentQuizSession.timeRemaining);
    const minutes = Math.floor(remain / 60);
    const seconds = (remain % 60);

    const timeText = minutes > 0 
        ? `${minutes}:${seconds < 10 ? '0' : ''}${seconds.toFixed(1)}`
        : remain.toFixed(2);

    document.getElementById('quiz-timer').innerText = timeText;

    const pct = (remain / currentQuizSession.perQuestionTime) * 100;
    const bar = document.getElementById('quiz-timer-bar');
    if (bar) {
        bar.style.width = `${pct}%`;
        bar.className = pct < 25 ? "bg-rose-500 h-full w-full transition-all" : "bg-amber-500 h-full w-full transition-all";
    }
}

function submitAnswer(isCorrect, questionItem, isTimeout = false) {
    if (currentQuizSession.isLocked) return;
    currentQuizSession.isLocked = true;
    clearInterval(currentQuizSession.timer);

    const feedbackBox = document.getElementById('quiz-feedback-box');
    const resultText = document.getElementById('quiz-feedback-result');
    const descText = document.getElementById('quiz-feedback-desc');
    feedbackBox.classList.remove('hidden');

    const correctAnswerStr = questionItem.choice1 || questionItem.answer || "";

    if (isCorrect) {
        currentQuizSession.score++;
        feedbackBox.className = "mt-4 p-4 rounded-xl border border-emerald-600 bg-emerald-950/70 text-stone-200 shadow-lg";
        resultText.innerHTML = `<span class="text-emerald-400 text-lg"><i class="fa-solid fa-circle-check mr-2"></i>正解</span>`;
    } else {
        feedbackBox.className = "mt-4 p-4 rounded-xl border border-rose-600 bg-rose-950/70 text-stone-200 shadow-lg";
        const reason = isTimeout ? "時間切れ！" : "不正解...";
        resultText.innerHTML = `
            <span class="text-rose-400 text-lg"><i class="fa-solid fa-circle-xmark mr-2"></i>${reason}</span>
            <span class="ml-3 text-sm text-stone-300">正解: <strong class="text-amber-300 font-serif">${correctAnswerStr}</strong></span>
        `;
    }
    descText.innerText = questionItem.explanation || "";

    setTimeout(() => {
        currentQuizSession.currentIndex++;
        if (currentQuizSession.currentIndex < currentQuizSession.questions.length) {
            renderCurrentQuestion();
        } else {
            showQuizResult();
        }
    }, 1300);
}

// ==========================================
// 6. リザルト画面 ＆ CSV指定の報酬付与・覚醒置換
// ==========================================
function showQuizResult() {
    const session = currentQuizSession;
    const resultView = document.getElementById('quiz-result-view');
    const scoreText = document.getElementById('quiz-result-score');
    const rewardText = document.getElementById('quiz-reward-text');

    scoreText.innerText = `${session.questions.length}問中 ${session.score}問 正解`;

    const isPerfect = session.score === session.questions.length;
    let rewardHtml = '';

    if (isPerfect) {
        const progressData = getQuizProgress();
        if (!progressData[quizSelection.era]) progressData[quizSelection.era] = {};
        if (!progressData[quizSelection.era][quizSelection.level]) {
            progressData[quizSelection.era][quizSelection.level] = { stagesCleared: 0, loops: 0, randomCleared: false, randomLoops: 0 };
        }
        const lvlProg = progressData[quizSelection.era][quizSelection.level];
        const masterRow = quizSelection.levelRow;
        const totalStages = quizSelection.dynamicStages?.length || 3;

        if (quizSelection.trialType === 'fixed') {
            lvlProg.stagesCleared = Math.max(lvlProg.stagesCleared, quizSelection.trial);
            if (lvlProg.stagesCleared >= totalStages) {
                lvlProg.cleared = true;
                lvlProg.loops = (lvlProg.loops || 0) + 1;
            }
        } else if (quizSelection.trialType === 'random') {
            lvlProg.randomCleared = true;
            lvlProg.randomLoops = (lvlProg.randomLoops || 0) + 1;
        }

        saveQuizProgress(progressData);

        // ① 初回満点クリア報酬（quiz_master.csv の reward_normal_id を直接使用）
        if (masterRow && masterRow.reward_normal_id) {
            const isFirst = grantNormalRewardCard(masterRow.reward_normal_id, masterRow.reward_name);
            if (isFirst) {
                rewardHtml += `<div class="text-amber-300 font-bold text-base sm:text-lg animate-bounce">【初制覇報酬】カード『${masterRow.reward_name}』獲得！</div>`;
            }
        }

        // ② 10周完走時（進捗100%）の覚醒置換（quiz_master.csv の reward_awk_id を直接使用）
        const fixedCleared = Math.min(totalStages, lvlProg.stagesCleared || 0);
        const loopDone = Math.min(10, lvlProg.loops || 0) + Math.min(10, lvlProg.randomLoops || 0);
        const randomCleared = lvlProg.randomCleared ? 1 : 0;
        const totalSum = fixedCleared + loopDone + randomCleared;
        const totalReq = totalStages + 10 + 1 + 10;

        if (masterRow && masterRow.reward_awk_id && totalSum >= totalReq) {
            const justAwakened = replaceWithAwakenedCard(masterRow.reward_normal_id, masterRow.reward_awk_id, masterRow.reward_name);
            if (justAwakened) {
                rewardHtml += `
                    <div class="mt-2 p-2 bg-gradient-to-r from-amber-600/50 via-yellow-400/60 to-amber-600/50 border border-yellow-300 rounded-lg text-yellow-100 font-bold text-xs sm:text-sm tracking-wider animate-pulse shadow-lg">
                        ★ 典学極致：『${masterRow.reward_name}』が覚醒し、真の姿へと昇華した！ ★
                    </div>
                `;
            }
        }

        if (!rewardHtml) {
            rewardHtml = `<span class="text-amber-300 font-bold">満点達成！修練の記録を更新した。</span>`;
        }

        if (window.addMagatamaDirect) addMagatamaDirect(500);
    } else {
        rewardHtml = `<span class="text-stone-400">満点達成で進行度アップ！再挑戦しよう。</span>`;
    }

    rewardText.innerHTML = rewardHtml;
    resultView.classList.remove('hidden');
}

function restartCurrentTrial() {
    document.getElementById('quiz-result-view')?.classList.add('hidden');
    executeQuizStartCountdown();
}

function openQuizModal() {
    ensureQuizModalDOM();
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.remove('hidden');
    switchQuizBGM(true);
    showView('title');
}

function closeQuizModal() {
    if (typeof currentQuizSession !== 'undefined' && currentQuizSession && currentQuizSession.timer) {
        clearInterval(currentQuizSession.timer);
    }
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.classList.add('hidden');
    closeQuizConfirmDialog();
    switchQuizBGM(false);
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