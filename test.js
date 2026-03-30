const fs = require('fs');
const cookieStr = fs.readFileSync('account.txt', 'utf8').trim();
const match0 = cookieStr.match(/sb-[a-z0-9]+-auth-token\.0=base64-([^;]+)/);
const match1 = cookieStr.match(/sb-[a-z0-9]+-auth-token\.1=([^;]+)/);

let chunks = [];
if (match0) chunks.push(match0[1]);
if (match1) chunks.push(match1[1]);

if (chunks.length > 0) {
    const base64Str = chunks.join('');
    try {
        const decoded = Buffer.from(base64Str, 'base64').toString('utf8');
        const authData = JSON.parse(decoded);
        console.log("Access Token Found:", authData.access_token.substring(0, 50) + "...");
    } catch (e) {
        console.error("Failed to parse:", e);
    }
} else {
    console.log("No auth token chunks found");
}
