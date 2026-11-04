// Injected into MAIN world at document_start.
// Overrides window.alert to prevent modal dialogs (like "OTP sent successfully")
// from blocking browser execution and stopping automated form submission.
(function() {
  const originalAlert = window.alert;
  window.alert = function(msg) {
    console.log("[ERP Auto-Login] Suppressed alert:", msg);
    window.dispatchEvent(new CustomEvent("__erp_alert_suppressed", {
      detail: { message: msg }
    }));
  };
})();
