/* 
 * CCTools Network Auto Bot
 * Architecture: SCTG Turnstile Solver + Proxy Support
 * Tasks:
 * 1. Daily Check-in
 * 2. Fetch All Projects (via Supabase)
 * 3. Vote Random Projects (Upvote)
 */

const fs = require('fs');
const axios = require('axios');

// ─────────────────────────────────────────────
//  CONSOLE COLORS
// ─────────────────────────────────────────────
const c = {
    green:   (t) => `\x1b[32m${t}\x1b[0m`,
    red:     (t) => `\x1b[31m${t}\x1b[0m`,
    yellow:  (t) => `\x1b[33m${t}\x1b[0m`,
    blue:    (t) => `\x1b[34m${t}\x1b[0m`,
    cyan:    (t) => `\x1b[36m${t}\x1b[0m`,
    magenta: (t) => `\x1b[35m${t}\x1b[0m`,
    white:   (t) => `\x1b[37m${t}\x1b[0m`,
};

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const BASE_URL         = 'https://www.cctools.network';
const SUPABASE_URL     = 'https://zxazrkpnwlcaeqnquiqx.supabase.co';
const SUPABASE_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4YXpya3Bud2xjYWVxbnF1aXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NTczMzYsImV4cCI6MjA4OTUzMzMzNn0.JqqMvMb4y3z-Vhnu-HCa9Q79E_1NY0f3gDROnYc-F5c';

// SCTG Cloudflare Turnstile Solver Config
const SCTG_API_KEY      = '';   // ← API key SCTG kamu
const SCTG_SUBMIT_URL   = 'https://sctg.xyz/in.php';
const SCTG_RESULT_URL   = 'https://sctg.xyz/res.php';
const TURNSTILE_SITEKEY = '0x4AAAAAACxEKUX_mLIaTMBc';
const PAGE_URL          = 'https://www.cctools.network';

const POLL_INTERVAL = 5;      // polling captcha tiap 5 detik
const POLL_TIMEOUT  = 180;    // max tunggu captcha (detik)
const MAX_RETRIES   = 3;      // jumlah percobaan ulang
const LOOP_INTERVAL = 24 * 60 * 60 * 1000; // 24 jam

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const wibNow = () => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

function printBanner() {
    console.log(c.cyan(`
╔══════════════════════════════════════════╗
║       CCTools Network Auto Bot           ║
║  🛡️  SCTG Turnstile Solver + Proxy      ║
╚══════════════════════════════════════════╝
`));
}

// ─────────────────────────────────────────────
//  FILE LOADERS
// ─────────────────────────────────────────────
function readAccounts() {
    try {
        if (!fs.existsSync('account.txt')) {
            console.log(c.red(`[✗] File account.txt tidak ditemukan!`));
            return [];
        }
        const data = fs.readFileSync('account.txt', 'utf8');
        const validLines = data.split('\n').map(line => line.trim()).filter(line => line.length > 50);
        
        return validLines.map(cookieStr => {
            let accessToken = "";
            const match0 = cookieStr.match(/sb-[a-z0-9]+-auth-token\.0=base64-([^;]+)/);
            const match1 = cookieStr.match(/sb-[a-z0-9]+-auth-token\.1=([^;]+)/);
            
            let chunks = [];
            if (match0) chunks.push(match0[1]);
            if (match1) chunks.push(match1[1]);
            
            if (chunks.length > 0) {
                try {
                    const base64Str = chunks.join('');
                    const authData = JSON.parse(Buffer.from(base64Str, 'base64').toString('utf8'));
                    accessToken = authData.access_token || "";
                } catch (e) {}
            }
            return { raw: cookieStr, accessToken };
        });
    } catch (err) {
        console.log(c.red(`[✗] Gagal membaca account.txt: ${err.message}`));
        return [];
    }
}

function loadProxies() {
    const path = 'proxies.txt';
    if (!fs.existsSync(path)) return [];
    const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
    return lines.map(l => l.trim()).filter(l => l.length > 0);
}

function getProxyConfig(proxyStr) {
    if (!proxyStr) return {};
    // Mendukung format: http://user:pass@host:port
    try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const agent = new HttpsProxyAgent(proxyStr, {
            rejectUnauthorized: false // Bypassing SSL cert mismatch usually caused by proxies
        });
        return { 
            httpAgent: agent, 
            httpsAgent: agent,
            proxy: false // disable axios default proxy, use agent
        };
    } catch (e) {
        console.log(c.yellow(`  [!] Gagal inisiasi proxy agent: ${e.message}`));
        return {};
    }
}

