/**
 * story_ui.js - ストーリーモード ＆ 漫画ビューアUI
 */

let currentMangaPageIndex = 0;
const TOTAL_MANGA_PAGES = 10; // 仮画像10枚
let selectedPrologueGender = 'male';

function initStoryUI() {
    const container = document.getElementById('title-menu-container');
    if (!container || document.getElementById('btn-story-mode')) return;

    const story = typeof getStoryData === 'function' ? getStoryData() : { prologueCleared: false };

    // ストーリーモードボタンをメニューの先頭に追加
    const storyBtnHtml = `
        <button id="btn-story-mode" class="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-amber-950/60 border border-amber-300 hover:scale-105 active:scale-95 transition-all text-left flex items-center justify-between cursor-pointer">
            <span class="flex items-center gap-2.5">
                <i class="fa-solid fa-scroll text-lg"></i>
                <span>ストーリーモード</span>
            </span>
            <span class="text-[10px] bg-slate-950/20 px-2 py-0.5 rounded font-normal">${story.prologueCleared ? '自由選択' : '序章'}</span>
        </button>
    `;

    container.insertAdjacentHTML('afterbegin', storyBtnHtml);
    document.getElementById('btn-story-mode').addEventListener('click', openStoryMode);

    // 未クリアの場合は他ボタンをロック
    applyStoryLockState();
}

function applyStoryLockState() {
    const story = typeof getStoryData === 'function' ? getStoryData() : { prologueCleared: false };
    if (story.prologueCleared) return; // クリア済みならロック解除

    const targetBtnIds = ['btn-free-battle', 'btn-p2p-battle', 'btn-deck-edit', 'btn-hero-custom'];

    targetBtnIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.add('opacity-40', 'grayscale', 'cursor-not-allowed');
            btn.classList.remove('hover:scale-105', 'active:scale-95');
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                alert("📜 まずは「ストーリーモード」からプロローグをプレイしてください！");
            };
        }
    });
}

function openStoryMode() {
    const story = typeof getStoryData === 'function' ? getStoryData() : { prologueCleared: false };

    if (!story.prologueCleared) {
        openPrologueGenderModal();
    } else {
        alert("📜 プロローグクリア済み！\n各時代（旧石器・縄文・江戸…）のストーリーモードは今後のアップデートで追加されます！");
    }
}

function openPrologueGenderModal() {
    if (document.getElementById('prologue-gender-modal')) return;

    const modalHtml = `
        <div id="prologue-gender-modal" class="fixed inset-0 bg-black flex items-center justify-center z-[100] select-none p-4">
            <div class="bg-slate-900 border-2 border-amber-500 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl space-y-5">
                <h3 class="text-xl font-black text-yellow-300 font-yuji border-b border-amber-500/30 pb-2">
                    主人公の性別（姿）を選択
                </h3>
                <p class="text-xs text-slate-300">物語の主人公となる姿を選択してください。</p>
                <div class="flex gap-4">
                    <button id="btn-p-male" class="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-sm border border-amber-300 shadow-md cursor-pointer transition-all">♂ 男性主人公</button>
                    <button id="btn-p-female" class="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm border border-rose-300 shadow-md cursor-pointer transition-all">♀ 女性主人公</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btn-p-male').onclick = () => startMangaViewer('male');
    document.getElementById('btn-p-female').onclick = () => startMangaViewer('female');
}

function startMangaViewer(gender) {
    selectedPrologueGender = gender;
    document.getElementById('prologue-gender-modal')?.remove();
    currentMangaPageIndex = 0;

    openMangaViewerModal();
}

function openMangaViewerModal() {
    if (document.getElementById('manga-viewer-modal')) return;

    const modalHtml = `
        <div id="manga-viewer-modal" class="fixed inset-0 bg-black z-[110] select-none flex flex-col justify-between p-4">
            <div class="flex items-center justify-between bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800">
                <span id="manga-page-counter" class="text-xs font-bold text-amber-300 font-mono">1 / ${TOTAL_MANGA_PAGES} ページ</span>
                <span class="text-xs font-bold text-slate-300 font-yuji">プロローグ</span>
            </div>

            <div class="flex-1 flex items-center justify-center overflow-hidden my-2">
                <img id="manga-page-img" src="images/story/story00_01.jpg" class="max-h-full max-w-full object-contain rounded-lg border border-slate-800 shadow-2xl" onerror="this.src='images/default.jpg';">
            </div>

            <div class="flex gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <button id="btn-manga-prev" class="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs cursor-pointer opacity-50" disabled>◀ 戻る</button>
                <button id="btn-manga-next" class="flex-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 font-black text-xs sm:text-sm border border-amber-300 cursor-pointer shadow-lg">進む ▶</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btn-manga-prev').onclick = prevMangaPage;
    document.getElementById('btn-manga-next').onclick = nextMangaPage;
    updateMangaViewerUI();
}

