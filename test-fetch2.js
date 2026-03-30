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

fetch('https://www.cctools.network/api/engagement/daily-check', {
    method: 'POST',
    headers: {
        'cookie': cookieStr,
        'authorization': accessToken ? `Bearer ${accessToken}` : '',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
        'content-type': 'application/json',
        'accept': '*/*'
    },
    body: JSON.stringify({})
}).then(async res => {
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text.substring(0, 100));
}).catch(console.error);