// ─────────────────────────────────────────────
//  SCTG CLOUDFLARE TURNSTILE SOLVER
// ─────────────────────────────────────────────
async function solveTurnstile(proxyStr = null) {
    console.log(c.magenta(`  [CAPTCHA] Mengirim task Turnstile ke SCTG...`));
    
    let taskId = null;
    
    // Step 1: Submit task (dengan retry)
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const params = new URLSearchParams({
                key:     SCTG_API_KEY,
                method:  'turnstile',
                sitekey: TURNSTILE_SITEKEY,
                pageurl: PAGE_URL,
                json:    '0',
            });

            // Jangan gunakan proxy untuk panggil API Solver (SCTG)
            const resp = await axios.post(SCTG_SUBMIT_URL, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 30000
            });
            
            const body = resp.data.trim();
            if (body.startsWith('OK|')) {
                taskId = body.split('|')[1];
                break;
            } else {
                console.log(c.yellow(`  [CAPTCHA] Submit attempt ${attempt + 1} gagal: ${body}`));
                if (body.includes('ERROR_NO_SLOT') || body.includes('ERROR_ZERO_BALANCE')) {
                    const waitTime = 15 + (attempt * 10);
                    await sleep(waitTime * 1000);
                } else {
                    await sleep(5000);
                }
            }
        } catch (e) {
            console.log(c.yellow(`  [CAPTCHA] Submit attempt ${attempt + 1} exception: ${e.message}`));
            await sleep(5000);
        }
    }
    
    if (!taskId) {
        console.log(c.red(`  [CAPTCHA] Gagal submit task setelah ${MAX_RETRIES} percobaan.`));
        return null;
    }
    
    console.log(c.magenta(`  [CAPTCHA] Task ID: ${taskId} — menunggu solver...`));
    
    // Step 2: Poll result
    let elapsed = 0;
    while (elapsed < POLL_TIMEOUT) {
        await sleep(POLL_INTERVAL * 1000);
        elapsed += POLL_INTERVAL;
        
        try {
            const res = await axios.get(SCTG_RESULT_URL, {
                params: { key: SCTG_API_KEY, action: 'get', id: taskId },
                timeout: 30000
            });
            const result = res.data.trim();
            
            if (result === 'CAPCHA_NOT_READY') {
                process.stdout.write(c.magenta(`  [CAPTCHA] Masih diproses... (${elapsed}s)       \r`));
                continue;
            }
            
            if (result.startsWith('OK|')) {
                const token = result.split('|').slice(1).join('|');
                console.log(c.green(`  [CAPTCHA] Token Turnstile diterima ✓`));
                return token;
            }
            
            if (result.includes('ERROR_CAPTCHA_UNSOLVABLE')) {
                console.log(c.red(`  [CAPTCHA] Solver menyerah (unsolvable).`));
                return null;
            }
            
            console.log(c.red(`  [CAPTCHA] Error solver: ${result}`));
            return null;
        } catch (e) {
            console.log(c.yellow(`  [CAPTCHA] Poll error (retrying): ${e.message}`));
            continue;
        }
    }
    
    console.log(c.red(`  [CAPTCHA] Timeout setelah ${POLL_TIMEOUT}s`));
    return null;
}

// ─────────────────────────────────────────────
//  GET CF_CLEARANCE via Turnstile Token
// ─────────────────────────────────────────────
async function getCfClearance(turnstileToken, cookieStr, proxyStr = null) {
    const proxyConfig = getProxyConfig(proxyStr);
    
    try {
        const resp = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': cookieStr,
                'cf-turnstile-response': turnstileToken // Include the solved token
            },
            ...proxyConfig,
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: () => true, // Accept all status codes
        });
        
        // Extract cf_clearance from set-cookie headers
        const setCookies = resp.headers['set-cookie'] || [];
        let cfClearance = null;
        for (const sc of setCookies) {
            if (sc.includes('cf_clearance=')) {
                cfClearance = sc.match(/cf_clearance=([^;]+)/)?.[1];
                break;
            }
        }
        
        return { status: resp.status, cfClearance, setCookies };
    } catch (e) {
        return { status: 0, cfClearance: null, error: e.message };
    }
}

