// Content script for IIT KGP ERP Login Automation
(function() {
  if (window.__erpAutoLoginLoaded) return;
  window.__erpAutoLoginLoaded = true;

  // Visual status banner for user feedback
  let banner = null;
  function updateBanner(text, type = "info") {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "__erp_autologin_banner";
      banner.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 999999;
        padding: 12px 18px;
        background: #1e293b;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 360px;
        border-left: 4px solid #3b82f6;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(banner);
    }

    const colors = {
      info: "#3b82f6",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#ef4444"
    };

    const icons = {
      info: "⏳",
      success: "✅",
      warning: "⚠️",
      error: "❌"
    };

    banner.style.borderLeftColor = colors[type] || colors.info;
    banner.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${text}</span>`;
  }

  function waitFor(checkFn, timeoutMs = 20000, intervalMs = 200) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        try {
          const res = checkFn();
          if (res) return resolve(res);
        } catch (e) {
          // ignore until deadline
        }
        if (Date.now() > deadline) {
          return reject(new Error("Timeout waiting for page element"));
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function setValue(el, value) {
    if (!el) return;
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    for (const evt of ["keydown", "keypress", "input", "keyup", "change"]) {
      el.dispatchEvent(new Event(evt, { bubbles: true }));
    }
  }

  function nativeCall(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ cmd: "native_call", payload }, (resp) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(resp);
      });
    });
  }

  async function pollOtp(minUid, maxWaitSeconds = 90) {
    const startTime = Date.now();
    let attempts = 0;

    while ((Date.now() - startTime) < (maxWaitSeconds * 1000)) {
      attempts++;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      updateBanner(`Waiting for OTP from email... (${elapsed}s elapsed)`, "info");

      try {
        const resp = await nativeCall({ cmd: "fetch_otp", min_uid: minUid });
        if (resp && resp.status === "success" && resp.otp) {
          return resp.otp;
        }
        if (resp && resp.status === "error") {
          console.warn("[ERP Auto-Login] OTP fetch warning:", resp.message);
        }
      } catch (err) {
        console.warn("[ERP Auto-Login] Poll error:", err);
      }

      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`OTP email not received after ${maxWaitSeconds}s. Please check your inbox or config.env.`);
  }

  async function runAutoLogin() {
    // Check if auto-login is disabled in user preferences
    const prefs = await chrome.storage.local.get({ autoLoginEnabled: true });
    if (!prefs.autoLoginEnabled) {
      console.log("[ERP Auto-Login] Auto-login is disabled in extension settings.");
      return;
    }

    updateBanner("ERP Auto-Login active. Connecting to native helper...", "info");

    // Step 0: Ping native host
    let pingResp;
    try {
      pingResp = await nativeCall({ cmd: "ping" });
    } catch (e) {
      updateBanner("Native host not detected. Have you run install.ps1?", "error");
      return;
    }

    if (!pingResp || pingResp.status !== "success") {
      updateBanner("Native helper communication error. Check host_debug.log.", "error");
      return;
    }

    // Step 1: Fetch credentials from config.env via native host
    updateBanner("Reading ERP credentials...", "info");
    const credsResp = await nativeCall({ cmd: "get_credentials" });
    if (!credsResp || credsResp.status !== "success") {
      updateBanner(credsResp?.message || "Missing credentials in config.env", "warning");
      return;
    }

    const { user_id, password } = credsResp;

    // Step 2: Locate User ID & Password inputs
    updateBanner("Locating login fields...", "info");
    const userIdInput = await waitFor(() => document.querySelector("#user_id") || document.querySelector("input[name='user_id']"));
    const passwordInput = await waitFor(() => document.querySelector("#password") || document.querySelector("input[name='password']"));

    updateBanner("Entering User ID & Password...", "info");
    setValue(userIdInput, user_id);
    setValue(passwordInput, password);

    // Trigger blur on user_id to prompt ERP server for the random security question
    userIdInput.dispatchEvent(new Event("blur", { bubbles: true }));
    passwordInput.focus();

    // Step 3: Wait for security question to appear
    updateBanner("Fetching security question from ERP...", "info");
    const getQuestionText = () => {
      const qEl = document.querySelector("#question");
      if (qEl && qEl.innerText && qEl.innerText.trim().length > 3) {
        return qEl.innerText.trim();
      }
      return null;
    };

    const questionText = await waitFor(getQuestionText, 15000);
    // Allow question to settle (ERP sometimes replaces question briefly)
    await new Promise(r => setTimeout(r, 600));
    const settledQuestion = getQuestionText() || questionText;

    updateBanner(`Security Question: "${settledQuestion.substring(0, 32)}..."`, "info");

    // Step 4: Resolve security answer
    const answerResp = await nativeCall({
      cmd: "answer_security_question",
      question: settledQuestion
    });

    if (!answerResp || answerResp.status !== "success" || !answerResp.answer) {
      updateBanner(`No answer found for: "${settledQuestion}". Please answer manually.`, "warning");
      const answerInput = document.querySelector("#answer");
      if (answerInput) answerInput.focus();
      return;
    }

    const answerInput = await waitFor(() => document.querySelector("#answer"));
    setValue(answerInput, answerResp.answer);
    answerInput.dispatchEvent(new Event("blur", { bubbles: true }));

    // Step 5: Check inbox watermark / IMAP capability
    updateBanner("Checking inbox watermark...", "info");
    let minUid = 0;
    let imapEnabled = false;
    try {
      const watermarkResp = await nativeCall({ cmd: "mark_otp_watermark" });
      if (watermarkResp && watermarkResp.status === "success") {
        minUid = watermarkResp.min_uid;
        imapEnabled = true;
      } else if (watermarkResp && watermarkResp.status === "disabled") {
        console.log("[ERP Auto-Login] IMAP is disabled or not configured.");
        imapEnabled = false;
      }
    } catch (e) {
      console.warn("[ERP Auto-Login] Could not set watermark:", e);
      imapEnabled = false;
    }

    // Step 6: Request OTP
    updateBanner("Requesting OTP from ERP...", "info");
    const getOtpBtn = await waitFor(() => document.querySelector("#getotp"));
    getOtpBtn.click();

    const otpInput = await waitFor(() => document.querySelector("#email_otp1") || document.querySelector("input[name='email_otp1']"));
    const submitBtn = await waitFor(() => document.querySelector("#loginFormSubmitButton") || document.querySelector("input[type='submit']"));

    if (imapEnabled) {
      // Step 7: Poll for incoming email OTP
      const otp = await pollOtp(minUid, 90);
      updateBanner(`Received OTP: ${otp}! Filling...`, "success");
      setValue(otpInput, otp);

      // Step 8: Submit Login
      await new Promise(r => setTimeout(r, 400));
      updateBanner("Submitting login form...", "success");
      submitBtn.click();
    } else {
      // Semi-auto fallback: Credentials and question are filled, OTP requested
      updateBanner("✅ Credentials & Question filled! Enter your OTP (auto-submits when 6 digits entered).", "success");
      otpInput.focus();

      // Automatically submit as soon as a 6-digit OTP is typed or pasted
      otpInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        if (/^\d{6}$/.test(val)) {
          updateBanner("OTP entered! Logging in...", "success");
          setTimeout(() => submitBtn.click(), 300);
        }
      });

      otpInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitBtn.click();
        }
      });
    }
  }

  // Run automatically when page is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      runAutoLogin().catch(err => updateBanner(err.message, "error"));
    });
  } else {
    runAutoLogin().catch(err => updateBanner(err.message, "error"));
  }
})();
