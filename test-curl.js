const { execSync } = require('child_process');
const fs = require('fs');

const cookieStr = fs.readFileSync('account.txt', 'utf8').trim();

const p = execSync(`curl -s -i "https://www.cctools.network/api/engagement/daily-check" -X POST -H "cookie: ${cookieStr}" -H "user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -H "accept: application/json" -H "content-type: application/json" -d "{}"`);
console.log(p.toString());