// ─────────────────────────────────────────────
//  BUILD HEADERS (shared for all API calls)
// ─────────────────────────────────────────────
function buildHeaders(cookieStr, accessToken, referer = `${BASE_URL}/portfolio`, turnstileToken = null) {
    const headers = {
        'Accept':             'application/json, text/plain, */*',
        'Accept-Language':    'en-US,en;q=0.9,id;q=0.8',
        'Content-Type':       'application/json',
        'Origin':             BASE_URL,
        'Referer':            referer,
        'Sec-Ch-Ua':          '"Chromium";v="133", "Google Chrome";v="133", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile':   '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest':     'empty',
        'Sec-Fetch-Mode':     'cors',
        'Sec-Fetch-Site':     'same-origin',
        'User-Agent':         USER_AGENT,
        'Cookie':             cookieStr,
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    if (turnstileToken) headers['cf-turnstile-response'] = turnstileToken;
    return headers;
}

// ─────────────────────────────────────────────
//  FETCH ALL PROJECTS (Supabase — no CF protection)
// ─────────────────────────────────────────────
async function fetchAllProjects() {
    try {
        console.log(c.blue(`\n[*] Mengambil data project TERATAS dari Supabase API...`));
        // Mengambil project dengan upvote terbanyak
        const res = await axios.get(`${SUPABASE_URL}/rest/v1/projects?select=slug&order=upvotes.desc&limit=50`, {
            headers: {
                'apikey': SUPABASE_API_KEY,
                'authorization': `Bearer ${SUPABASE_API_KEY}`,
                'accept': 'application/json'
            }
        });
        
        if (res.status === 200 && Array.isArray(res.data)) {
            const slugs = res.data.map(p => p.slug).filter(Boolean);
            console.log(c.green(`[✓] Berhasil menemukan ${slugs.length} project teratas! 🚀`));
            return slugs;
        }
    } catch (err) {
        console.log(c.yellow(`[!] Gagal mengambil project via upvotes: ${err.message}. Menggunakan fallback...`));
        try {
            const res = await axios.get(`${SUPABASE_URL}/rest/v1/projects?select=slug&limit=50`, {
                headers: { 'apikey': SUPABASE_API_KEY, 'authorization': `Bearer ${SUPABASE_API_KEY}` }
            });
            if (res.data) return res.data.map(p => p.slug);
        } catch (e) {}
    }
    return ["cctools", "send", "cantex", "hecto"];
}

// ─────────────────────────────────────────────
//  API ACTIONS
// ─────────────────────────────────────────────
async function performCheckIn(cookieStr, accessToken, proxyStr = null, turnstileToken = null) {
    const headers = buildHeaders(cookieStr, accessToken, `${BASE_URL}/portfolio`, turnstileToken);
    const proxyConfig = getProxyConfig(proxyStr);
    
    try {
        const res = await axios.post(`${BASE_URL}/api/engagement/daily-check`, {}, {
            headers,
            ...proxyConfig,
            timeout: 30000,
            validateStatus: () => true,
        });
        
        if (res.status === 200 && res.data) {
            console.log(c.green(`    [✓] Check-in sukses | XP Didapat: ${res.data.xp_earned} | Total XP: ${res.data.total_xp} | Streak: ${res.data.streak}`));
            return true;
        } else if (res.status === 400) {
            const msg = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data).substring(0, 100);
            console.log(c.yellow(`    [-] Sudah check-in hari ini atau bad request: ${msg}`));
            return false;
        } else {
            const body = typeof res.data === 'string' ? res.data.substring(0, 80) : JSON.stringify(res.data).substring(0, 80);
            console.log(c.red(`    [✗] Check-in gagal | HTTP ${res.status} | ${body}`));
            return false;
        }
    } catch (err) {
        console.log(c.red(`    [✗] Check-in error: ${err.message}`));
        return false;
    }
}

async function voteProject(cookieStr, accessToken, slug, proxyStr = null, turnstileToken = null) {
    const headers = buildHeaders(cookieStr, accessToken, `${BASE_URL}/ecosystem/${slug}`, turnstileToken);
    const proxyConfig = getProxyConfig(proxyStr);
    
    try {
        const res = await axios.post(`${BASE_URL}/api/ecosystem/upvotes`, { slug }, {
            headers,
            ...proxyConfig,
            timeout: 30000,
            validateStatus: () => true,
        });
        
        if (res.status === 200 && res.data) {
            const count = res.data.count ? `(Total: ${res.data.count})` : '';
            const liked = res.data.liked ? '❤️' : '';
            console.log(c.green(`    [✓] Sukses vote: ${slug} ${count} ${liked}`));
            return true;
        } else if (res.status === 400) {
            console.log(c.yellow(`    [-] ${slug}: Limit upvote tercapai.`));
            return false;
        } else {
            const body = typeof res.data === 'string' ? res.data.substring(0, 60) : JSON.stringify(res.data).substring(0, 60);
            console.log(c.red(`    [✗] Gagal vote ${slug} | HTTP ${res.status} | ${body}`));
            return false;
        }
    } catch (err) {
        console.log(c.red(`    [✗] Vote error ${slug}: ${err.message}`));
        return false;
    }
}

