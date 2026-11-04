import os
import sys
import json
import struct
import re
import time
import imaplib
import email
from email.header import decode_header

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host_debug.log")

def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"[{timestamp}] {msg}\n")
    except Exception:
        pass

def load_env(env_path):
    env = {}
    if not os.path.exists(env_path):
        return env
    with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                env[k] = v
    return env

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.env")

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    message_length = struct.unpack('<I', raw_length)[0]
    raw_message = sys.stdin.buffer.read(message_length)
    if len(raw_message) < message_length:
        return None
    return json.loads(raw_message.decode('utf-8'))

def send_message(message):
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

import difflib

def normalize_text(text):
    if not text:
        return ""
    text = text.lower()
    # Normalize common British/American spelling differences
    text = text.replace("favourite", "favorite").replace("colour", "color")
    # Remove filler question words to focus on the semantic keywords
    stop_words = {"what", "is", "the", "your", "name", "of", "in", "which", "where", "were", "you"}
    words = [w for w in re.sub(r'[^a-z0-9\s]', '', text).split() if w not in stop_words]
    return " ".join(words)

def answer_question(question, env):
    q_norm = normalize_text(question)
    log(f"Received question to answer: '{question}' (normalized keywords: '{q_norm}')")

    pairs = []
    for i in range(1, 10):
        q = env.get(f"SECURITY_Q{i}", "")
        a = env.get(f"SECURITY_A{i}", "")
        if q and a:
            pairs.append((q, a))

    if not pairs:
        log("No security questions found in config.env")
        return None

    # 1. Exact normalized keyword match
    for q, a in pairs:
        if normalize_text(q) == q_norm:
            log(f"Exact keyword match found for Q: '{q}' -> A: '{a}'")
            return a

    # 2. Substring keyword match
    for q, a in pairs:
        q_clean = normalize_text(q)
        if q_clean and (q_clean in q_norm or q_norm in q_clean):
            log(f"Substring match found for Q: '{q}' -> A: '{a}'")
            return a

    # 3. Fuzzy similarity matching using difflib
    best_score = 0.0
    best_answer = None
    best_q = None
    for q, a in pairs:
        score = difflib.SequenceMatcher(None, q_norm, normalize_text(q)).ratio()
        if score > best_score:
            best_score = score
            best_answer = a
            best_q = q

    if best_score >= 0.55 and best_answer:
        log(f"Fuzzy match (ratio {best_score:.2f}) with '{best_q}' -> A: '{best_answer}'")
        return best_answer

    log(f"No confident match found for question: '{question}'")
    return None

def connect_imap(env):
    server = env.get("IMAP_SERVER", "imap.gmail.com")
    port = int(env.get("IMAP_PORT", "993"))
    user = env.get("IMAP_USERNAME", "")
    password = env.get("IMAP_PASSWORD", "")
    use_ssl = env.get("IMAP_USE_SSL", "true").lower() in ("true", "1", "yes")

    if not user or not password:
        return None

    log(f"Connecting to IMAP {server}:{port} (SSL={use_ssl}) as {user}")
    if use_ssl:
        mail = imaplib.IMAP4_SSL(server, port)
    else:
        mail = imaplib.IMAP4(server, port)
    mail.login(user, password)
    return mail

def get_watermark(env):
    mail = None
    try:
        mail = connect_imap(env)
        if not mail:
            return None
        mail.select("INBOX", readonly=True)
        res, data = mail.uid("SEARCH", None, "ALL")
        if res == "OK" and data and data[0]:
            uids = [int(u) for u in data[0].split() if u.isdigit()]
            max_uid = max(uids) if uids else 0
            log(f"Watermark set to latest UID: {max_uid}")
            return max_uid
        log("No existing emails found, watermark set to 0")
        return 0
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

def decode_header_value(header_val):
    if not header_val:
        return ""
    decoded_parts = decode_header(header_val)
    parts = []
    for content, enc in decoded_parts:
        if isinstance(content, bytes):
            parts.append(content.decode(enc or "utf-8", errors="ignore"))
        else:
            parts.append(str(content))
    return "".join(parts)

