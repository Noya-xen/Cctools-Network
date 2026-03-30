import requests
import time
import json
import os
from datetime import datetime
from pytz import timezone
from colorama import Fore, Style, init

init(autoreset=True)

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
SCTG_API_KEY    = "whAas2MbGOgDdnKfr0C7MpGJq7ON0Ud9"   # ← Isi API key SCTG kamu
SCTG_SUBMIT_URL = "https://sctg.xyz/in.php"
SCTG_RESULT_URL = "https://sctg.xyz/res.php"

FAUCET_URL      = "https://testnet.fluent.xyz/api/faucet/api/claim"
HCAPTCHA_SITEKEY= "801a69e4-703a-445e-b7b0-6102ffda1080"
PAGE_URL        = "https://testnet.fluent.xyz/dev-portal"

LOOP_INTERVAL   = 24 * 60 * 60   # 24 jam dalam detik
POLL_INTERVAL   = 5               # polling captcha tiap 5 detik
POLL_TIMEOUT    = 180             # max tunggu captcha (detik) - ditingkatkan dari 120
MAX_RETRIES     = 3               # jumlah percobaan ulang jika submit gagal

WIB = timezone('Asia/Jakarta')

# ─────────────────────────────────────────────
#  UTILS
# ─────────────────────────────────────────────
def wib_now() -> str:
    return datetime.now(WIB).strftime("%d/%m/%y %H:%M:%S WIB")

def log(level: str, wallet: str, msg: str):
    colors = {
        "OK":   Fore.GREEN,
        "ERR":  Fore.RED,
        "WARN": Fore.YELLOW,
        "INFO": Fore.CYAN,
        "WAIT": Fore.MAGENTA,
    }
    c = colors.get(level, Fore.WHITE)
    short = wallet[:8] + "..." + wallet[-4:] if len(wallet) > 14 else wallet
    print(f"{Fore.WHITE}[ {wib_now()} ] {c}[{level}]{Style.RESET_ALL} {short} | {msg}")

def sleep_countdown(seconds: int, label: str = "Cooldown"):
    """Countdown sleep dengan tampilan menit."""
    print(f"\n{Fore.YELLOW}  ⏳ {label}: {seconds // 3600}j {(seconds % 3600) // 60}m{Style.RESET_ALL}")
    time.sleep(seconds)

def load_accounts(path: str = "accounts.txt") -> list[str]:
    """Load wallet addresses dari accounts.txt (satu address per baris)."""
    if not os.path.exists(path):
        print(f"{Fore.RED}[!] File '{path}' tidak ditemukan!{Style.RESET_ALL}")
        return []
    lines = open(path).read().strip().splitlines()
    addrs = [l.strip() for l in lines if l.strip() and not l.startswith("#")]
    return addrs

def load_proxies(path: str = "proxies.txt") -> list[str]:
    """Load proxies (optional). Return list kosong jika tidak ada file."""
    if not os.path.exists(path):
        return []
    lines = open(path).read().strip().splitlines()
    return [l.strip() for l in lines if l.strip()]

def get_proxy_dict(proxy_str: str | None) -> dict | None:
    if not proxy_str:
        return None
    return {"http": proxy_str, "https": proxy_str}

# ─────────────────────────────────────────────
#  SCTG CAPTCHA SOLVER
# ─────────────────────────────────────────────
def solve_hcaptcha(proxy: str | None = None) -> str | None:
    """
    Submit hCaptcha ke SCTG dan poll sampai dapat token.
    Dengan retry logic untuk stabilitas lebih baik.
    """
    # Step 1 — Submit task (dengan retry)
    task_id = None
    for attempt in range(MAX_RETRIES):
        params = {
            "key":     SCTG_API_KEY,
            "method":  "hcaptcha",
            "sitekey": HCAPTCHA_SITEKEY,
            "pageurl": PAGE_URL,
            "json":    0,
        }
        try:
            # PENTING: Jangan gunakan proxy untuk panggil API Solver (SCTG)
            # Karena SCTG butuh koneksi stabil dari server, bukan dari proxy luar.
            resp = requests.post(
                SCTG_SUBMIT_URL,
                data=params,
                timeout=30
            )
            body = resp.text.strip()
            if body.startswith("OK|"):
                task_id = body.split("|")[1]
                break
            else:
                log("WARN", "CAPTCHA", f"Submit attempt {attempt+1} failed: {body}")
                if "ERROR_NO_SLOT" in body or "ERROR_ZERO_BALANCE" in body:
                    # Jika tidak ada slot atau saldo habis, tunggu sebentar lalu retry
                    # Ditambahkan delay bertahap agar tidak kena rate limit solver
                    wait_time = 15 + (attempt * 10)
                    time.sleep(wait_time)
                else:
                    time.sleep(5)
        except Exception as e:
            log("WARN", "CAPTCHA", f"Submit attempt {attempt+1} exception: {e}")
            time.sleep(5)

    if not task_id:
        log("ERR", "CAPTCHA", f"Gagal submit task setelah {MAX_RETRIES} percobaan.")
        return None

    log("INFO", "CAPTCHA", f"Task ID: {task_id} — menunggu solver...")

    # Step 2 — Poll result
    elapsed = 0
    while elapsed < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        try:
            # Poll juga tanpa proxy
            res = requests.get(
                SCTG_RESULT_URL,
                params={"key": SCTG_API_KEY, "action": "get", "id": task_id},
                timeout=30
            )
            result = res.text.strip()
        except Exception as e:
            log("WARN", "CAPTCHA", f"Poll error (retrying): {e}")
            continue

        if result == "CAPCHA_NOT_READY":
            print(f"{Fore.MAGENTA}  [CAPTCHA] Masih diproses... ({elapsed}s){Style.RESET_ALL}", end="\r")
            continue

        if result.startswith("OK|"):
            token = result.split("|", 1)[1]
            log("OK", "CAPTCHA", "Token diterima ✓")
            return token

        if "ERROR_CAPTCHA_UNSOLVABLE" in result:
            log("ERR", "CAPTCHA", "Solver menyerah (unsolvable).")
            return None

        # Error lain dari SCTG
        log("ERR", "CAPTCHA", f"Error solver: {result}")
        return None

    log("ERR", "CAPTCHA", f"Timeout setelah {POLL_TIMEOUT}s")
    return None