// ─────────────────────────────────────────────
//  UPDATE COOKIE STRING (replace cf_clearance)
// ─────────────────────────────────────────────
function updateCfClearance(cookieStr, newCfClearance) {
    if (!newCfClearance) return cookieStr;
    
    // Replace existing cf_clearance
    if (cookieStr.includes('cf_clearance=')) {
        return cookieStr.replace(/cf_clearance=[^;]+/, `cf_clearance=${newCfClearance}`);
    }
    // Append cf_clearance
    return `cf_clearance=${newCfClearance}; ${cookieStr}`;
}

// ─────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────
async function main() {
    printBanner();
    
    const proxies = loadProxies();
    console.log(c.cyan(`[i] Loaded ${proxies.length || 'NO'} proxy\n`));
    
    let cycle = 0;
    while (true) {
        cycle++;
        const accounts = readAccounts();
        if (accounts.length === 0) {
            console.log(c.red(`[!] Tidak ada akun valid di account.txt. Bot berhenti.`));
            break;
        }

        const topProjectSlugs = await fetchAllProjects();

        console.log(c.cyan(`\n${'═'.repeat(50)}`));
        console.log(c.cyan(`  SIKLUS #${cycle} — ${wibNow()}`));
        console.log(c.cyan(`${'═'.repeat(50)}\n`));
        
        let okCount = 0;
        let failCount = 0;

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
            const proxyTag = proxy ? proxy.split('@').pop() : 'no proxy';
            
            console.log(c.blue(`\n[${i + 1}/${accounts.length}] Akun #${i + 1}`));
            console.log(c.white(`  Proxy: ${proxyTag}`));
            
            // Step 1: Solve Cloudflare Turnstile via SCTG
            console.log(c.blue(`  [*] Memulai solve Cloudflare Turnstile...`));
            const turnstileToken = await solveTurnstile(proxy);
            
            if (!turnstileToken) {
                console.log(c.red(`  [✗] Gagal solve Turnstile — skip akun ini`));
                failCount++;
                continue;
            }
            
            // Step 2: Coba akses halaman utama untuk mendapatkan cf_clearance baru
            let updatedCookie = account.raw;
            const cfResult = await getCfClearance(turnstileToken, account.raw, proxy);
            if (cfResult.cfClearance) {
                console.log(c.green(`  [✓] cf_clearance baru diperoleh!`));
                updatedCookie = updateCfClearance(updatedCookie, cfResult.cfClearance);
            } else {
                console.log(c.yellow(`  [~] Tidak ada cf_clearance baru, menggunakan cookie lama...`));
            }
            
            await sleep(randomDelay(1000, 3000));
            
            // Step 3: Daily Check-in
            console.log(c.blue(`  [*] Memulai Daily Check-in...`));
            const checkInOk = await performCheckIn(updatedCookie, account.accessToken, proxy, turnstileToken);
            
            await sleep(randomDelay(2000, 5000));
            
            // Step 4: Voting (Top Projects)
            console.log(c.blue(`  [*] Mengeksekusi Voting pada Project Teratas...`));
            
            // Ambil 3-6 project teratas (sequential atau dengan sedikit acak di dalam top pool)
            const numVotes = Math.floor(Math.random() * 4) + 3; // 3 to 6
            const selectedSlugs = topProjectSlugs.slice(0, numVotes);
            
            console.log(`    Merencanakan vote untuk ${numVotes} project teratas...`);
            let voteOkCount = 0;
            for (const slug of selectedSlugs) {
                const voteOk = await voteProject(updatedCookie, account.accessToken, slug, proxy, turnstileToken);
                if (voteOk) voteOkCount++;
                await sleep(randomDelay(3000, 7000));
            }
            
            if (checkInOk || voteOkCount > 0) {
                okCount++;
            } else {
                failCount++;
            }

            if (i < accounts.length - 1) {
                const waitSec = randomDelay(5, 10);
                console.log(c.yellow(`\n  ⏳ Menunggu ${waitSec} detik sebelum akun berikutnya...`));
                await sleep(waitSec * 1000);
            }
        }
        
        console.log(c.green(`\n[✓] Siklus #${cycle} selesai — OK: ${okCount} | Gagal: ${failCount}`));
        
        const hours = LOOP_INTERVAL / 3600000;
        console.log(c.yellow(`\n  ⏳ Cooldown ${hours} jam...`));
        await sleep(LOOP_INTERVAL);
    }
}

main();
