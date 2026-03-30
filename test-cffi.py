import re
import json
import base64
from curl_cffi import requests

with open('account.txt', 'r') as f:
    cookie_str = f.read().strip()

match0 = re.search(r'sb-[a-z0-9]+-auth-token\.0=base64-([^;]+)', cookie_str)
match1 = re.search(r'sb-[a-z0-9]+-auth-token\.1=([^;]+)', cookie_str)

chunks = []
if match0: chunks.append(match0.group(1))
if match1: chunks.append(match1.group(1))

access_token = ""
if chunks:
    try:
        b64 = "".join(chunks)
        b64 += "=" * ((4 - len(b64) % 4) % 4)
        auth_data = json.loads(base64.b64decode(b64).decode('utf-8'))
        access_token = auth_data.get('access_token', '')
    except Exception as e:
        print("Error parsing token:", e)

headers = {
    'cookie': cookie_str,
    'authorization': f"Bearer {access_token}" if access_token else "",
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'accept': 'application/json'
}

print("Headers ready, sending request to /api/engagement/daily-check...")
try:
    res = requests.post('https://www.cctools.network/api/engagement/daily-check', headers=headers, json={}, impersonate="chrome120")
    print(res.status_code)
    print(res.text[:200])
except Exception as e:
    print(e)