def extract_body(msg):
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            cdispo = str(part.get("Content-Disposition"))
            if ctype in ("text/plain", "text/html") and "attachment" not in cdispo:
                payload = part.get_payload(decode=True)
                if payload:
                    body += " " + payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            body = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
    return body

def extract_otp_from_text(text):
    if not text:
        return None
    patterns = [
        r'(?i)(?:OTP|verification\s*code|one\s*time\s*password)[^0-9\n\r]{0,30}\b(\d{4,8})\b',
        r'\b(\d{6})\b',
        r'\b(\d{4})\b'
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return None

def fetch_otp(min_uid, env):
    mail = None
    try:
        mail = connect_imap(env)
        mail.select("INBOX", readonly=True)
        search_query = f"(UID {int(min_uid) + 1}:*)" if min_uid and int(min_uid) > 0 else "ALL"
        log(f"Searching IMAP with query: {search_query}")
        res, data = mail.uid("SEARCH", None, search_query)
        if res != "OK" or not data or not data[0]:
            log("No new messages found yet.")
            return None

        uids = [int(u) for u in data[0].split() if u.isdigit()]
        # Check newest first
        uids.sort(reverse=True)

        for uid in uids:
            if min_uid and uid <= int(min_uid):
                continue
            res, msg_data = mail.uid("FETCH", str(uid), "(RFC822)")
            if res != "OK" or not msg_data or not msg_data[0]:
                continue
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            subject = decode_header_value(msg.get("Subject", ""))
            sender = decode_header_value(msg.get("From", ""))
            log(f"Examining email UID {uid} | From: {sender} | Subject: {subject}")

            body = extract_body(msg)
            combined = f"{subject}\n{body}"
            
            # Check if this email is from ERP or mentions ERP/OTP
            is_erp = ("erpkgp" in sender.lower() or 
                      "iitkgp" in sender.lower() or 
                      "otp" in subject.lower() or 
                      "one time password" in combined.lower())
            
            if is_erp:
                otp = extract_otp_from_text(combined)
                if otp:
                    log(f"Found OTP {otp} in email UID {uid}")
                    return otp
        return None
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

def main():
    log("=== Native Host Started ===")
    while True:
        try:
            msg = read_message()
            if msg is None:
                log("Stdin closed, exiting host.")
                break
            
            cmd = msg.get("cmd") or msg.get("action")
            log(f"Handling command: {cmd}")
            env = load_env(CONFIG_PATH)

            if cmd == "ping":
                send_message({"status": "success", "message": "pong"})

            elif cmd == "get_credentials":
                user_id = env.get("ERP_USER_ID", "")
                password = env.get("ERP_PASSWORD", "")
                if not user_id or not password:
                    send_message({
                        "status": "error",
                        "message": "ERP_USER_ID or ERP_PASSWORD not set in config.env"
                    })
                else:
                    send_message({
                        "status": "success",
                        "user_id": user_id,
                        "password": password
                    })

            elif cmd == "answer_security_question":
                question = msg.get("question", "")
                answer = answer_question(question, env)
                if answer:
                    send_message({"status": "success", "answer": answer})
                else:
                    send_message({
                        "status": "error",
                        "message": f"No answer found for question: '{question}'. Check config.env"
                    })

            elif cmd == "mark_otp_watermark":
                try:
                    watermark = get_watermark(env)
                    if watermark is None:
                        send_message({"status": "disabled", "message": "IMAP not configured in config.env"})
                    else:
                        send_message({"status": "success", "min_uid": watermark})
                except Exception as e:
                    log(f"Error marking watermark: {e}")
                    send_message({"status": "error", "message": str(e)})

            elif cmd == "fetch_otp":
                min_uid = msg.get("min_uid", 0)
                try:
                    otp = fetch_otp(min_uid, env)
                    if otp:
                        send_message({"status": "success", "otp": otp})
                    else:
                        send_message({"status": "pending"})
                except Exception as e:
                    log(f"Error fetching OTP: {e}")
                    send_message({"status": "error", "message": str(e)})

            else:
                send_message({"status": "error", "message": f"Unknown command: {cmd}"})

        except Exception as e:
            log(f"Unhandled error in main loop: {e}")
            send_message({"status": "error", "message": str(e)})

if __name__ == "__main__":
    main()