function updateMangaViewerUI() {
    const counter = document.getElementById('manga-page-counter');
    const img = document.getElementById('manga-page-img');
    const prevBtn = document.getElementById('btn-manga-prev');
    const nextBtn = document.getElementById('btn-manga-next');

    if (counter) counter.innerText = `${currentMangaPageIndex + 1} / ${TOTAL_MANGA_PAGES} ページ`;
    if (img) img.src = 'images/story/story00_01.jpg';

    if (prevBtn) {
        if (currentMangaPageIndex === 0) {
            prevBtn.disabled = true;
            prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            prevBtn.disabled = false;
            prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    if (nextBtn) {
        if (currentMangaPageIndex >= TOTAL_MANGA_PAGES - 1) {
            nextBtn.innerText = "✨ プロローグ終了（カードGET！）";
            nextBtn.className = "flex-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-xs sm:text-sm border border-emerald-300 cursor-pointer shadow-lg animate-pulse";
        } else {
            nextBtn.innerText = "進む ▶";
            nextBtn.className = "flex-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 font-black text-xs sm:text-sm border border-amber-300 cursor-pointer shadow-lg";
        }
    }
}

function prevMangaPage() {
    if (currentMangaPageIndex > 0) {
        currentMangaPageIndex--;
        updateMangaViewerUI();
    }
}

function nextMangaPage() {
    if (currentMangaPageIndex < TOTAL_MANGA_PAGES - 1) {
        currentMangaPageIndex++;
        updateMangaViewerUI();
    } else {
        finishPrologueAndGrantReward();
    }
}

function finishPrologueAndGrantReward() {
    document.getElementById('manga-viewer-modal')?.remove();

    if (typeof completePrologueAndGrantDeck === 'function') {
        completePrologueAndGrantDeck(selectedPrologueGender);
    }

    const rewardModalHtml = `
        <div id="prologue-reward-modal" class="fixed inset-0 bg-black flex items-center justify-center z-[120] select-none p-4">
            <div class="bg-slate-900 border-2 border-amber-500 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl space-y-4">
                <h3 class="text-xl font-black text-yellow-300 font-yuji">
                    🎉 プロローグ完了！
                </h3>
                <p class="text-xs text-amber-300 font-bold">初期デッキ（20枚）を手に入れました！</p>
                <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-1 text-xs text-slate-300">
                    <div>・ 主人公カード (JOKER) ✕ 1枚</div>
                    <div>・ 初期ノーマルカード ✕ 19枚</div>
                    <div class="text-[10px] text-amber-400/80 mt-2">※ フリーバトル・デッキ編集・主人公カスタムが利用可能になりました！</div>
                </div>
                <button id="btn-prologue-finish-ok" class="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-slate-950 font-black text-sm border border-amber-300 cursor-pointer shadow-lg">
                    メインメニューへ進む
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', rewardModalHtml);

    document.getElementById('btn-prologue-finish-ok').onclick = () => {
        document.getElementById('prologue-reward-modal')?.remove();
        location.reload();
    };
}

window.addEventListener('DOMContentLoaded', initStoryUI);