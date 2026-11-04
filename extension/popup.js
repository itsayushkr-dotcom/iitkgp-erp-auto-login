// Popup script for managing preferences and checking status
document.addEventListener("DOMContentLoaded", async () => {
  const helperStatusEl = document.getElementById("helper-status");
  const userRowEl = document.getElementById("user-row");
  const configuredUserEl = document.getElementById("configured-user");
  const toggleEl = document.getElementById("auto-login-toggle");
  const btnTestImap = document.getElementById("btn-test-imap");
  const btnOpenErp = document.getElementById("btn-open-erp");
  const testResultEl = document.getElementById("test-result");

  // Load toggle preference
  const stored = await chrome.storage.local.get({ autoLoginEnabled: true });
  toggleEl.checked = stored.autoLoginEnabled;

  toggleEl.addEventListener("change", async () => {
    await chrome.storage.local.set({ autoLoginEnabled: toggleEl.checked });
  });

  // Check Native Host connection
  function checkNativeHost() {
    chrome.runtime.sendMessage({ cmd: "native_call", payload: { cmd: "ping" } }, (resp) => {
      if (chrome.runtime.lastError || !resp || resp.status !== "success") {
        helperStatusEl.textContent = "Disconnected";
        helperStatusEl.className = "status-pill status-err";
      } else {
        helperStatusEl.textContent = "Connected";
        helperStatusEl.className = "status-pill status-ok";

        // Query credentials to display configured user ID
        chrome.runtime.sendMessage({ cmd: "native_call", payload: { cmd: "get_credentials" } }, (cResp) => {
          if (cResp && cResp.status === "success" && cResp.user_id) {
            configuredUserEl.textContent = cResp.user_id;
            userRowEl.style.display = "flex";
          }
        });
      }
    });
  }

  checkNativeHost();

  // Test IMAP button
  btnTestImap.addEventListener("click", () => {
    testResultEl.style.display = "block";
    testResultEl.className = "test-result";
    testResultEl.textContent = "Connecting to IMAP...";

    chrome.runtime.sendMessage({ cmd: "native_call", payload: { cmd: "mark_otp_watermark" } }, (resp) => {
      if (chrome.runtime.lastError) {
        testResultEl.className = "test-result err";
        testResultEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp && resp.status === "success") {
        testResultEl.className = "test-result ok";
        testResultEl.textContent = `IMAP Connected! Watermark UID: ${resp.min_uid}`;
      } else if (resp && resp.status === "disabled") {
        testResultEl.className = "test-result ok";
        testResultEl.textContent = "IMAP is optional and currently empty. Semi-auto OTP mode is active!";
      } else {
        testResultEl.className = "test-result err";
        testResultEl.textContent = resp?.message || "Failed to connect to IMAP";
      }
    });
  });

  // Open ERP Login button
  btnOpenErp.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://erp.iitkgp.ac.in/SSOAdministration/login.htm" });
  });
});
