// Background service worker for Native Messaging relay
const NATIVE_HOST_NAME = "com.iitkgp.erp_auto_login";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.cmd === "native_call") {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      request.payload,
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            status: "error",
            message: chrome.runtime.lastError.message
          });
        } else {
          sendResponse(response || { status: "error", message: "No response from native host" });
        }
      }
    );
    return true; // Keep message channel open for asynchronous response
  }
});
