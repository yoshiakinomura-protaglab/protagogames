class P2PNetwork {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.currentRoomId = null;
        this.connectedPlayers = 0; // 接続人数カウント
        this.onMessageCallback = null;
        this.onConnectedCallback = null;

        // 無料の公認PeerJSサーバー設定（STUN付き）
        this.peerOptions = {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        };
    }

    // イベントリスナーの登録
    onMessage(callback) { this.onMessageCallback = callback; }
    onConnected(callback) { this.onConnectedCallback = callback; }

    // データ送信
    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        }
    }

    // 部屋に入る（ホストまたは参加者として自動接続）
    enterRoom(roomNumber) {
        this.currentRoomId = `yamato-card-room-${roomNumber}`;
        
        // まず自分がホストとして部屋作成を試みる
        this.peer = new Peer(this.currentRoomId, this.peerOptions);

        this.peer.on('open', (id) => {
            console.log(`[P2P] 部屋${roomNumber}のホストとして待機を開始しました`);
            this.isHost = true;
            this.connectedPlayers = 0;

            // 参加者の接続を待受
            this.peer.on('connection', (conn) => {
                // 簡易ステータスチェック問い合わせへの応答処理
                conn.on('data', (data) => {
                    if (data && data.type === 'CHECK_STATUS') {
                        if (this.connectedPlayers >= 1) {
                            conn.send({ type: 'STATUS_FULL' });
                        } else {
                            conn.send({ type: 'STATUS_WAITING' });
                        }
                        setTimeout(() => conn.close(), 300);
                        return;
                    }

                    // 通常のゲームデータ受信
                    if (this.onMessageCallback) {
                        this.onMessageCallback(data);
                    }
                });

                // すでに満員（対戦中）の場合、3人目は拒否する
                if (this.connectedPlayers >= 1) {
                    console.warn('[P2P] 満員のため接続を拒否しました');
                    setTimeout(() => conn.close(), 500);
                    return;
                }

                // 正式な対戦相手として接続確立
                this.conn = conn;
                this.connectedPlayers = 1;
                this._setupConnectionEvents();
                if (this.onConnectedCallback) this.onConnectedCallback(true);
            });
        });

        // すでにホストが存在する場合（自分は2人目として参加）
        this.peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                console.log(`[P2P] 部屋${roomNumber}にホストが存在します。参加者として接続します...`);
                this.isHost = false;

                // ランダムIDで一時的なPeerを作成してホストへ接続
                this.peer = new Peer(this.peerOptions);
                this.peer.on('open', () => {
                    this.conn = this.peer.connect(this.currentRoomId, { reliable: true });
                    this._setupConnectionEvents();
                });
            } else {
                console.error('[P2P] Peerエラー:', err);
            }
        });
    }

    // 通信イベントの設定
    _setupConnectionEvents() {
        this.conn.on('open', () => {
            console.log('[P2P] 対戦相手との接続が確立しました！');
            if (this.onConnectedCallback) this.onConnectedCallback(this.isHost);
        });

        this.conn.on('data', (data) => {
            if (data.type === 'STATUS_WAITING' || data.type === 'STATUS_FULL') return;
            if (this.onMessageCallback) this.onMessageCallback(data);
        });

        this.conn.on('close', () => {
            alert('対戦相手との接続が切断されました。');
            location.reload();
        });
    }

    // 単一の部屋の状態（空き/待機中/対戦中）を一時接続で判定する
    static checkRoomStatus(roomNumber) {
        return new Promise((resolve) => {
            const roomId = `yamato-card-room-${roomNumber}`;
            const tempPeer = new Peer(null, {
                host: '0.peerjs.com', port: 443, path: '/', secure: true
            });

            let isResolved = false;
            const timer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    tempPeer.destroy();
                    resolve('EMPTY'); // タイムアウト時は空き扱い
                }
            }, 2000);

            tempPeer.on('open', () => {
                const conn = tempPeer.connect(roomId, { reliable: true });

                conn.on('open', () => {
                    // ステータス確認要求を送信
                    conn.send({ type: 'CHECK_STATUS' });

                    conn.on('data', (data) => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timer);
                            if (data.type === 'STATUS_FULL') resolve('FULL');
                            else if (data.type === 'STATUS_WAITING') resolve('WAITING');
                            else resolve('EMPTY');
                            tempPeer.destroy();
                        }
                    });
                });

                tempPeer.on('error', () => {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timer);
                        resolve('EMPTY'); // ホストが不在＝空き部屋
                        tempPeer.destroy();
                    }
                });
            });
        });
    }
}

// グローバルインスタンス化
const p2p = new P2PNetwork();
