/**
 * settings_ui.js - ⚙️ 設定画面 & モーダルUI
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

                <div style="margin-bottom: 20px; background: #1e293b; padding: 12px; border-radius: 10px;">
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

                <div style="margin-bottom: 20px; background: #1e293b; padding: 12px; border-radius: 10px;">
                    <div style="font-size: 13px; font-weight: bold; color: #38bdf8; margin-bottom: 8px;">💾 セーブデータバックアップ</div>
                    <div style="display: flex; gap: 8px;">
                        <button id="btn-export-code" style="flex:1; padding:8px; background:#0284c7; color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">コード出力</button>
                        <button id="btn-import-code" style="flex:1; padding:8px; background:#10b981; color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">コード復元</button>
                    </div>
                </div>

                <div style="text-align: center;">
                    <button id="btn-reset-data" style="
                        background: none; border: 1px solid #ef4444; color: #ef4444;
                        padding: 6px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
                    ">⚠️ データを初期化する</button>
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

    document.getElementById('btn-reset-data').addEventListener('click', () => {
        if (confirm("本当にデータを初期化しますか？")) {
            localStorage.removeItem(STORAGE_KEYS.COLLECTION);
            localStorage.removeItem(STORAGE_KEYS.HERO);
            initDefaultCollection();
            alert("初期化しました。");
            location.reload();
        }
    });
}

window.addEventListener('DOMContentLoaded', initSettingsUI);