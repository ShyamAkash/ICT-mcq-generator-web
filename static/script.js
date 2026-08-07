(() => {
  "use strict";

  // Navigation Tabs & Hamburger Menu
  const tabGenerator = document.getElementById("tab-generator");
  const tabTranslator = document.getElementById("tab-translator");
  const tabGlossary = document.getElementById("tab-glossary");
  const tabAdmin = document.getElementById("tab-admin");

  const hamburgerMenuBtn = document.getElementById("hamburger-menu-btn");
  const hamburgerDropdown = document.getElementById("hamburger-dropdown");
  const menuItemGenerator = document.getElementById("menu-item-generator");
  const menuItemTranslator = document.getElementById("menu-item-translator");
  const menuItemGlossary = document.getElementById("menu-item-glossary");
  const menuItemAdmin = document.getElementById("menu-item-admin");

  const viewGenerator = document.getElementById("view-generator");
  const viewTranslator = document.getElementById("view-translator");
  const viewGlossary = document.getElementById("view-glossary");
  const viewAdmin = document.getElementById("view-admin");

  // User Auth Nav Bar
  const userProfileEl = document.getElementById("user-profile");
  const userAvatarEl = document.getElementById("user-avatar");
  const userNameDisplayEl = document.getElementById("user-name-display");
  const userRoleBadgeEl = document.getElementById("user-role-badge");
  const headerSigninBtn = document.getElementById("header-signin-btn");
  const headerLogoutBtn = document.getElementById("header-logout-btn");

  // Generator Auth Required Banner & Form
  const generatorAuthBanner = document.getElementById("generator-auth-banner");
  const generatorSigninBtn = document.getElementById("generator-signin-btn");
  const mcqForm = document.getElementById("mcq-form");

  // Auth Modal
  const authModal = document.getElementById("auth-modal");
  const authModalOverlay = document.getElementById("auth-modal-overlay");
  const authModalClose = document.getElementById("auth-modal-close");
  const googleSigninBtn = document.getElementById("google-signin-btn");
  const emailAuthForm = document.getElementById("email-auth-form");
  const authTabLogin = document.getElementById("auth-tab-login");
  const authTabRegister = document.getElementById("auth-tab-register");
  const authNameField = document.getElementById("auth-name-field");
  const authNameInput = document.getElementById("auth-name");
  const authEmailInput = document.getElementById("auth-email");
  const authPasswordInput = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authStatusEl = document.getElementById("auth-status");

  let authMode = "login"; // "login" or "register"
  let currentUser = null;

  // Generator Elements
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

  // Admin Subtabs & Sections
  const adminSubtabUsers = document.getElementById("admin-subtab-users");
  const adminSubtabVocab = document.getElementById("admin-subtab-vocab");
  const adminSecUsers = document.getElementById("admin-sec-users");
  const adminSecVocab = document.getElementById("admin-sec-vocab");

  const adminUsersList = document.getElementById("admin-users-list");
  const adminGuestsList = document.getElementById("admin-guests-list");
  const adminPromptSearch = document.getElementById("admin-prompt-search");
  const adminTypeFilter = document.getElementById("admin-type-filter");
  const adminPromptsList = document.getElementById("admin-prompts-list");

  const adminAddForm = document.getElementById("admin-add-form");
  const adminEnglishInput = document.getElementById("admin-english");
  const adminSinhalaInput = document.getElementById("admin-sinhala");
  const adminStatusEl = document.getElementById("admin-status");
  const pendingListEl = document.getElementById("pending-list");
  const adminActiveListEl = document.getElementById("admin-active-list");

  let adminPromptsData = [];
  let adminTranslationStats = { users: [], guests: [], total: 0 };

  // LocalStorage Keys
  const STORAGE_KEY_API = "gemini_api_key";
  const STORAGE_KEY_TOKEN = "auth_session_token";

  function getAuthHeaders() {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  function initApiKey() {
    const savedKey = localStorage.getItem(STORAGE_KEY_API) || "";
    if (apiKeyInput) apiKeyInput.value = savedKey;
    if (translateApiKeyInput) translateApiKeyInput.value = "";

    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", () => {
        const val = apiKeyInput.value.trim();
        localStorage.setItem(STORAGE_KEY_API, val);
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
    if (generateBtn) {
      generateBtn.disabled = isLoading;
      generateBtn.classList.toggle("is-loading", isLoading);
    }
  }

  function filenameFromResponse(response, fallback) {
    const header = response.headers.get("Content-Disposition") || "";
    const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : fallback;
  }

  // Session & User Auth Management
  async function checkCurrentUserSession() {
    try {
      const res = await fetch("/api/auth/me", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user || null;
      } else {
        currentUser = null;
      }
    } catch (_) {
      currentUser = null;
    }
    updateAuthUI();
  }

  function isUserAdmin() {
    return currentUser && (currentUser.email?.toLowerCase() === "sachoice51@gmail.com" || currentUser.role === "admin");
  }

  function updateAuthUI() {
    const isAdmin = isUserAdmin();

    if (currentUser) {
      // User is signed in
      if (headerSigninBtn) headerSigninBtn.classList.add("is-hidden");
      if (userProfileEl) userProfileEl.classList.remove("is-hidden");
      if (userNameDisplayEl) userNameDisplayEl.textContent = currentUser.name || currentUser.email;
      if (userRoleBadgeEl) userRoleBadgeEl.textContent = isAdmin ? "Admin" : (currentUser.role || "User");

      if (currentUser.picture && userAvatarEl) {
        userAvatarEl.src = currentUser.picture;
        userAvatarEl.style.display = "block";
      } else if (userAvatarEl) {
        userAvatarEl.style.display = "none";
      }

      // MCQ Generator access
      if (generatorAuthBanner) generatorAuthBanner.classList.add("is-hidden");
      if (mcqForm) mcqForm.classList.remove("is-hidden");

      // Admin access tab & hamburger menu item
      if (isAdmin) {
        if (tabAdmin) tabAdmin.classList.remove("is-hidden");
        if (menuItemAdmin) menuItemAdmin.classList.remove("is-hidden");
      } else {
        if (tabAdmin) tabAdmin.classList.add("is-hidden");
        if (menuItemAdmin) menuItemAdmin.classList.add("is-hidden");
      }
    } else {
      // User is signed out
      if (userProfileEl) userProfileEl.classList.add("is-hidden");
      if (headerSigninBtn) headerSigninBtn.classList.remove("is-hidden");

      // MCQ Generator lock banner
      if (generatorAuthBanner) generatorAuthBanner.classList.remove("is-hidden");
      if (mcqForm) mcqForm.classList.add("is-hidden");

      // Admin tab & hamburger item strictly hidden when signed out
      if (tabAdmin) tabAdmin.classList.add("is-hidden");
      if (menuItemAdmin) menuItemAdmin.classList.add("is-hidden");

      // If user was viewing admin tab, redirect to translator
      if (window.location.hash === "#admin") {
        switchTab("translator");
      }
    }
  }

  // Auth Modal Functions
  function openAuthModal() {
    if (authModal) authModal.classList.remove("is-hidden");
    setStatus(authStatusEl, "", "");
  }

  function closeAuthModal() {
    if (authModal) authModal.classList.add("is-hidden");
  }

  if (headerSigninBtn) headerSigninBtn.addEventListener("click", openAuthModal);
  if (generatorSigninBtn) generatorSigninBtn.addEventListener("click", openAuthModal);
  if (authModalClose) authModalClose.addEventListener("click", closeAuthModal);
  if (authModalOverlay) authModalOverlay.addEventListener("click", closeAuthModal);

  // Email / Password Form Submit (Sign In Only)
  if (emailAuthForm) {
    emailAuthForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = authEmailInput ? authEmailInput.value.trim() : "";
      const password = authPasswordInput ? authPasswordInput.value.trim() : "";

      if (!email || !password) {
        setStatus(authStatusEl, "Email and password are required.", "error");
        return;
      }

      setStatus(authStatusEl, "Signing in…", "info");

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Invalid email or password.");
        }

        if (data.user && data.user.token) {
          localStorage.setItem(STORAGE_KEY_TOKEN, data.user.token);
        }

        currentUser = data.user;
        updateAuthUI();
        closeAuthModal();

        if (authEmailInput) authEmailInput.value = "";
        if (authPasswordInput) authPasswordInput.value = "";
      } catch (err) {
        setStatus(authStatusEl, err.message || "Failed to authenticate.", "error");
      }
    });
  }

  function handleAuthSuccess(u) {
    if (!u) return;
    if (u.token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, u.token);
    }
    currentUser = u;
    updateAuthUI();
    closeAuthModal();
    checkAdminAccess();
  }

  // Google OAuth Popup Trigger
  if (googleSigninBtn) {
    googleSigninBtn.addEventListener("click", async () => {
      try {
        setStatus(authStatusEl, "Connecting to Google OAuth…", "info");
        const clientRedirectUri = `${window.location.origin}/api/auth/google/callback`;
        const res = await fetch(`/api/auth/google/url?redirect_uri=${encodeURIComponent(clientRedirectUri)}`);
        const data = await res.json();

        if (!data.configured || !data.url) {
          const redirectUriToUse = data.redirectUri || clientRedirectUri;
          setStatus(
            authStatusEl,
            `Google Client ID is not configured in settings.<br><small style="opacity:0.85;display:block;margin-top:4px;">Authorized Callback URI: <code>${redirectUriToUse}</code></small>`,
            "error"
          );
          return;
        }

        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        window.open(
          data.url,
          "google_oauth_popup",
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
        );

        // Setup BroadcastChannel for cross-window messaging
        let bc = null;
        if (typeof BroadcastChannel !== "undefined") {
          try {
            bc = new BroadcastChannel("oauth_channel");
            bc.onmessage = (evt) => {
              if (evt.data && evt.data.type === "OAUTH_AUTH_SUCCESS") {
                if (pollInterval) clearInterval(pollInterval);
                if (bc) bc.close();
                handleAuthSuccess(evt.data.user);
              }
            };
          } catch (_) {}
        }

        // Poll every second for up to 60 seconds as fallback
        let pollCount = 0;
        const maxPolls = 60;
        const pollInterval = setInterval(async () => {
          pollCount++;

          // Check if popup set localStorage flag
          try {
            const raw = localStorage.getItem("oauth_auth_success");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.user && Date.now() - (parsed.timestamp || 0) < 120000) {
                localStorage.removeItem("oauth_auth_success");
                clearInterval(pollInterval);
                if (bc) bc.close();
                handleAuthSuccess(parsed.user);
                return;
              }
            }
          } catch (_) {}

          // Check session from server
          try {
            const meRes = await fetch("/api/auth/me", { headers: getAuthHeaders(), credentials: "same-origin" });
            if (meRes.ok) {
              const meData = await meRes.json();
              if (meData.user) {
                clearInterval(pollInterval);
                if (bc) bc.close();
                handleAuthSuccess(meData.user);
                return;
              }
            }
          } catch (_) {}

          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            if (bc) bc.close();
          }
        }, 1000);
      } catch (err) {
        setStatus(authStatusEl, "Failed to initiate Google OAuth flow.", "error");
      }
    });
  }

  // Listen for storage events across tabs/windows
  window.addEventListener("storage", (e) => {
    if (e.key === "oauth_auth_success" && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed && parsed.user) {
          localStorage.removeItem("oauth_auth_success");
          handleAuthSuccess(parsed.user);
        }
      } catch (_) {}
    }
  });

  // Listen for OAuth Success/Error message from popup window
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "OAUTH_AUTH_SUCCESS") {
      handleAuthSuccess(event.data.user);
    } else if (event.data && event.data.type === "OAUTH_AUTH_ERROR") {
      const errMsg = event.data.error || "Google Sign-In failed.";
      const clientRedirectUri = `${window.location.origin}/api/auth/google/callback`;
      if (errMsg.includes("redirect_uri_mismatch") || errMsg.includes("redirect_uri")) {
        setStatus(
          authStatusEl,
          `Google OAuth Redirect URI Mismatch.<br><small style="display:block;margin-top:6px;line-height:1.4;">Add this exact URL to <b>Authorized redirect URIs</b> in Google Cloud Console:<br><code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;word-break:break-all;user-select:all;display:inline-block;margin-top:4px;">${clientRedirectUri}</code></small>`,
          "error"
        );
      } else {
        setStatus(authStatusEl, errMsg, "error");
      }
    }
  });

  // Header Sign Out Handler
  if (headerLogoutBtn) {
    headerLogoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: getAuthHeaders(),
        });
      } catch (_) {}
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      currentUser = null;
      updateAuthUI();
    });
  }

  // Hamburger Menu Dropdown Listener
  if (hamburgerMenuBtn && hamburgerDropdown) {
    hamburgerMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = hamburgerDropdown.classList.contains("is-hidden");
      if (isHidden) {
        hamburgerDropdown.classList.remove("is-hidden");
        hamburgerMenuBtn.setAttribute("aria-expanded", "true");
      } else {
        hamburgerDropdown.classList.add("is-hidden");
        hamburgerMenuBtn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("click", (e) => {
      if (!hamburgerDropdown.contains(e.target) && e.target !== hamburgerMenuBtn) {
        hamburgerDropdown.classList.add("is-hidden");
        hamburgerMenuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  const bindMenuItem = (el, targetTab) => {
    if (el) {
      el.addEventListener("click", () => {
        switchTab(targetTab);
        if (hamburgerDropdown) hamburgerDropdown.classList.add("is-hidden");
        if (hamburgerMenuBtn) hamburgerMenuBtn.setAttribute("aria-expanded", "false");
      });
    }
  };

  bindMenuItem(menuItemGenerator, "generator");
  bindMenuItem(menuItemTranslator, "translator");
  bindMenuItem(menuItemGlossary, "glossary");
  bindMenuItem(menuItemAdmin, "admin");

  // Check URL Hash for Admin mode
  function checkAdminAccess() {
    const isAdmin = isUserAdmin();
    if (isAdmin) {
      if (tabAdmin) tabAdmin.classList.remove("is-hidden");
      if (menuItemAdmin) menuItemAdmin.classList.remove("is-hidden");
      if (window.location.hash === "#admin") {
        switchTab("admin");
      }
    } else {
      if (tabAdmin) tabAdmin.classList.add("is-hidden");
      if (menuItemAdmin) menuItemAdmin.classList.add("is-hidden");
      if (window.location.hash === "#admin") {
        switchTab("translator");
      }
    }
  }

  function isAdminAuthenticated() {
    return isUserAdmin();
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
    const isAdmin = isUserAdmin();

    [tabGenerator, tabTranslator, tabGlossary, tabAdmin].forEach((t) => {
      if (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      }
    });
    [viewGenerator, viewTranslator, viewGlossary, viewAdmin].forEach((v) => {
      if (v) v.classList.add("is-hidden");
    });

    [menuItemGenerator, menuItemTranslator, menuItemGlossary, menuItemAdmin].forEach((m) => {
      if (m) m.classList.remove("active");
    });

    if (target === "admin") {
      if (tabAdmin) {
        tabAdmin.classList.remove("is-hidden");
        tabAdmin.classList.add("is-active");
        tabAdmin.setAttribute("aria-selected", "true");
      }
      if (menuItemAdmin) {
        menuItemAdmin.classList.remove("is-hidden");
        menuItemAdmin.classList.add("active");
      }
      if (viewAdmin) viewAdmin.classList.remove("is-hidden");
      window.location.hash = "admin";
      updateAdminView();
    } else {
      if (window.location.hash === "#admin") {
        history.replaceState(null, "", " ");
      }
      if (!isAdmin && window.location.hash !== "#admin") {
        if (tabAdmin) tabAdmin.classList.add("is-hidden");
        if (menuItemAdmin) menuItemAdmin.classList.add("is-hidden");
      }

      if (target === "generator") {
        if (tabGenerator) {
          tabGenerator.classList.add("is-active");
          tabGenerator.setAttribute("aria-selected", "true");
        }
        if (menuItemGenerator) menuItemGenerator.classList.add("active");
        if (viewGenerator) viewGenerator.classList.remove("is-hidden");
      } else if (target === "glossary") {
        if (tabGlossary) {
          tabGlossary.classList.add("is-active");
          tabGlossary.setAttribute("aria-selected", "true");
        }
        if (menuItemGlossary) menuItemGlossary.classList.add("active");
        if (viewGlossary) viewGlossary.classList.remove("is-hidden");
        fetchGlossary();
      } else {
        // Default to Translator homepage
        if (tabTranslator) {
          tabTranslator.classList.add("is-active");
          tabTranslator.setAttribute("aria-selected", "true");
        }
        if (menuItemTranslator) menuItemTranslator.classList.add("active");
        if (viewTranslator) viewTranslator.classList.remove("is-hidden");
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

  // Admin Subtab Navigation
  if (adminSubtabUsers && adminSubtabVocab) {
    adminSubtabUsers.addEventListener("click", () => {
      adminSubtabUsers.classList.add("is-active");
      adminSubtabVocab.classList.remove("is-active");
      adminSecUsers.classList.remove("is-hidden");
      adminSecVocab.classList.add("is-hidden");
    });

    adminSubtabVocab.addEventListener("click", () => {
      adminSubtabVocab.classList.add("is-active");
      adminSubtabUsers.classList.remove("is-active");
      adminSecVocab.classList.remove("is-hidden");
      adminSecUsers.classList.add("is-hidden");
    });
  }

  // Generator Handler
  async function handleGenerate(event) {
    event.preventDefault();

    if (!currentUser) {
      openAuthModal();
      return;
    }

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
        headers: getAuthHeaders(),
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

    const apiKey = (translateApiKeyInput && translateApiKeyInput.value.trim()) || "";
    const text = translateSourceInput ? translateSourceInput.value.trim() : "";
    const model = modelInput ? modelInput.value.trim() : "gemini-3.6-flash";

    if (!text) {
      setStatus(translateStatusEl, "Please enter English text to translate.", "error");
      if (translateSourceInput) translateSourceInput.focus();
      return;
    }

    translateBtn.disabled = true;
    translateBtn.classList.add("is-loading");
    setStatus(translateStatusEl, "Translating text into Sinhala…", "info");

    try {
      const reqHeaders = { "Content-Type": "application/json" };
      const token = localStorage.getItem(STORAGE_KEY_TOKEN);
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
      const savedGuestId = localStorage.getItem("guest_id");
      if (savedGuestId) reqHeaders["x-guest-id"] = savedGuestId;

      const response = await fetch("/api/translate", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({ apiKey, text, model, guestId: savedGuestId }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Translation request failed.");
      }

      if (data.guest_id) {
        localStorage.setItem("guest_id", data.guest_id);
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

  // Admin Data & Logic
  async function fetchAdminData() {
    try {
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const [pendingRes, activeRes, usersRes, promptsRes, transRes] = await Promise.all([
        fetch("/api/admin/pending", { headers }),
        fetch("/api/vocabulary"),
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/prompts", { headers }),
        fetch("/api/admin/translations", { headers }),
      ]);

      const pending = pendingRes.ok ? await pendingRes.json() : [];
      const active = activeRes.ok ? await activeRes.json() : [];
      const users = usersRes.ok ? await usersRes.json() : [];
      adminPromptsData = promptsRes.ok ? await promptsRes.json() : [];
      adminTranslationStats = transRes.ok ? await transRes.json() : { users: [], guests: [], total: 0 };

      renderAdminPending(pending);
      renderAdminActive(active);
      renderAdminUsers(users);
      renderAdminGuests();
      renderAdminPrompts();
    } catch (err) {
      setStatus(adminStatusEl, "Error loading admin data.", "error");
    }
  }

  function renderAdminUsers(users) {
    if (!adminUsersList) return;
    adminUsersList.innerHTML = "";

    if (!users || users.length === 0) {
      adminUsersList.innerHTML = `<tr><td colspan="6" class="empty-vocab">No registered users yet.</td></tr>`;
      return;
    }

    const userStatsMap = {};
    if (adminTranslationStats && adminTranslationStats.users) {
      adminTranslationStats.users.forEach((st) => {
        userStatsMap[st.user_id] = st.count;
      });
    }

    users.forEach((u) => {
      const tr = document.createElement("tr");
      const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : "N/A";
      const authProvider = (u.auth_provider || "google").toUpperCase();
      const translationCount = userStatsMap[u.id] || 0;

      tr.innerHTML = `
        <td><strong>${escapeHtml(u.name || "User")}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="user-role-badge">${escapeHtml(authProvider)}</span></td>
        <td><span class="user-role-badge" style="${u.role === "admin" ? "color:#ef4444;" : ""}">${escapeHtml(u.role || "user")}</span></td>
        <td><strong>${translationCount}</strong></td>
        <td>${dateStr}</td>
      `;
      adminUsersList.appendChild(tr);
    });
  }

  function renderAdminGuests() {
    if (!adminGuestsList) return;
    adminGuestsList.innerHTML = "";

    const guests = adminTranslationStats?.guests || [];
    if (guests.length === 0) {
      adminGuestsList.innerHTML = `<tr><td colspan="3" class="empty-vocab">No guest translation usage recorded yet.</td></tr>`;
      return;
    }

    guests.forEach((g) => {
      const tr = document.createElement("tr");
      const dateStr = g.last_translated ? new Date(g.last_translated).toLocaleString() : "N/A";

      tr.innerHTML = `
        <td><strong>${escapeHtml(g.guest_id)}</strong></td>
        <td><strong>${g.count}</strong></td>
        <td>${dateStr}</td>
      `;
      adminGuestsList.appendChild(tr);
    });
  }

  function renderAdminPrompts() {
    if (!adminPromptsList) return;
    adminPromptsList.innerHTML = "";

    const searchTerm = (adminPromptSearch ? adminPromptSearch.value.trim().toLowerCase() : "");
    const selectedType = (adminTypeFilter ? adminTypeFilter.value.toLowerCase() : "all");

    const filtered = adminPromptsData.filter((item) => {
      const matchSearch =
        !searchTerm ||
        (item.user_email && item.user_email.toLowerCase().includes(searchTerm)) ||
        (item.user_name && item.user_name.toLowerCase().includes(searchTerm)) ||
        (item.topic && item.topic.toLowerCase().includes(searchTerm));

      const matchType = selectedType === "all" || item.qtype === selectedType;
      return matchSearch && matchType;
    });

    if (filtered.length === 0) {
      adminPromptsList.innerHTML = `<div class="empty-vocab">No question generation prompts found.</div>`;
      return;
    }

    filtered.forEach((p) => {
      const card = document.createElement("div");
      card.className = "prompt-card";

      const dateStr = p.created_at ? new Date(p.created_at).toLocaleString() : "";
      const qtypeClass = p.qtype || "normal";

      card.innerHTML = `
        <div class="prompt-card-header">
          <div class="prompt-user-info">
            <span>${escapeHtml(p.user_name || "User")}</span>
            <span class="prompt-user-email">(${escapeHtml(p.user_email || "")})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="qtype-tag ${qtypeClass}">${escapeHtml(p.qtype || "normal")}</span>
            <button type="button" class="btn-sm btn-delete prompt-delete-btn" data-id="${p.id}" style="padding: 2px 8px; font-size: 11px;">Delete</button>
          </div>
        </div>
        <div class="prompt-topic-text">${escapeHtml(p.topic || "")}</div>
        <div class="prompt-meta-footer">
          <span>Model: ${escapeHtml(p.model || "gemini-3.6-flash")}</span>
          <span>${dateStr}</span>
        </div>
      `;

      const deleteBtn = card.querySelector(".prompt-delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => deletePromptRecord(p.id));
      }

      adminPromptsList.appendChild(card);
    });
  }

  async function deletePromptRecord(id) {
    if (!id) return;
    if (!confirm("Are you sure you want to delete this question generation record?")) return;

    try {
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch(`/api/admin/prompts/${id}`, {
        method: "DELETE",
        headers,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete question generation record.");
      }

      adminPromptsData = adminPromptsData.filter((item) => item.id !== id);
      renderAdminPrompts();
      setStatus(adminStatusEl, "Question generation record deleted.", "success");
    } catch (err) {
      setStatus(adminStatusEl, err.message || "Failed to delete record.", "error");
    }
  }

  if (adminPromptSearch) {
    adminPromptSearch.addEventListener("input", renderAdminPrompts);
  }
  if (adminTypeFilter) {
    adminTypeFilter.addEventListener("change", renderAdminPrompts);
  }

  function renderAdminPending(pendingList) {
    if (!pendingListEl) return;
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
    if (!adminActiveListEl) return;
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
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers,
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
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers,
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
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/add", {
        method: "POST",
        headers,
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
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/delete", {
        method: "DELETE",
        headers,
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

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initialization
  initApiKey();
  checkCurrentUserSession();
  checkAdminAccess();
})();
