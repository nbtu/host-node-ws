const http = require('http');
const net = require('net');
const { Buffer } = require('buffer');
const { exec } = require('child_process');
const { WebSocket, createWebSocketStream } = require('ws');

// 核心配置变量
const UUID = process.env.UUID || '00000000-0000-0000-0000-000000000000';
const DOMAIN = process.env.DOMAIN || 'xxx.xxx.xyz';
const AUTO_ACCESS = process.env.AUTO_ACCESS || 'true';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const NAME = process.env.NAME || 'FreeCloud';
const PORT = process.env.PORT || 3000;

// 创建 HTTP 服务
const httpServer = http.createServer((req, res) => {
    // 处理根路径
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('System Running\n');
    }
    // 处理订阅路径
    else if (req.url.toLowerCase() === `/${SUB_PATH.toLowerCase()}`) {
        const nodeName = NAME || 'NodeWS';
        // 这里的地址可以根据需求修改，目前维持原代码的配置
        const vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F#${nodeName}`;
        const base64Content = Buffer.from(vlessURL).toString('base64');

        res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        });
        res.end(base64Content + '\n');
    }
    else {
        res.writeHead(404);
        res.end();
    }
});

// VLESS over WebSocket 实现
const wss = new WebSocket.Server({ server: httpServer });
const uuidHex = UUID.replace(/-/g, "");

wss.on('connection', ws => {
    ws.once('message', msg => {
        const [VERSION] = msg;
        const id = msg.slice(1, 17);

        // 验证 UUID
        if (!id.every((v, i) => v == parseInt(uuidHex.substr(i * 2, 2), 16))) return;

        let i = msg.slice(17, 18).readUInt8() + 19;
        const port = msg.slice(i, i += 2).readUInt16BE(0);
        const ATYP = msg.slice(i, i += 1).readUInt8();

        let host = '';
        if (ATYP == 1) host = msg.slice(i, i += 4).join('.');
        else if (ATYP == 2) host = new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8()));
        else if (ATYP == 3) host = msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':');

        ws.send(new Uint8Array([VERSION, 0]));
        const duplex = createWebSocketStream(ws);

        // 建立 TCP 连接转发数据
        net.connect({ host, port }, function () {
            this.write(msg.slice(i));
            duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { });
    }).on('error', () => { });
});

// 自动保活任务
async function addAccessTask() {
    if (AUTO_ACCESS !== 'true' || !DOMAIN) return;
    try {
        const fullURL = `https://${DOMAIN}`;
        const command = `curl -X POST "https://gifted-steel-cheek.glitch.me/add-url" -H "Content-Type: application/json" -d '{"url": "${fullURL}"}'`;
        exec(command, (error, stdout) => {
            if (!error) console.log('Keep-alive task added:', stdout);
        });
    } catch (error) {
        console.error('Error adding Task:', error.message);
    }
}

// 启动服务器
httpServer.listen(PORT, () => {
    addAccessTask();
    console.log(`Server is running on port ${PORT}`);
    console.log(`Subscription path: /${SUB_PATH}`);
});
