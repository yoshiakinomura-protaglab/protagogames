/**
 * settings_ui.js - ⚙️ 設定画面 & モーダルUI（クイズ個別リセット＆全問9周クリアデバッグ完備版）
 */

function initSettingsUI() {
    if (document.getElementById('btn-settings-open')) return;

    const btnHtml = `
        <button id="btn-settings-open" style="
            position: fixed; top: 12px; right: 12px; z-index: 999990;
            width: 38px; height: 38px; border-radius: 50%;
            background: rgba(15, 23, 42, 0.85); border: 1.5px solid #38bdf8;
            color: #38bdf8; font-size: 18px; display: flex;
            align-items: center; justify-content: center;
            cursor: pointer; backdrop-filter: blur(4px);
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        ">⚙️</button>
    `;
    document.body.insertAdjacentHTML('beforeend', btnHtml);
    document.getElementById('btn-settings-open').addEventListener('click', openSettingsModal);
}

function openSettingsModal() {
    if (document.getElementById('settings-modal')) return;

    const currentMode = getAppMode();

    const modalHtml = `
        <div id="settings-modal" style="
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(2, 6, 23, 0.85); backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center;
            font-family: sans-serif; padding: 16px;
        ">
            <div style="
                background: #0f172a; border: 2px solid #38bdf8; border-radius: 16px;
                padding: 20px; max-width: 380px; width: 100%; color: #fff;
                box-shadow: 0 10px 30px rgba(0,0,0,0.8); position: relative;
            ">
                <button id="btn-settings-close" style="
                    position: absolute; top: 12px; right: 12px; background: none;
                    border: none; color: #94a3b8; font-size: 20px; cursor: pointer;
                ">✕</button>

                <h3 style="margin: 0 0 16px 0; color: #38bdf8; font-size: 18px; text-align: center;">⚙️ 設定 / データ管理</h3>

                <!-- 1. 起動モード選択 -->
                <div style="margin-bottom: 16px; background: #1e293b; padding: 12px; border-radius: 10px;">
                    <div style="font-size: 13px; font-weight: bold; color: #f59e0b; margin-bottom: 8px;">🎮 起動モード選択</div>
                    <div style="display: flex; gap: 8px;">
                        <button id="btn-set-normal" style="
                            flex: 1; padding: 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;
                            border: 1px solid #3b82f6; background: ${currentMode === 'NORMAL' ? '#2563eb' : '#0f172a'}; color: #fff;
                        ">通常モード<br/><span style="font-size:9px; opacity:0.8;">(オートセーブ)</span></button>
                        
                        <button id="btn-set-debug" style="
                            flex: 1; padding: 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;
                            border: 1px solid #f59e0b; background: ${currentMode === 'DEBUG_ALL' ? '#d97706' : '#0f172a'}; color: #fff;
                        ">デバッグモード<br/><span style="font-size:9px; opacity:0.8;">(全カード所持)</span></button>
                    </div>
                </div>

                <!-- 2. セーブデータバックアップ -->
                <div style="margin-bottom: 16px; background: #1e293b; padding: 12px; border-radius: 10px;">
                    <div style="font-size: 13px; font-weight: bold; color: #38bdf8; margin-bottom: 8px;">💾 セーブデータバックアップ</div>
                    <div style="display: flex; gap: 8px;">
                        <button id="btn-export-code" style="flex:1; padding:8px; background:#0284c7; color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">コード出力</button>
                        <button id="btn-import-code" style="flex:1; padding:8px; background:#10b981; color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">コード復元</button>
                    </div>
                </div>

                <!-- 3. クイズ（典学）専用デバッグ制御 -->
                <div style="margin-bottom: 16px; background: #1e293b; padding: 12px; border-radius: 10px; border: 1px solid #d97706/50;">
                    <div style="font-size: 13px; font-weight: bold; color: #fbbf24; margin-bottom: 8px;">📜 典学（クイズ）デバッグ設定</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <!-- 通常試練10周・最終試練9周（覚醒直前状態） -->
                        <button id="btn-set-quiz-9loops" style="
                            width: 100%; padding: 8px; background: #78350f; border: 1px solid #f59e0b;
                            color: #fef08a; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;
                        ">⚡ 覚醒直前にセット（通常10周・最終試練9周）<br/><span style="font-size:9px; color:#fde68a;">(次回 最終試練クリアで覚醒演出テスト可能)</span></button>

                        <!-- クイズ履歴のみ初期化 -->
                        <button id="btn-reset-quiz-only" style="
                            width: 100%; padding: 6px; background: none; border: 1px solid #d97706;
                            color: #f59e0b; border-radius: 6px; font-size: 11px; cursor: pointer;
                        ">🔄 クイズ履歴のみ初期化</button>
                    </div>
                </div>

                <!-- 4. 全データ完全初期化 -->
                <div style="text-align: center;">
                    <button id="btn-reset-data" style="
                        background: none; border: 1px solid #ef4444; color: #ef4444;
                        padding: 6px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
                    ">⚠️ 全データを初期化する</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btn-settings-close').addEventListener('click', () => {
        document.getElementById('settings-modal').remove();
    });

    document.getElementById('btn-set-normal').addEventListener('click', () => setAppMode('NORMAL'));
    document.getElementById('btn-set-debug').addEventListener('click', () => setAppMode('DEBUG_ALL'));

    document.getElementById('btn-export-code').addEventListener('click', () => {
        const code = exportSaveData();
        prompt("セーブコード:", code);
    });

    document.getElementById('btn-import-code').addEventListener('click', () => {
        const input = prompt("セーブコードを貼り付けてください:");
        if (input) importSaveData(input.trim());
    });

    // ★ ① クイズ履歴のみリセット
    document.getElementById('btn-reset-quiz-only').addEventListener('click', () => {
        if (confirm("典学（クイズ）の修練記録・進行度のみを初期化しますか？\n（所持カード・デッキ・ストーリー進捗は維持されます）")) {
            localStorage.removeItem('yamato_quiz_progress_v2'); // ★ 追加
            localStorage.removeItem('yamato_quiz_progress');
            localStorage.removeItem('yamato_quiz_progress_v1');

            if (typeof saveQuizProgress === 'function') {
                saveQuizProgress({});
            }

            alert("典学（クイズ）の修練履歴を初期化しました。");
            location.reload();
        }
    });

    // ★ ② 通常試練10周完走 ＆ 最終試練9周（覚醒直前）セット
    document.getElementById('btn-set-quiz-9loops').addEventListener('click', async () => {
        if (confirm("通常試練を10周済（極）、最終試練を9周済（あと1回で覚醒発動）に設定しますか？\n（所持カード等はそのまま維持されます）")) {
            const eras = ['yayoi', 'kofun_asuka', 'nara', 'heian', 'kamakura', 'muromachi', 'sengoku', 'edo', 'bakumatsu'];
            const levels = ['basic', 'normal', 'hard', 'master']; // quiz_master.csv のIDと一致

            let progress = (typeof getQuizProgress === 'function') ? getQuizProgress() : {};

            eras.forEach(era => {
                if (!progress[era]) progress[era] = {};
                levels.forEach(lvl => {
                    progress[era][lvl] = {
                        cleared: true,          // 等級クリア済（次等級アンロック）
                        stagesCleared: 10,       // 全通常試練アンロック＆制覇
                        loops: 10,              // ★ 通常試練：10周完走（カンスト・極）
                        randomCleared: true,    // 最終試練アンロック済
                        randomLoops: 9,         // ★ 最終試練：9周（次回クリアで全試練10周到達）
                        isAwakened: false       // まだ覚醒演出は未発動
                    };
                });
            });

            // v2キーを含めて確実に保存
            if (typeof saveQuizProgress === 'function') {
                saveQuizProgress(progress);
            }
            localStorage.setItem('yamato_quiz_progress_v2', JSON.stringify(progress));
            localStorage.setItem('yamato_quiz_progress', JSON.stringify(progress));

            alert("デバッグ設定を適用しました！\n通常試練：10周済（極）\n最終試練：9周済\n\n【最終試練】を満点クリアすると覚醒演出が発動します。");
            location.reload();
        }
    });

    // 全データ初期化
    document.getElementById('btn-reset-data').addEventListener('click', () => {
        if (confirm("本当に全データを初期化しますか？\n（ストーリー・クイズ修練録・所持カード・デッキ設定がすべて初期状態に戻ります）")) {
            localStorage.removeItem(STORAGE_KEYS.COLLECTION);
            localStorage.removeItem(STORAGE_KEYS.HERO);
            localStorage.removeItem('yamato_story_progress_v1');
            localStorage.removeItem('yamato_縁_saved_decks_v1');
            localStorage.removeItem('yamato_quiz_progress');
            localStorage.removeItem('yamato_quiz_progress_v1');
            localStorage.removeItem('yamato_magatama');
            localStorage.removeItem('user_magatama');

            if (typeof initDefaultCollection === 'function') {
                initDefaultCollection();
            }

            alert("すべてのデータを初期化しました。タイトル画面へ移動します。");
            window.location.href = 'title.html';
        }
    });
}

window.addEventListener('DOMContentLoaded', initSettingsUI);