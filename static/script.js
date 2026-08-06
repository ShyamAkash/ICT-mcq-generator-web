(() => {
  "use strict";

  // Navigation Tabs
  const tabGenerator = document.getElementById("tab-generator");
  const tabTranslator = document.getElementById("tab-translator");
  const tabGlossary = document.getElementById("tab-glossary");
  const tabAdmin = document.getElementById("tab-admin");

  const viewGenerator = document.getElementById("view-generator");
  const viewTranslator = document.getElementById("view-translator");
  const viewGlossary = document.getElementById("view-glossary");
  const viewAdmin = document.getElementById("view-admin");

  // Generator Elements
  const mcqForm = document.getElementById("mcq-form");
  const apiKeyInput = document.getElementById("api-key");
  const topicInput = document.getElementById("topic");
  const modelInput = document.getElementById("model");
  const generateBtn = document.getElementById("generate-btn");
  const statusEl = document.getElementById("status");

  // Translator Elements
  const translateForm = document.getElementById("translate-form");
  const translateApiKeyInput = document.getElementById("translate-api-key");
  const translateSourceInput = document.getElementById("translate-source");
  const translateBtn = document.getElementById("translate-btn");
  const translateStatusEl = document.getElementById("translate-status");
  const translateResultInput = document.getElementById("translate-result");
  const copyTranslationBtn = document.getElementById("copy-translation-btn");
  const toggleFontBtn = document.getElementById("toggle-font-btn");

  let currentLegacyText = "";
  let currentUnicodeText = "";
  let isViewingUnicode = false;

  // Public Glossary / Suggestion Elements
  const suggestForm = document.getElementById("suggest-form");
  const suggestEnglishInput = document.getElementById("suggest-english");
  const suggestSinhalaInput = document.getElementById("suggest-sinhala");
  const suggestStatusEl = document.getElementById("suggest-status");
  const glossaryListEl = document.getElementById("glossary-list");

  // Admin Elements
  const adminLoginForm = document.getElementById("admin-login-form");
  const adminPassInput = document.getElementById("admin-pass");
  const loginStatusEl = document.getElementById("login-status");
  const adminLoginView = document.getElementById("admin-login-view");
  const adminContentView = document.getElementById("admin-content-view");
  const adminLogoutBtn = document.getElementById("admin-logout-btn");

  const adminAddForm = document.getElementById("admin-add-form");
  const adminEnglishInput = document.getElementById("admin-english");
  const adminSinhalaInput = document.getElementById("admin-sinhala");
  const adminStatusEl = document.getElementById("admin-status");
  const pendingListEl = document.getElementById("pending-list");
  const adminActiveListEl = document.getElementById("admin-active-list");

  // LocalStorage API Key Persistence
  const STORAGE_KEY_API = "gemini_api_key";

  function initApiKey() {
    const savedKey = localStorage.getItem(STORAGE_KEY_API) || "";
    if (apiKeyInput) apiKeyInput.value = savedKey;
    if (translateApiKeyInput) translateApiKeyInput.value = savedKey;

    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", () => {
        const val = apiKeyInput.value.trim();
        localStorage.setItem(STORAGE_KEY_API, val);
        if (translateApiKeyInput) translateApiKeyInput.value = val;
      });
    }

    if (translateApiKeyInput) {
      translateApiKeyInput.addEventListener("input", () => {
        const val = translateApiKeyInput.value.trim();
        localStorage.setItem(STORAGE_KEY_API, val);
        if (apiKeyInput) apiKeyInput.value = val;
      });
    }
  }

  // Helper for status messages
  function setStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("is-error", "is-success", "is-info");
    if (kind) el.classList.add(`is-${kind}`);
  }

  function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    generateBtn.classList.toggle("is-loading", isLoading);
  }

  function filenameFromResponse(response, fallback) {
    const header = response.headers.get("Content-Disposition") || "";
    const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : fallback;
  }

  // Check URL Hash for Admin mode
  function checkAdminAccess() {
    if (window.location.hash === "#admin") {
      tabAdmin.classList.remove("is-hidden");
      switchTab("admin");
    } else {
      tabAdmin.classList.add("is-hidden");
    }
  }

  function isAdminAuthenticated() {
    return sessionStorage.getItem("admin_authenticated") === "true";
  }

  function updateAdminView() {
    if (isAdminAuthenticated()) {
      if (adminLoginView) adminLoginView.classList.add("is-hidden");
      if (adminContentView) adminContentView.classList.remove("is-hidden");
      fetchAdminData();
    } else {
      if (adminContentView) adminContentView.classList.add("is-hidden");
      if (adminLoginView) adminLoginView.classList.remove("is-hidden");
    }
  }

  // View Switching
  function switchTab(target) {
    // Deactivate all
    [tabGenerator, tabTranslator, tabGlossary, tabAdmin].forEach((t) => {
      if (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      }
    });
    [viewGenerator, viewTranslator, viewGlossary, viewAdmin].forEach((v) => {
      if (v) v.classList.add("is-hidden");
    });

    if (target === "admin") {
      tabAdmin.classList.remove("is-hidden");
      tabAdmin.classList.add("is-active");
      tabAdmin.setAttribute("aria-selected", "true");
      viewAdmin.classList.remove("is-hidden");
      window.location.hash = "admin";
      updateAdminView();
    } else {
      if (window.location.hash === "#admin") {
        history.replaceState(null, "", " ");
      }
      tabAdmin.classList.add("is-hidden");

      if (target === "translator") {
        tabTranslator.classList.add("is-active");
        tabTranslator.setAttribute("aria-selected", "true");
        viewTranslator.classList.remove("is-hidden");
      } else if (target === "glossary") {
        tabGlossary.classList.add("is-active");
        tabGlossary.setAttribute("aria-selected", "true");
        viewGlossary.classList.remove("is-hidden");
        fetchGlossary();
      } else {
        tabGenerator.classList.add("is-active");
        tabGenerator.setAttribute("aria-selected", "true");
        viewGenerator.classList.remove("is-hidden");
      }
    }
  }

  if (tabGenerator) tabGenerator.addEventListener("click", () => switchTab("generator"));
  if (tabTranslator) tabTranslator.addEventListener("click", () => switchTab("translator"));
  if (tabGlossary) tabGlossary.addEventListener("click", () => switchTab("glossary"));
  if (tabAdmin) tabAdmin.addEventListener("click", () => switchTab("admin"));

  window.addEventListener("hashchange", checkAdminAccess);

  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const pass = adminPassInput ? adminPassInput.value.trim() : "";
      if (pass === "ictfromabcadmin") {
        sessionStorage.setItem("admin_authenticated", "true");
        if (adminPassInput) adminPassInput.value = "";
        setStatus(loginStatusEl, "", "");
        updateAdminView();
      } else {
        setStatus(loginStatusEl, "Incorrect admin password.", "error");
      }
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("admin_authenticated");
      updateAdminView();
    });
  }

  // Generator Handler
  async function handleGenerate(event) {
    event.preventDefault();

    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const topic = topicInput.value.trim();
    const model = modelInput.value.trim();
    const qtype = mcqForm.querySelector('input[name="qtype"]:checked').value;

    if (!apiKey) {
      setStatus(statusEl, "Please enter your Gemini API Key first.", "error");
      apiKeyInput.focus();
      return;
    }
    if (!topic) {
      setStatus(statusEl, "Please describe the question or provide a reference question.", "error");
      topicInput.focus();
      return;
    }
    if (!model) {
      setStatus(statusEl, "Enter a Gemini model name.", "error");
      modelInput.focus();
      return;
    }

    setLoading(true);
    setStatus(statusEl, "Generating question document…", "info");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, topic, model, qtype }),
      });

      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const data = await response.json();
          if (data && data.error) message = data.error;
        } catch (_) {}
        setStatus(statusEl, message, "error");
        return;
      }

      const blob = await response.blob();
      const filename = filenameFromResponse(response, "question.docx");
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStatus(statusEl, `Downloaded ${filename}`, "success");
    } catch (err) {
      setStatus(
        statusEl,
        "Couldn't reach the server. Check your connection.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  mcqForm.addEventListener("submit", handleGenerate);

  // Translator Handler
  async function handleTranslate(event) {
    event.preventDefault();

    const apiKey = (translateApiKeyInput && translateApiKeyInput.value.trim()) || (apiKeyInput && apiKeyInput.value.trim()) || "";
    const text = translateSourceInput ? translateSourceInput.value.trim() : "";
    const model = modelInput ? modelInput.value.trim() : "gemini-3.6-flash";

    if (!apiKey) {
      setStatus(translateStatusEl, "Please enter your Gemini API Key.", "error");
      if (translateApiKeyInput) translateApiKeyInput.focus();
      else if (apiKeyInput) apiKeyInput.focus();
      return;
    }
    if (!text) {
      setStatus(translateStatusEl, "Please enter English text to translate.", "error");
      if (translateSourceInput) translateSourceInput.focus();
      return;
    }

    translateBtn.disabled = true;
    translateBtn.classList.add("is-loading");
    setStatus(translateStatusEl, "Translating text into Sinhala…", "info");

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, text, model }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Translation request failed.");
      }

      if (translateResultInput) {
        currentLegacyText = data.translation || "";
        currentUnicodeText = data.unicode || "";
        isViewingUnicode = false;
        translateResultInput.value = currentLegacyText;
        translateResultInput.style.fontFamily = '"4u-Chami.", "4u-Chami", "FM-Malithi", "FM Malithi x", "FMMalithi", var(--sans)';
      }
      if (copyTranslationBtn) {
        copyTranslationBtn.style.display = "inline-flex";
      }
      if (toggleFontBtn) {
        toggleFontBtn.style.display = "inline-flex";
        toggleFontBtn.textContent = "View in Unicode";
      }
      setStatus(translateStatusEl, "Translation completed!", "success");
    } catch (err) {
      setStatus(translateStatusEl, err.message || "Couldn't complete translation.", "error");
    } finally {
      translateBtn.disabled = false;
      translateBtn.classList.remove("is-loading");
    }
  }

  if (translateForm) {
    translateForm.addEventListener("submit", handleTranslate);
  }

  if (toggleFontBtn && translateResultInput) {
    toggleFontBtn.addEventListener("click", () => {
      isViewingUnicode = !isViewingUnicode;
      if (isViewingUnicode) {
        translateResultInput.value = currentUnicodeText;
        translateResultInput.style.fontFamily = "var(--sans)";
        toggleFontBtn.textContent = "View in 4u-Chami / FM Malithi";
        if (copyTranslationBtn) copyTranslationBtn.textContent = "Copy Unicode";
      } else {
        translateResultInput.value = currentLegacyText;
        translateResultInput.style.fontFamily = '"4u-Chami.", "4u-Chami", "FM-Malithi", "FM Malithi x", "FMMalithi", var(--sans)';
        toggleFontBtn.textContent = "View in Unicode";
        if (copyTranslationBtn) copyTranslationBtn.textContent = "Copy Legacy";
      }
    });
  }

  if (copyTranslationBtn && translateResultInput) {
    copyTranslationBtn.addEventListener("click", async () => {
      const textToCopy = translateResultInput.value;
      if (!textToCopy) return;
      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyTranslationBtn.textContent;
        copyTranslationBtn.textContent = "Copied!";
        setTimeout(() => { copyTranslationBtn.textContent = originalText; }, 2000);
      } catch (_) {
        translateResultInput.select();
        document.execCommand("copy");
        const originalText = copyTranslationBtn.textContent;
        copyTranslationBtn.textContent = "Copied!";
        setTimeout(() => { copyTranslationBtn.textContent = originalText; }, 2000);
      }
    });
  }

  // Glossary Logic (Public View)
  async function fetchGlossary() {
    try {
      const res = await fetch("/api/vocabulary");
      if (!res.ok) throw new Error("Failed to load glossary.");
      const list = await res.json();
      renderGlossary(list);
    } catch (err) {
      setStatus(suggestStatusEl, "Error loading glossary.", "error");
    }
  }

  function renderGlossary(list) {
    glossaryListEl.innerHTML = "";
    if (!list || list.length === 0) {
      glossaryListEl.innerHTML = `<div class="empty-vocab">No vocabulary mappings available.</div>`;
      return;
    }

    list.forEach((item) => {
      const row = document.createElement("div");
      row.className = "vocab-row";

      const engSpan = document.createElement("span");
      engSpan.className = "vocab-english";
      engSpan.textContent = item.english;

      const sinSpan = document.createElement("span");
      sinSpan.className = "vocab-sinhala";
      sinSpan.textContent = item.sinhala;

      row.appendChild(engSpan);
      row.appendChild(sinSpan);

      glossaryListEl.appendChild(row);
    });
  }

  async function handleSuggest(event) {
    event.preventDefault();
    const english = suggestEnglishInput.value.trim();
    const sinhala = suggestSinhalaInput.value.trim();

    if (!english || !sinhala) {
      setStatus(suggestStatusEl, "Please fill in both fields.", "error");
      return;
    }

    try {
      setStatus(suggestStatusEl, "Submitting suggestion…", "info");
      const res = await fetch("/api/vocabulary/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english, sinhala }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit suggestion");
      }

      suggestEnglishInput.value = "";
      suggestSinhalaInput.value = "";
      setStatus(
        suggestStatusEl,
        "Suggestion submitted! An admin will review it before it is added to the generator.",
        "success"
      );
    } catch (err) {
      setStatus(suggestStatusEl, err.message || "Failed to submit suggestion.", "error");
    }
  }

  if (suggestForm) {
    suggestForm.addEventListener("submit", handleSuggest);
  }

  // Admin Logic
  async function fetchAdminData() {
    try {
      const [pendingRes, activeRes] = await Promise.all([
        fetch("/api/admin/pending"),
        fetch("/api/vocabulary"),
      ]);

      const pending = pendingRes.ok ? await pendingRes.json() : [];
      const active = activeRes.ok ? await activeRes.json() : [];

      renderAdminPending(pending);
      renderAdminActive(active);
    } catch (err) {
      setStatus(adminStatusEl, "Error loading admin data.", "error");
    }
  }

  function renderAdminPending(pendingList) {
    pendingListEl.innerHTML = "";
    if (!pendingList || pendingList.length === 0) {
      pendingListEl.innerHTML = `<div class="empty-vocab">No pending translation suggestions.</div>`;
      return;
    }

    pendingList.forEach((item) => {
      const row = document.createElement("div");
      row.className = "vocab-row admin-row";

      const engSpan = document.createElement("span");
      engSpan.className = "vocab-english";
      engSpan.textContent = item.english;

      const sinSpan = document.createElement("span");
      sinSpan.className = "vocab-sinhala";
      sinSpan.textContent = item.sinhala;

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "action-btns";

      const approveBtn = document.createElement("button");
      approveBtn.className = "btn-sm btn-approve";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", () => approveSuggestion(item.id));

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "btn-sm btn-reject";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", () => rejectSuggestion(item.id));

      actionsDiv.appendChild(approveBtn);
      actionsDiv.appendChild(rejectBtn);

      row.appendChild(engSpan);
      row.appendChild(sinSpan);
      row.appendChild(actionsDiv);

      pendingListEl.appendChild(row);
    });
  }

  function renderAdminActive(activeList) {
    adminActiveListEl.innerHTML = "";
    if (!activeList || activeList.length === 0) {
      adminActiveListEl.innerHTML = `<div class="empty-vocab">No active prompt translations.</div>`;
      return;
    }

    activeList.forEach((item) => {
      const row = document.createElement("div");
      row.className = "vocab-row admin-row";

      const engSpan = document.createElement("span");
      engSpan.className = "vocab-english";
      engSpan.textContent = item.english;

      const sinSpan = document.createElement("span");
      sinSpan.className = "vocab-sinhala";
      sinSpan.textContent = item.sinhala;

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "action-btns";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-sm btn-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => adminDeleteWord(item.english));

      actionsDiv.appendChild(deleteBtn);

      row.appendChild(engSpan);
      row.appendChild(sinSpan);
      row.appendChild(actionsDiv);

      adminActiveListEl.appendChild(row);
    });
  }

  async function approveSuggestion(id) {
    try {
      setStatus(adminStatusEl, "Approving suggestion…", "info");
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to approve suggestion");
      }

      renderAdminPending(data.pending);
      renderAdminActive(data.vocabulary);
      setStatus(adminStatusEl, "Approved and added to prompt file!", "success");
    } catch (err) {
      setStatus(adminStatusEl, err.message || "Failed to approve suggestion.", "error");
    }
  }

  async function rejectSuggestion(id) {
    try {
      setStatus(adminStatusEl, "Rejecting suggestion…", "info");
      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reject suggestion");
      }

      renderAdminPending(data.pending);
      setStatus(adminStatusEl, "Suggestion rejected.", "info");
    } catch (err) {
      setStatus(adminStatusEl, err.message || "Failed to reject suggestion.", "error");
    }
  }

  async function adminAddWord(event) {
    event.preventDefault();
    const english = adminEnglishInput.value.trim();
    const sinhala = adminSinhalaInput.value.trim();

    if (!english || !sinhala) {
      setStatus(adminStatusEl, "Please fill in both fields.", "error");
      return;
    }

    try {
      setStatus(adminStatusEl, "Adding to prompt file…", "info");
      const res = await fetch("/api/admin/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english, sinhala }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add word");
      }

      adminEnglishInput.value = "";
      adminSinhalaInput.value = "";
      renderAdminActive(data.vocabulary);
      setStatus(adminStatusEl, `Added "${english}" -> "${sinhala}" directly to prompt file!`, "success");
    } catch (err) {
      setStatus(adminStatusEl, err.message || "Failed to add word.", "error");
    }
  }

  async function adminDeleteWord(english) {
    try {
      setStatus(adminStatusEl, `Deleting "${english}" from prompt file…`, "info");
      const res = await fetch("/api/admin/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete word");
      }

      renderAdminActive(data.vocabulary);
      setStatus(adminStatusEl, `Deleted "${english}" from prompt file.`, "success");
    } catch (err) {
      setStatus(adminStatusEl, err.message || "Failed to delete word.", "error");
    }
  }

  if (adminAddForm) {
    adminAddForm.addEventListener("submit", adminAddWord);
  }

  // Init
  initApiKey();
  checkAdminAccess();
})();
