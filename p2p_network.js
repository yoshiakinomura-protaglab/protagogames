/**
 * p2p_network.js - PeerJSを用いたP2P通信管理モジュール (STUN/ICE最適化版)
 */

export class P2PNetwork {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.myPeerId = null;
        this.targetPeerId = null;
        this.isHost = false;
        
        this.onConnectedCallback = null;
        this.onDataReceivedCallback = null;
        this.onDisconnectedCallback = null;
        this.onErrorCallback = null;
    }

async init(customId = null) {
        return new Promise((resolve, reject) => {
            if (typeof Peer === 'undefined') {
                const err = new Error("PeerJSライブラリが読み込まれていません。");
                console.error(err);
                if (this.onErrorCallback) this.onErrorCallback(err);
                return reject(err);
            }

            // ★ STUN標準＋高速ICE接続設定（応答不全TURNを排除）
            const peerOptions = {
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ],
                    sdpSemantics: 'unified-plan'
                }
            };

            this.peer = customId ? new Peer(customId, peerOptions) : new Peer(peerOptions);

            this.peer.on('open', (id) => {
                this.myPeerId = id;
                console.log(`[P2P] Peer初期化完了. My ID: ${id}`);
                this._setupHostIncomingListener();
                resolve(id);
            });

            this.peer.on('error', (err) => {
                console.error('[P2P] Peerエラー:', err);
                if (this.onErrorCallback) this.onErrorCallback(err);
                reject(err);
            });

            this.peer.on('disconnected', () => {
                console.warn('[P2P] シグナリングサーバーから切断されました。再接続を試みます...');
                if (this.peer && !this.peer.destroyed) {
                    this.peer.reconnect();
                }
            });
        });
    }

    _setupHostIncomingListener() {
        if (!this.peer) return;

        this.peer.on('connection', (connection) => {
            if (this.conn && this.conn.open) {
                console.warn('[P2P] 既に他のプレイヤーと接続中のため拒否します');
                connection.close();
                return;
            }

            console.log(`[P2P] Guestからの接続を受信: ${connection.peer}`);
            this.conn = connection;
            this.isHost = true;
            this.targetPeerId = connection.peer;

            // 受信した connection インスタンスへ直接イベントリスナーをセット
            this._setupConnectionEvents(connection);
        });
    }

    async connectToHost(hostPeerId) {
        if (!this.peer) {
            throw new Error('[P2P] init() を先に実行してください。');
        }

        const cleanHostId = String(hostPeerId).trim();
        console.log(`[P2P] Host (${cleanHostId}) へ接続試行中...`);

        this.isHost = false;
        this.targetPeerId = cleanHostId;

        return new Promise((resolve, reject) => {
            const connection = this.peer.connect(cleanHostId, {
                reliable: true,
                serialization: 'json'
            });
            this.conn = connection;

            // イベントハンドラー（データ受信・切断）をセット
            this._setupConnectionEvents(connection);

            // 回線が「完全に開いた」ことを保証してから resolve を呼ぶ
            if (connection.open) {
                console.log("[P2P] 回線は既に開通しています。");
                if (this.onConnectedCallback) this.onConnectedCallback({ isHost: false, targetPeerId: cleanHostId });
                resolve(connection);
            } else {
                connection.once('open', () => {
                    console.log("[P2P] 回線の開通（open）を確実に行いました。");
                    if (this.onConnectedCallback) this.onConnectedCallback({ isHost: false, targetPeerId: cleanHostId });
                    resolve(connection);
                });

                connection.once('error', (err) => {
                    console.error("[P2P] 接続エラーが発生しました:", err);
                    reject(err);
                });
            }
        });
    }
    _setupConnectionEvents(connection = this.conn) {
        if (!connection) return;

        // 通信開通関数
        const handleOpen = () => {
            console.log(`[P2P] P2P直接通信（DataChannel）が確立しました！ 相手: ${this.targetPeerId}`);
            if (this.onConnectedCallback) {
                this.onConnectedCallback({
                    isHost: this.isHost,
                    targetPeerId: this.targetPeerId
                });
            }
        };

        // 既に open 状態の場合（すれ違い防止）
        if (connection.open) {
            handleOpen();
        } else {
            connection.on('open', handleOpen);
        }

        // データ受信
        connection.on('data', (data) => {
            console.log('[P2P] パケット受信:', data);
            if (this.onDataReceivedCallback) {
                this.onDataReceivedCallback(data);
            }
        });

        // 通信切断時
        connection.on('close', () => {
            console.log('[P2P] 相手との接続が切断されました');
            this.conn = null;
            if (this.onDisconnectedCallback) {
                this.onDisconnectedCallback();
            }
        });

        connection.on('error', (err) => {
            console.error('[P2P] 通信エラー:', err);
            if (this.onErrorCallback) this.onErrorCallback(err);
        });
    }

    send(type, payload = {}) {
        if (!this.conn || !this.conn.open) {
            console.warn('[P2P] 接続が確立していないためデータを送信できません');
            return false;
        }

        const packet = {
            type: type,
            senderId: this.myPeerId,
            timestamp: Date.now(),
            payload: payload
        };

        console.log('[P2P] パケット送信:', packet);
        this.conn.send(packet);
        return true;
    }

    disconnect() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.myPeerId = null;
        this.targetPeerId = null;
    }
}