# ─────────────────────────────────────────────
#  FAUCET CLAIM
# ─────────────────────────────────────────────
def claim_faucet(wallet: str, proxy: str | None = None) -> bool:
    """
    Claim faucet Fluent Testnet untuk satu wallet.
    Return: True jika sukses, False jika gagal.
    """
    log("WAIT", wallet, "Memulai solve captcha...")
    hcaptcha_token = solve_hcaptcha(proxy)

    if not hcaptcha_token:
        log("ERR", wallet, "Captcha gagal — skip akun ini")
        return False

    headers = {
        "Accept":             "application/json, text/plain, */*",
        "Accept-Language":    "en-US,en;q=0.9,id;q=0.8",
        "Content-Type":       "application/json",
        "h-captcha-response": hcaptcha_token,
        "Origin":             "https://testnet.fluent.xyz",
        "Referer":            PAGE_URL,
        "Sec-Ch-Ua":          '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        "Sec-Ch-Ua-Mobile":   "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest":     "empty",
        "Sec-Fetch-Mode":     "cors",
        "Sec-Fetch-Site":     "same-origin",
        "User-Agent":         (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/133.0.0.0 Safari/537.36"
        ),
    }
    payload = {"address": wallet}
    params  = {"env": "testnet"}

    try:
        resp = requests.post(
            FAUCET_URL,
            headers=headers,
            json=payload,
            params=params,
            proxies=get_proxy_dict(proxy),
            timeout=30
        )

        if resp.status_code == 200:
            data = resp.json()
            log("OK", wallet, f"✅ Faucet claimed! Resp: {json.dumps(data)}")
            return True

        elif resp.status_code == 429:
            try:
                msg = resp.json().get("message", resp.text)
            except Exception:
                msg = resp.text
            log("WARN", wallet, f"⏱️  Rate limited — {msg}")
            return False

        else:
            try:
                error_body = resp.json()
                error_msg = error_body.get("message", resp.text)
            except Exception:
                error_msg = resp.text
            log("ERR", wallet, f"❌ HTTP {resp.status_code} — {error_msg[:150]}")
            return False

    except requests.exceptions.RequestException as e:
        log("ERR", wallet, f"Request exception: {e}")
        return False

# ─────────────────────────────────────────────
#  CREDIT WATERMARK (WAJIB)
# ─────────────────────────────────────────────
def printCredit():
    purple = "\033[38;5;135m"
    blue   = "\033[38;5;69m"
    reset  = "\033[0m"
    print(f"""
{purple}╔══════════════════════════════════════════╗
║       Fluent Testnet Faucet Bot          ║
║  {blue}github.com/Noya-xen{purple}  |  @xinomixo       ║
╚══════════════════════════════════════════╝{reset}
""")

# ─────────────────────────────────────────────
#  MAIN LOOP
# ─────────────────────────────────────────────
def main():
    printCredit()

    accounts = load_accounts("accounts.txt")
    proxies  = load_proxies("proxies.txt")

    if not accounts:
        print(f"{Fore.RED}[!] Tidak ada akun di accounts.txt. Keluar.{Style.RESET_ALL}")
        return

    print(f"{Fore.CYAN}[i] Loaded {len(accounts)} wallet | {len(proxies) or 'NO'} proxy{Style.RESET_ALL}\n")

    cycle = 0
    while True:
        cycle += 1
        print(f"\n{Fore.CYAN}{'═'*50}")
        print(f"  SIKLUS #{cycle} — {wib_now()}")
        print(f"{'═'*50}{Style.RESET_ALL}\n")

        ok_count   = 0
        fail_count = 0

        for i, wallet in enumerate(accounts):
            proxy = proxies[i % len(proxies)] if proxies else None
            proxy_tag = proxy.split("@")[-1] if proxy else "no proxy"
            print(f"\n{Fore.BLUE}[{i+1}/{len(accounts)}] Wallet: {wallet}{Style.RESET_ALL}")
            print(f"  Proxy: {proxy_tag}")

            success = claim_faucet(wallet, proxy)
            if success:
                ok_count += 1
            else:
                fail_count += 1

            # Jeda antar akun (manusiawi)
            if i < len(accounts) - 1:
                time.sleep(3)

        print(f"\n{Fore.GREEN}[✓] Siklus #{cycle} selesai — OK: {ok_count} | Gagal: {fail_count}{Style.RESET_ALL}")
        sleep_countdown(LOOP_INTERVAL, "Cooldown 24 jam")

if __name__ == "__main__":
    main()
