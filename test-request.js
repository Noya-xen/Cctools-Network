const axios = require('axios');
const fs = require('fs');

const cookieStr = fs.readFileSync('account.txt', 'utf8').trim();
const match0 = cookieStr.match(/sb-[a-z0-9]+-auth-token\.0=base64-([^;]+)/);
const match1 = cookieStr.match(/sb-[a-z0-9]+-auth-token\.1=([^;]+)/);

let chunks = [];
if (match0) chunks.push(match0[1]);
if (match1) chunks.push(match1[1]);
let accessToken = "";
if (chunks.length > 0) {
    const base64Str = chunks.join('');
    try {
        const authData = JSON.parse(Buffer.from(base64Str, 'base64').toString('utf8'));
        accessToken = authData.access_token;
    }catch(e){}
}

axios.post('https://www.cctools.network/api/engagement/daily-check', {}, {
    headers: {
        'cookie': cookieStr,
        'authorization': accessToken ? `Bearer ${accessToken}` : '',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'content-type': 'application/json',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'origin': 'https://www.cctools.network',
        'referer': 'https://www.cctools.network/portfolio'
    }
}).then(res => console.log("SUCCESS:", res.data)).catch(err => {
    console.error("FAILED. Status:", err.response ? err.response.status : err.message);
    if(err.response && typeof err.response.data === 'string') {
        console.error("Response starts with:", err.response.data.substring(0, 100));
    } else if (err.response) {
        console.error("Response data:", err.response.data);
    }
});
