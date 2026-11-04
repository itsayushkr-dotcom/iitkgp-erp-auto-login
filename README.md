# IIT Kharagpur ERP Zero-Click Auto-Login

A lightweight, secure, and 100% hands-free auto-login tool for **IIT Kharagpur ERP (`https://erp.iitkgp.ac.in/`)**.

It automates the entire login sequence:
1. Autofills **Roll Number / User ID** and **Password**.
2. Dynamically detects which of your 3 registered security questions ERP asks and autofills the matching **Security Answer**.
3. Silently clicks **Get OTP** (suppressing blocking alert popups).
4. Reads the incoming OTP directly from your institute email / Gmail via a secure local IMAP helper.
5. Autofills **Enter OTP** and submits the login form.

All credentials stay strictly on your local machine in `config.env`.

---

## Quick Setup Guide (3 Steps)

### Step 1: Load the Extension into Brave / Chrome

1. Open your browser and navigate to:
   * **Brave:** `brave://extensions`
   * **Chrome:** `chrome://extensions`
   * **Edge:** `edge://extensions`
2. Toggle on **Developer mode** (top right corner).
3. Click **Load unpacked** (top left).
4. Select the `extension/` folder located at:
   ```text
   C:\Users\itsay\.gemini\antigravity\scratch\iitkgp-erp-autologin\extension
   ```
5. Note the 32-character **Extension ID** displayed on the extension card (e.g., `abcdefghijklmnopqrstuvwxyz123456`).

---

### Step 2: Register the Local Helper (`install.ps1`)

Open PowerShell in this directory and run:

```powershell
.\install.ps1 -ExtensionId <YOUR_32_CHAR_EXTENSION_ID>
```

*(Or simply run `.\install.ps1` and paste the Extension ID when prompted).*

This automatically configures the Windows Registry keys for Chrome, Brave, and Edge so the browser can securely communicate with the local Python helper.

---

### Step 3: Configure Your Credentials (`config.env`)

Open `native-host\config.env` in Notepad and fill in your details:

```env
# ERP Credentials
ERP_USER_ID=21CS100XX
ERP_PASSWORD=your_actual_erp_password

# Your 3 Registered Security Questions & Answers
SECURITY_Q1=What is the name of your first school?
SECURITY_A1=St Xaviers

SECURITY_Q2=What is your favorite color?
SECURITY_A2=Blue

SECURITY_Q3=What is your mother's maiden name?
SECURITY_A3=Sharma

# IMAP Configuration (for automated OTP fetching)
IMAP_SERVER=imap.gmail.com
IMAP_PORT=993
IMAP_USE_SSL=true
IMAP_USERNAME=your_email@kgpian.iitkgp.ac.in
IMAP_PASSWORD=your_16_char_google_app_password
```

#### How to get a Google App Password (for @kgpian.iitkgp.ac.in / Gmail):
1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
2. Enter an app name (e.g. `ERP Auto Login`).
3. Google will generate a 16-character password (e.g., `abcd efgh ijkl mnop`).
4. Paste this into `IMAP_PASSWORD` in `config.env`.

---

## Usage

1. Open `https://erp.iitkgp.ac.in/SSOAdministration/login.htm`.
2. Sit back and watch it automatically fill credentials, detect the question, fetch the OTP, and log in!
3. You can click the extension icon in your browser toolbar anytime to:
   * Test IMAP connection and watermark.
   * Toggle auto-login on/off.
   * See your configured roll number.

---

## Troubleshooting

* **Native host communication error:**
  Ensure you ran `install.ps1` with the exact Extension ID shown in `brave://extensions`.
* **OTP email not detected:**
  Click the extension icon and hit **"Test IMAP & Watermark"** to verify that your email username and App Password are valid.
* **Logs:**
  Check `native-host\host_debug.log` for detailed diagnostics on question matching, IMAP connections, and OTP extraction.
