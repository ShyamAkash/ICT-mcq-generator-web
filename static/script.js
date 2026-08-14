(() => {
  "use strict";

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Navigation Tabs & Hamburger Menu
  const tabGenerator = document.getElementById("tab-generator");
  const tabTranslator = document.getElementById("tab-translator");
  const tabDocx = document.getElementById("tab-docx");
  const tabGlossary = document.getElementById("tab-glossary");
  const tabAdmin = document.getElementById("tab-admin");

  const hamburgerMenuBtn = document.getElementById("hamburger-menu-btn");
  const hamburgerDropdown = document.getElementById("hamburger-dropdown");
  const menuItemGenerator = document.getElementById("menu-item-generator");
  const menuItemTranslator = document.getElementById("menu-item-translator");
  const menuItemDocx = document.getElementById("menu-item-docx");
  const menuItemGlossary = document.getElementById("menu-item-glossary");
  const menuItemAdmin = document.getElementById("menu-item-admin");

  const viewGenerator = document.getElementById("view-generator");
  const viewTranslator = document.getElementById("view-translator");
  const viewDocx = document.getElementById("view-docx");
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
  const translateModelInput = document.getElementById("translate-model");
  const docxApiKeyInput = document.getElementById("docx-api-key");
  const docxModelInput = document.getElementById("docx-model");
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
  const adminSubtabModels = document.getElementById("admin-subtab-models");
  const adminSecUsers = document.getElementById("admin-sec-users");
  const adminSecVocab = document.getElementById("admin-sec-vocab");
  const adminSecModels = document.getElementById("admin-sec-models");

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

  const adminAddModelForm = document.getElementById("admin-add-model-form");
  const adminModelNameInput = document.getElementById("admin-model-name");
  const adminModelStatusEl = document.getElementById("admin-model-status");
  const adminModelsListEl = document.getElementById("admin-models-list");

  const adminDefaultModelsForm = document.getElementById("admin-default-models-form");
  const adminDefaultGeneratorModel = document.getElementById("admin-default-generator-model");
  const adminDefaultTranslatorModel = document.getElementById("admin-default-translator-model");
  const adminDefaultDocxModel = document.getElementById("admin-default-docx-model");
  const adminDefaultModelsStatusEl = document.getElementById("admin-default-models-status");

  let adminPromptsData = [];
  let adminTranslationStats = { users: [], guests: [], total: 0 };

  // LocalStorage Keys
  const STORAGE_KEY_API = "gemini_api_key";
  const STORAGE_KEY_TOKEN = "auth_session_token";

  function getAuthHeaders() {
    let token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (token === "[object Object]" || (token && token.startsWith("{"))) {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      token = null;
    }
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  function getUserApiKey() {
    return (
      (docxApiKeyInput ? docxApiKeyInput.value.trim() : "") ||
      (translateApiKeyInput ? translateApiKeyInput.value.trim() : "") ||
      (apiKeyInput ? apiKeyInput.value.trim() : "") ||
      localStorage.getItem(STORAGE_KEY_API) ||
      ""
    );
  }

  let keyUsageDebounceTimer = null;

  function updateKeyUsageUI(data) {
    if (!data) return;

    const cards = [
      {
        badge: document.getElementById("translate-key-badge"),
        count: document.getElementById("translate-key-count"),
        remaining: document.getElementById("translate-key-remaining"),
        fill: document.getElementById("translate-key-fill"),
      },
      {
        badge: document.getElementById("generator-key-badge"),
        count: document.getElementById("generator-key-count"),
        remaining: document.getElementById("generator-key-remaining"),
        fill: document.getElementById("generator-key-fill"),
      },
      {
        badge: document.getElementById("docx-key-badge"),
        count: document.getElementById("docx-key-count"),
        remaining: document.getElementById("docx-key-remaining"),
        fill: document.getElementById("docx-key-fill"),
      },
    ];

    cards.forEach((c) => {
      if (c.badge) {
        c.badge.textContent = data.isDefault ? "Default Server Key" : data.label;
        if (data.isDefault) {
          c.badge.classList.add("default-key");
          c.badge.classList.remove("custom-key");
        } else {
          c.badge.classList.add("custom-key");
          c.badge.classList.remove("default-key");
        }
      }

      if (c.count) {
        c.count.textContent = `${(data.usedToday || 0).toLocaleString()} / ${(data.dailyLimit || 1500).toLocaleString()} reqs`;
      }

      if (c.remaining) {
        c.remaining.textContent = `(${(data.remainingToday || 0).toLocaleString()} remaining)`;
      }

      if (c.fill) {
        const pct = Math.min(100, Math.max(0, data.percentage || 0));
        c.fill.style.width = `${pct}%`;

        c.fill.classList.remove("normal", "warning", "danger");
        if (pct > 90) {
          c.fill.classList.add("danger");
        } else if (pct > 70) {
          c.fill.classList.add("warning");
        } else {
          c.fill.classList.add("normal");
        }
      }
    });
  }

  async function refreshKeyUsage(providedKey) {
    const keyToQuery = providedKey !== undefined ? providedKey : getUserApiKey();
    try {
      const url = keyToQuery
        ? `/api/key-usage?apiKey=${encodeURIComponent(keyToQuery)}`
        : "/api/key-usage";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        updateKeyUsageUI(data);
      }
    } catch (err) {
      console.warn("Could not refresh key usage:", err);
    }
  }

  function scheduleKeyUsageRefresh(val) {
    if (keyUsageDebounceTimer) clearTimeout(keyUsageDebounceTimer);
    keyUsageDebounceTimer = setTimeout(() => {
      refreshKeyUsage(val);
    }, 250);
  }

  function initApiKey() {
    const savedKey = localStorage.getItem(STORAGE_KEY_API) || "";
    if (apiKeyInput) apiKeyInput.value = savedKey;
    if (translateApiKeyInput) translateApiKeyInput.value = savedKey;
    if (docxApiKeyInput) docxApiKeyInput.value = savedKey;

    refreshKeyUsage(savedKey);

    const syncApiKey = (val) => {
      if (val) {
        localStorage.setItem(STORAGE_KEY_API, val);
      } else {
        localStorage.removeItem(STORAGE_KEY_API);
      }
      if (apiKeyInput && apiKeyInput.value !== val) apiKeyInput.value = val;
      if (translateApiKeyInput && translateApiKeyInput.value !== val) translateApiKeyInput.value = val;
      if (docxApiKeyInput && docxApiKeyInput.value !== val) docxApiKeyInput.value = val;

      scheduleKeyUsageRefresh(val);
    };

    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", () => {
        syncApiKey(apiKeyInput.value.trim());
      });
      apiKeyInput.addEventListener("change", () => {
        syncApiKey(apiKeyInput.value.trim());
      });
    }
    if (translateApiKeyInput) {
      translateApiKeyInput.addEventListener("input", () => {
        syncApiKey(translateApiKeyInput.value.trim());
      });
      translateApiKeyInput.addEventListener("change", () => {
        syncApiKey(translateApiKeyInput.value.trim());
      });
    }
    if (docxApiKeyInput) {
      docxApiKeyInput.addEventListener("input", () => {
        syncApiKey(docxApiKeyInput.value.trim());
      });
      docxApiKeyInput.addEventListener("change", () => {
        syncApiKey(docxApiKeyInput.value.trim());
      });
    }

    // Auto refresh usage periodically (every 12 seconds)
    setInterval(() => {
      refreshKeyUsage();
    }, 12000);
  }

  function formatFriendlyErrorMessage(msg) {
    if (!msg || typeof msg !== "string") return msg || "";
    if (
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("exceeded your current quota") ||
      msg.includes("Quota exceeded") ||
      msg.includes("rate-limits") ||
      msg.includes("rate_limit_exceeded")
    ) {
      return "Default API key has exceeded its limit for this specific model. Try adding your own API key or change the Gemini model.";
    }
    if (
      msg.includes("503") ||
      msg.includes("experiencing high demand") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("spikes in demand") ||
      msg.includes("overloaded")
    ) {
      return "This model is currently experiencing high demand. Try changing the Gemini model used.";
    }
    return msg;
  }

  // Helper for status messages
  function setStatus(el, message, kind) {
    if (!el) return;
    const finalMsg = kind === "error" ? formatFriendlyErrorMessage(message) : (message || "");
    el.textContent = finalMsg;
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

      const userRole = (currentUser.role || "user").toLowerCase();
      let roleLabel = "User";
      if (isAdmin) {
        roleLabel = "Admin";
      } else if (userRole === "academic_staff" || userRole === "academic staff") {
        roleLabel = "Academic Staff";
      } else if (currentUser.role) {
        roleLabel = currentUser.role;
      }

      if (userRoleBadgeEl) userRoleBadgeEl.textContent = roleLabel;

      if (currentUser.picture && userAvatarEl) {
        userAvatarEl.src = currentUser.picture;
        userAvatarEl.style.display = "block";
      } else if (userAvatarEl) {
        userAvatarEl.style.display = "none";
      }

      // Update Glossary / Suggest UI based on role privileges
      const suggestHeading = document.getElementById("suggest-heading");
      const suggestRoleNote = document.getElementById("suggest-role-note");
      const suggestBtn = document.getElementById("suggest-btn");
      const isAcademicOrAdmin = isAdmin || userRole === "academic_staff" || userRole === "academic staff";

      if (suggestHeading) {
        suggestHeading.textContent = isAcademicOrAdmin ? "Add Word Mapping to Prompt" : "Suggest a Translation";
      }
      if (suggestRoleNote) {
        if (isAcademicOrAdmin) {
          suggestRoleNote.textContent = "Academic Staff Privilege: Word mappings submitted by you are added directly to the prompt without requiring approval.";
          suggestRoleNote.style.display = "block";
        } else {
          suggestRoleNote.style.display = "none";
        }
      }
      if (suggestBtn) {
        suggestBtn.textContent = isAcademicOrAdmin ? "Add Mapping Directly" : "Submit Suggestion";
      }

      // MCQ Generator access
      if (generatorAuthBanner) generatorAuthBanner.classList.add("is-hidden");
      if (mcqForm) mcqForm.classList.remove("is-hidden");
      const mcqUserNameCardEl = document.getElementById("mcq-user-name-card");
      const mcqUsedNameInputEl = document.getElementById("mcq-used-name-input");
      if (mcqUserNameCardEl) {
        if (typeof mcqMode !== "undefined" && mcqMode === "multi") {
          mcqUserNameCardEl.classList.remove("is-hidden");
        } else {
          mcqUserNameCardEl.classList.add("is-hidden");
        }
      }
      if (mcqUsedNameInputEl && (!mcqUsedNameInputEl.value || mcqUsedNameInputEl.value === "Shyam")) {
        if (typeof getUserFirstName === "function") {
          mcqUsedNameInputEl.value = getUserFirstName();
        } else {
          mcqUsedNameInputEl.value = (currentUser.name || "Shyam").trim().split(/\s+/)[0] || "Shyam";
        }
      }

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

      const suggestHeading = document.getElementById("suggest-heading");
      const suggestRoleNote = document.getElementById("suggest-role-note");
      const suggestBtn = document.getElementById("suggest-btn");

      if (suggestHeading) suggestHeading.textContent = "Suggest a Translation";
      if (suggestRoleNote) suggestRoleNote.style.display = "none";
      if (suggestBtn) suggestBtn.textContent = "Submit Suggestion";

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
    const tokenStr = typeof u.token === "object" ? u.token?.id : u.token;
    if (tokenStr && typeof tokenStr === "string") {
      localStorage.setItem(STORAGE_KEY_TOKEN, tokenStr);
    }
    currentUser = u;
    updateAuthUI();
    closeAuthModal();
    checkAdminAccess();
  }

  async function handleGoogleCredential(credential) {
    try {
      setStatus(authStatusEl, "Signing in with Google…", "info");
      const res = await fetch("/api/auth/google/credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Google Sign-In failed.");
      }
      handleAuthSuccess(data.user);
      setStatus(authStatusEl, "Successfully signed in!", "success");
    } catch (err) {
      setStatus(authStatusEl, err.message || "Failed to sign in with Google.", "error");
    }
  }

  let gisInitialized = false;

  async function initGoogleAuth() {
    try {
      const configRes = await fetch("/api/auth/google/config");
      const configData = await configRes.json();

      if (!configData.configured || !configData.clientId) {
        if (googleSigninBtn) googleSigninBtn.style.display = "flex";
        return;
      }

      const clientId = configData.clientId;

      function renderGsiButton() {
        if (typeof google === "undefined" || !google.accounts || !google.accounts.id) {
          setTimeout(renderGsiButton, 200);
          return;
        }
        try {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              if (response && response.credential) {
                await handleGoogleCredential(response.credential);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          gisInitialized = true;

          const container = document.getElementById("g_id_signin");
          if (container) {
            container.innerHTML = "";
            google.accounts.id.renderButton(container, {
              theme: "outline",
              size: "large",
              type: "standard",
              text: "continue_with",
              shape: "rectangular",
              width: 280,
            });
            if (googleSigninBtn) googleSigninBtn.style.display = "none";
          }
        } catch (err) {
          console.error("GIS initialization error:", err);
          if (googleSigninBtn) googleSigninBtn.style.display = "flex";
        }
      }

      renderGsiButton();
    } catch (err) {
      if (googleSigninBtn) googleSigninBtn.style.display = "flex";
    }
  }

  // Initialize Google Auth on page load
  initGoogleAuth();

  // Fallback Google OAuth Trigger
  if (googleSigninBtn) {
    googleSigninBtn.addEventListener("click", async () => {
      if (gisInitialized && typeof google !== "undefined" && google.accounts && google.accounts.id) {
        google.accounts.id.prompt();
        return;
      }
      try {
        setStatus(authStatusEl, "Connecting to Google OAuth…", "info");
        const clientRedirectUri = `${window.location.origin}/api/auth/google/callback`;
        const res = await fetch(`/api/auth/google/url?redirect_uri=${encodeURIComponent(clientRedirectUri)}`);
        const data = await res.json();

        if (!data.configured || !data.url) {
          const redirectUriToUse = data.redirectUri || clientRedirectUri;
          setStatus(
            authStatusEl,
            `Google Client ID is not configured.<br><small style="opacity:0.85;display:block;margin-top:4px;">Authorized Callback URI: <code>${redirectUriToUse}</code></small>`,
            "error"
          );
          return;
        }

        window.location.href = data.url;
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
  bindMenuItem(menuItemDocx, "docx");
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

    [tabGenerator, tabTranslator, tabDocx, tabGlossary, tabAdmin].forEach((t) => {
      if (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      }
    });
    [viewGenerator, viewTranslator, viewDocx, viewGlossary, viewAdmin].forEach((v) => {
      if (v) v.classList.add("is-hidden");
    });

    [menuItemGenerator, menuItemTranslator, menuItemDocx, menuItemGlossary, menuItemAdmin].forEach((m) => {
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
      } else if (target === "docx") {
        if (tabDocx) {
          tabDocx.classList.add("is-active");
          tabDocx.setAttribute("aria-selected", "true");
        }
        if (menuItemDocx) menuItemDocx.classList.add("active");
        if (viewDocx) viewDocx.classList.remove("is-hidden");
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
  if (tabDocx) tabDocx.addEventListener("click", () => switchTab("docx"));
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
      if (adminSubtabVocab) adminSubtabVocab.classList.remove("is-active");
      if (adminSubtabModels) adminSubtabModels.classList.remove("is-active");
      if (adminSecUsers) adminSecUsers.classList.remove("is-hidden");
      if (adminSecVocab) adminSecVocab.classList.add("is-hidden");
      if (adminSecModels) adminSecModels.classList.add("is-hidden");
    });

    adminSubtabVocab.addEventListener("click", () => {
      adminSubtabVocab.classList.add("is-active");
      if (adminSubtabUsers) adminSubtabUsers.classList.remove("is-active");
      if (adminSubtabModels) adminSubtabModels.classList.remove("is-active");
      if (adminSecVocab) adminSecVocab.classList.remove("is-hidden");
      if (adminSecUsers) adminSecUsers.classList.add("is-hidden");
      if (adminSecModels) adminSecModels.classList.add("is-hidden");
    });

    if (adminSubtabModels) {
      adminSubtabModels.addEventListener("click", () => {
        adminSubtabModels.classList.add("is-active");
        if (adminSubtabUsers) adminSubtabUsers.classList.remove("is-active");
        if (adminSubtabVocab) adminSubtabVocab.classList.remove("is-active");
        if (adminSecModels) adminSecModels.classList.remove("is-hidden");
        if (adminSecUsers) adminSecUsers.classList.add("is-hidden");
        if (adminSecVocab) adminSecVocab.classList.add("is-hidden");
      });
    }
  }

  // Multi-Question & Filename Presets State
  let mcqMode = "single"; // "single" | "multi"
  let multiQuestions = []; // Array of { resdict, qtype, topic }
  let customUsedName = localStorage.getItem("mcq_used_name") || "";

  const PRESET_FILENAMES = {
    "Day Paper": "Shyam 2027 PHY 57 MCQ 1,2,3",
    "REV Paper": "Shyam 2026 REV 19 MCQ 13,14,15",
    "Main Paper": "2027 main paper 2 Shyam questions",
    "Daily Quiz": "2028 Quiz [17,19,20,23] Shyam"
  };

  const mcqModeSingleBtn = document.getElementById("mcq-mode-single");
  const mcqModeMultiBtn = document.getElementById("mcq-mode-multi");
  const multiCountBadge = document.getElementById("multi-count-badge");
  const singleFilenameBox = document.getElementById("single-filename-box");
  const singleDocxFilenameInput = document.getElementById("single-docx-filename");
  const multiDocPanel = document.getElementById("multi-doc-panel");
  const multiDocCountEl = document.getElementById("multi-doc-count");
  const multiQuestionsListEl = document.getElementById("multi-questions-list");
  const clearMultiDocBtn = document.getElementById("clear-multi-doc-btn");
  const multiDocxFilenameInput = document.getElementById("multi-docx-filename");
  const downloadMultiDocxBtn = document.getElementById("download-multi-docx-btn");
  const mcqUserNameCard = document.getElementById("mcq-user-name-card");
  const mcqUsedNameInput = document.getElementById("mcq-used-name-input");
  const saveMcqUsedNameBtn = document.getElementById("save-mcq-used-name-btn");
  const mcqUsedNameStatus = document.getElementById("mcq-used-name-status");

  // Summary Stats Card Elements
  const statsTotalCountEl = document.getElementById("stats-total-count");
  const statsTypeCountsEl = document.getElementById("stats-type-counts");
  const statsPromptsListEl = document.getElementById("stats-prompts-list");

  // Question Preview Modal Elements
  const qPreviewModal = document.getElementById("q-preview-modal");
  const qPreviewOverlay = document.getElementById("q-preview-overlay");
  const qPreviewCloseBtn = document.getElementById("q-preview-close");
  const qPreviewDoneBtn = document.getElementById("q-preview-done-btn");
  const qPreviewPrevBtn = document.getElementById("q-preview-prev-btn");
  const qPreviewNextBtn = document.getElementById("q-preview-next-btn");
  const qPreviewIndexBadge = document.getElementById("q-preview-index-badge");
  const qPreviewTypeBadge = document.getElementById("q-preview-type-badge");
  const qPreviewAnsBadge = document.getElementById("q-preview-ans-badge");
  const qPreviewTitle = document.getElementById("q-preview-title");
  const qPreviewBody = document.getElementById("q-preview-body");
  const qPreviewCounter = document.getElementById("q-preview-counter");

  let currentPreviewIndex = 0;

  function openQuestionPreview(index) {
    if (!qPreviewModal || multiQuestions.length === 0) return;
    if (index < 0) index = 0;
    if (index >= multiQuestions.length) index = multiQuestions.length - 1;
    currentPreviewIndex = index;
    renderQuestionPreview(currentPreviewIndex);
    qPreviewModal.classList.remove("is-hidden");
  }

  function closeQuestionPreview() {
    if (!qPreviewModal) return;
    qPreviewModal.classList.add("is-hidden");
  }

  function renderQuestionPreview(index) {
    const item = multiQuestions[index];
    if (!item) return;
    const resdict = item.resdict || {};
    const qtype = (item.qtype || resdict.QType || "normal").toLowerCase();
    const rawTopic = item.topic || `Question #${index + 1}`;
    const ansNo = parseInt(resdict.AnsNo ?? resdict.ansNo ?? 1, 10);

    if (qPreviewIndexBadge) qPreviewIndexBadge.textContent = `Question #${index + 1}`;
    if (qPreviewTypeBadge) {
      qPreviewTypeBadge.textContent = qtype.toUpperCase();
      qPreviewTypeBadge.className = `q-type-tag ${qtype}`;
    }
    if (qPreviewAnsBadge) {
      qPreviewAnsBadge.textContent = `Ans: Option #${ansNo || 1}`;
    }
    if (qPreviewTitle) {
      qPreviewTitle.textContent = rawTopic;
      qPreviewTitle.title = rawTopic;
    }
    if (qPreviewCounter) {
      qPreviewCounter.textContent = `${index + 1} of ${multiQuestions.length}`;
    }
    if (qPreviewPrevBtn) {
      qPreviewPrevBtn.disabled = index === 0;
    }
    if (qPreviewNextBtn) {
      qPreviewNextBtn.disabled = index === multiQuestions.length - 1;
    }

    if (!qPreviewBody) return;

    let bodyHtml = "";

    // 1. Question (English)
    const qEngText = resdict["QEng"] || resdict["Question English"] || rawTopic;
    bodyHtml += `
      <div class="q-preview-section">
        <div class="q-preview-section-title">Question (English)</div>
        <div class="q-preview-text-box">${escapeHtml(qEngText)}</div>
      </div>
    `;

    // Code snippet (if code type or resdict.Code exists)
    const codeSnippet = resdict["Code"] || resdict["codelines"] || "";
    if (codeSnippet) {
      bodyHtml += `
        <div class="q-preview-section">
          <div class="q-preview-section-title">Code Snippet</div>
          <pre class="q-preview-code-block"><code>${escapeHtml(codeSnippet)}</code></pre>
        </div>
      `;
    }

    // Statements (if statement type or resdict.StatementsEng exists)
    const statementsEng = resdict["StatementsEng"] || [
      resdict["StateAEng"],
      resdict["StateBEng"],
      resdict["StateCEng"]
    ].filter(Boolean);

    if (statementsEng && statementsEng.length > 0) {
      const labels = ["(A)", "(B)", "(C)", "(D)", "(E)"];
      const statementsItems = statementsEng
        .map((stmt, sIdx) => `
          <div class="q-preview-statement-item">
            <span class="q-statement-label">${labels[sIdx] || `(${sIdx + 1})`}</span>
            <span>${escapeHtml(stmt || "")}</span>
          </div>
        `)
        .join("");

      bodyHtml += `
        <div class="q-preview-section">
          <div class="q-preview-section-title">Statements (English)</div>
          <div class="q-preview-statements-list">
            ${statementsItems}
          </div>
        </div>
      `;
    }

    // 2. Answer Options (English)
    const answersEng = resdict["AnswersEng"] || [
      resdict["Answer 1 English"],
      resdict["Answer 2 English"],
      resdict["Answer 3 English"],
      resdict["Answer 4 English"],
      resdict["Answer 5 English"]
    ];

    if (answersEng && answersEng.length > 0) {
      const optionsHtml = answersEng
        .map((opt, oIdx) => {
          const optNum = oIdx + 1;
          const isCorrect = optNum === ansNo;
          return `
            <div class="q-preview-option-item ${isCorrect ? "is-correct" : ""}">
              <span class="q-option-num">(${optNum})</span>
              <span class="q-option-text">${escapeHtml(opt || `Option ${optNum}`)}</span>
              ${isCorrect ? '<span class="q-correct-tag">&#10003; Correct Answer</span>' : ""}
            </div>
          `;
        })
        .join("");

      bodyHtml += `
        <div class="q-preview-section">
          <div class="q-preview-section-title">Answer Options (English)</div>
          <div class="q-preview-options-list">
            ${optionsHtml}
          </div>
        </div>
      `;
    }

    // 3. Explanation (English)
    const explEng = resdict["ExplEng"] || resdict["ExplanationEnglish"] || [
      resdict["Explanation 1 English"] || resdict["ExplAEng"],
      resdict["Explanation 2 English"] || resdict["ExplBEng"],
      resdict["Explanation 3 English"] || resdict["ExplCEng"],
      resdict["Explanation 4 English"],
      resdict["Explanation 5 English"]
    ].filter(Boolean);

    let explContentHtml = "";
    if (Array.isArray(explEng)) {
      explContentHtml = explEng
        .map((itemExp, eIdx) => {
          if (!itemExp) return "";
          let label = `Option (${eIdx + 1})`;
          if (qtype === "statement") {
            const letters = ["A", "B", "C", "D", "E"];
            label = `Statement (${letters[eIdx] || eIdx + 1})`;
          }
          return `
            <div class="q-preview-expl-item">
              <span class="q-preview-expl-label">${label}</span>
              <div>${escapeHtml(itemExp)}</div>
            </div>
          `;
        })
        .join("");
    } else if (typeof explEng === "string" && explEng.trim()) {
      explContentHtml = `
        <div class="q-preview-expl-item">
          <div>${escapeHtml(explEng)}</div>
        </div>
      `;
    }

    if (explContentHtml) {
      bodyHtml += `
        <div class="q-preview-section">
          <div class="q-preview-section-title">Explanation (English)</div>
          <div class="q-preview-expl-card">
            ${explContentHtml}
          </div>
        </div>
      `;
    }

    // 4. Sinhala Translation section (collapsible)
    const qSinText = resdict["QSin"] || resdict["Question Sinhala"] || "";
    const answersSin = resdict["AnswersSin"] || [];
    if (qSinText || (answersSin && answersSin.length > 0)) {
      bodyHtml += `
        <div class="q-preview-section">
          <button type="button" class="q-preview-sinhala-toggle" id="q-preview-sinhala-btn">
            <span>Sinhala Translation Data (සිංහල)</span>
            <span id="q-preview-sinhala-arrow">&#9660;</span>
          </button>
          <div id="q-preview-sinhala-box" class="q-preview-sinhala-box is-hidden">
            ${qSinText ? `<div><strong>ප්‍රශ්නය:</strong> ${escapeHtml(qSinText)}</div>` : ""}
            ${answersSin && answersSin.length > 0 ? `
              <div style="margin-top: 6px;">
                <strong>පිළිතුරු:</strong>
                <ol style="margin: 4px 0 0 18px; padding: 0;">
                  ${answersSin.map((sAns) => `<li>${escapeHtml(sAns || "")}</li>`).join("")}
                </ol>
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }

    qPreviewBody.innerHTML = bodyHtml;

    // Attach Sinhala toggle listener
    const sinhalaToggleBtn = document.getElementById("q-preview-sinhala-btn");
    const sinhalaBox = document.getElementById("q-preview-sinhala-box");
    const sinhalaArrow = document.getElementById("q-preview-sinhala-arrow");
    if (sinhalaToggleBtn && sinhalaBox) {
      sinhalaToggleBtn.addEventListener("click", () => {
        const isHidden = sinhalaBox.classList.toggle("is-hidden");
        if (sinhalaArrow) {
          sinhalaArrow.innerHTML = isHidden ? "&#9660;" : "&#9650;";
        }
      });
    }
  }

  // Modal event listeners
  if (qPreviewCloseBtn) qPreviewCloseBtn.addEventListener("click", closeQuestionPreview);
  if (qPreviewDoneBtn) qPreviewDoneBtn.addEventListener("click", closeQuestionPreview);
  if (qPreviewOverlay) qPreviewOverlay.addEventListener("click", closeQuestionPreview);
  if (qPreviewPrevBtn) {
    qPreviewPrevBtn.addEventListener("click", () => {
      if (currentPreviewIndex > 0) openQuestionPreview(currentPreviewIndex - 1);
    });
  }
  if (qPreviewNextBtn) {
    qPreviewNextBtn.addEventListener("click", () => {
      if (currentPreviewIndex < multiQuestions.length - 1) openQuestionPreview(currentPreviewIndex + 1);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (qPreviewModal && !qPreviewModal.classList.contains("is-hidden")) {
      if (e.key === "Escape") {
        closeQuestionPreview();
      } else if (e.key === "ArrowLeft" && currentPreviewIndex > 0) {
        openQuestionPreview(currentPreviewIndex - 1);
      } else if (e.key === "ArrowRight" && currentPreviewIndex < multiQuestions.length - 1) {
        openQuestionPreview(currentPreviewIndex + 1);
      }
    }
  });

  function getUserFirstName() {
    if (customUsedName && customUsedName.trim()) {
      return customUsedName.trim();
    }
    const fullName = currentUser?.name || currentUser?.email || "Shyam";
    const firstName = fullName.trim().split(/\s+/)[0] || "Shyam";
    return firstName;
  }

  function getFormattedPreset(presetKey) {
    const template = PRESET_FILENAMES[presetKey] || "";
    const firstName = getUserFirstName();
    return template.replace(/\bShyam\b/g, firstName);
  }

  // Save used name listener
  if (saveMcqUsedNameBtn && mcqUsedNameInput) {
    saveMcqUsedNameBtn.addEventListener("click", async () => {
      const newName = mcqUsedNameInput.value.trim();
      if (!newName) {
        setStatus(mcqUsedNameStatus, "Please enter a valid name.", "error");
        return;
      }
      customUsedName = newName;
      localStorage.setItem("mcq_used_name", newName);

      if (currentUser) {
        try {
          setStatus(mcqUsedNameStatus, "Saving name...", "info");
          const res = await fetch("/api/user/update-name", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ name: newName })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              currentUser = data.user;
              if (userNameDisplayEl) userNameDisplayEl.textContent = currentUser.name;
            }
            setStatus(mcqUsedNameStatus, "Name saved!", "success");
          } else {
            setStatus(mcqUsedNameStatus, "Name saved locally.", "success");
          }
        } catch (_) {
          setStatus(mcqUsedNameStatus, "Name saved locally.", "success");
        }
      } else {
        setStatus(mcqUsedNameStatus, "Name saved locally.", "success");
      }

      setTimeout(() => {
        setStatus(mcqUsedNameStatus, "", "");
      }, 3000);
    });
  }

  function updateDownloadButtonState() {
    if (!downloadMultiDocxBtn) return;
    const hasQuestions = multiQuestions.length > 0;
    const filenameVal = multiDocxFilenameInput ? multiDocxFilenameInput.value.trim() : "";
    const hasRenameFormat = filenameVal.length > 0;

    const isReady = hasQuestions && hasRenameFormat;
    downloadMultiDocxBtn.disabled = !isReady;

    if (!hasQuestions) {
      downloadMultiDocxBtn.title = "Add at least one question to enable download";
    } else if (!hasRenameFormat) {
      downloadMultiDocxBtn.title = "Select or type a rename format for document file name to enable download";
    } else {
      downloadMultiDocxBtn.title = "Download combined .docx document";
    }
  }

  if (multiDocxFilenameInput) {
    multiDocxFilenameInput.addEventListener("input", updateDownloadButtonState);
    multiDocxFilenameInput.addEventListener("change", updateDownloadButtonState);
  }

  // Filename preset buttons listener
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const presetKey = btn.dataset.preset;
      const target = btn.dataset.target;
      const formatted = getFormattedPreset(presetKey);

      if (target === "single" && singleDocxFilenameInput) {
        singleDocxFilenameInput.value = formatted;
      } else if (target === "multi" && multiDocxFilenameInput) {
        multiDocxFilenameInput.value = formatted;
      }

      const parentGroup = btn.closest(".filename-presets-group");
      if (parentGroup) {
        parentGroup.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      }

      updateDownloadButtonState();
    });
  });

  // Mode Switch Listeners
  if (mcqModeSingleBtn && mcqModeMultiBtn) {
    mcqModeSingleBtn.addEventListener("click", () => {
      mcqMode = "single";
      mcqModeSingleBtn.classList.add("is-active");
      mcqModeMultiBtn.classList.remove("is-active");

      if (singleFilenameBox) singleFilenameBox.style.display = "none";
      if (mcqUserNameCard) mcqUserNameCard.classList.add("is-hidden");
      if (multiDocPanel) multiDocPanel.classList.add("is-hidden");

      if (generateBtn) {
        const label = generateBtn.querySelector(".generate-btn__label");
        if (label) label.textContent = "Generate .docx";
      }
    });

    mcqModeMultiBtn.addEventListener("click", () => {
      mcqMode = "multi";
      mcqModeMultiBtn.classList.add("is-active");
      mcqModeSingleBtn.classList.remove("is-active");

      if (singleFilenameBox) singleFilenameBox.style.display = "none";
      if (mcqUserNameCard && currentUser) mcqUserNameCard.classList.remove("is-hidden");
      if (multiDocPanel) multiDocPanel.classList.remove("is-hidden");

      if (generateBtn) {
        const label = generateBtn.querySelector(".generate-btn__label");
        if (label) label.textContent = "Add Question to Document";
      }
    });
  }

  // Render Multi-Questions List
  function renderMultiQuestionsList() {
    if (!multiDocCountEl || !multiQuestionsListEl) return;

    multiDocCountEl.textContent = `${multiQuestions.length} Question${multiQuestions.length === 1 ? "" : "s"}`;

    if (multiCountBadge) {
      multiCountBadge.textContent = multiQuestions.length;
      multiCountBadge.style.display = multiQuestions.length > 0 ? "inline-block" : "none";
    }

    updateDownloadButtonState();

    // Update Summary Stats Card
    if (statsTotalCountEl) {
      statsTotalCountEl.textContent = multiQuestions.length;
    }

    if (statsTypeCountsEl) {
      const counts = { normal: 0, statement: 0, code: 0 };
      multiQuestions.forEach((q) => {
        const type = (q.qtype || "normal").toLowerCase();
        counts[type] = (counts[type] || 0) + 1;
      });

      statsTypeCountsEl.innerHTML = `
        <span class="type-badge" data-type="normal" data-active="${counts.normal > 0}">Normal: ${counts.normal}</span>
        <span class="type-badge" data-type="statement" data-active="${counts.statement > 0}">Statement: ${counts.statement}</span>
        <span class="type-badge" data-type="code" data-active="${counts.code > 0}">Code: ${counts.code}</span>
      `;
    }

    if (statsPromptsListEl) {
      if (multiQuestions.length === 0) {
        statsPromptsListEl.innerHTML = `<span class="empty-stats-text">No questions generated in this session yet.</span>`;
      } else {
        statsPromptsListEl.innerHTML = multiQuestions
          .map((item, idx) => {
            const rawTopic = item.topic || `Question #${idx + 1}`;
            const shortTopic = rawTopic.length > 55 ? rawTopic.slice(0, 55) + "…" : rawTopic;
            const qtype = (item.qtype || "normal").toUpperCase();
            return `
              <div class="stats-item-row" data-index="${idx}" title="Click to preview question #${idx + 1}">
                <span class="stats-q-num">#${idx + 1}</span>
                <span class="stats-q-badge">${qtype}</span>
                <span class="stats-prompt-text">${escapeHtml(shortTopic)}</span>
                <span style="font-size: 11px; opacity: 0.6; margin-left: auto;">&#128065; Preview</span>
              </div>
            `;
          })
          .join("");

        statsPromptsListEl.querySelectorAll(".stats-item-row").forEach((row) => {
          row.addEventListener("click", () => {
            const idx = parseInt(row.dataset.index, 10);
            if (!isNaN(idx)) openQuestionPreview(idx);
          });
        });
      }
    }

    if (multiQuestions.length === 0) {
      multiQuestionsListEl.innerHTML = `<p class="empty-list-msg">No questions added yet. Fill out the form above and click "Add Question to Document" to generate multiple questions for a single docx file.</p>`;
      return;
    }

    multiQuestionsListEl.innerHTML = "";
    multiQuestions.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "question-item";
      card.setAttribute("draggable", "true");
      card.dataset.index = index;

      // Drag Grip Handle
      const dragHandle = document.createElement("div");
      dragHandle.className = "q-drag-handle";
      dragHandle.title = "Drag to reorder sequence";
      dragHandle.innerHTML = "⋮⋮";

      const info = document.createElement("div");
      info.className = "q-item-info";
      info.title = "Click to preview question details";
      info.addEventListener("click", () => {
        openQuestionPreview(index);
      });

      const title = document.createElement("div");
      title.className = "q-item-title";
      const topicSnippet = (item.topic || "Question #" + (index + 1)).slice(0, 60);
      title.textContent = `${index + 1}. ${topicSnippet}`;

      const meta = document.createElement("div");
      meta.className = "q-item-meta";
      meta.innerHTML = `
        <span>Type: <strong class="q-type-tag">${item.qtype || "normal"}</strong></span>
        <span style="color: var(--accent); font-size: 11px; opacity: 0.85;">&#128065; Click to preview</span>
      `;

      info.appendChild(title);
      info.appendChild(meta);

      // Actions Group (Preview, Move Up, Move Down, Remove)
      const actionsGroup = document.createElement("div");
      actionsGroup.className = "q-actions-group";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "q-preview-btn";
      previewBtn.innerHTML = "&#128065; Preview";
      previewBtn.title = "Preview question details";
      previewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openQuestionPreview(index);
      });

      const moveUpBtn = document.createElement("button");
      moveUpBtn.type = "button";
      moveUpBtn.className = "q-move-btn";
      moveUpBtn.innerHTML = "▲";
      moveUpBtn.title = "Move Up";
      moveUpBtn.disabled = index === 0;
      moveUpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (index > 0) {
          const temp = multiQuestions[index - 1];
          multiQuestions[index - 1] = multiQuestions[index];
          multiQuestions[index] = temp;
          renderMultiQuestionsList();
        }
      });

      const moveDownBtn = document.createElement("button");
      moveDownBtn.type = "button";
      moveDownBtn.className = "q-move-btn";
      moveDownBtn.innerHTML = "▼";
      moveDownBtn.title = "Move Down";
      moveDownBtn.disabled = index === multiQuestions.length - 1;
      moveDownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (index < multiQuestions.length - 1) {
          const temp = multiQuestions[index + 1];
          multiQuestions[index + 1] = multiQuestions[index];
          multiQuestions[index] = temp;
          renderMultiQuestionsList();
        }
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "q-remove-btn";
      removeBtn.innerHTML = "✖";
      removeBtn.title = "Remove question";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        multiQuestions.splice(index, 1);
        renderMultiQuestionsList();
      });

      actionsGroup.appendChild(previewBtn);
      actionsGroup.appendChild(moveUpBtn);
      actionsGroup.appendChild(moveDownBtn);
      actionsGroup.appendChild(removeBtn);

      // Drag and Drop Events
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index.toString());
        card.classList.add("is-dragging");
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        document.querySelectorAll(".question-item").forEach((c) => c.classList.remove("drag-over"));
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const toIndex = index;
        if (!isNaN(fromIndex) && fromIndex !== toIndex && fromIndex >= 0 && fromIndex < multiQuestions.length) {
          const [movedItem] = multiQuestions.splice(fromIndex, 1);
          multiQuestions.splice(toIndex, 0, movedItem);
          renderMultiQuestionsList();
        }
      });

      card.appendChild(dragHandle);
      card.appendChild(info);
      card.appendChild(actionsGroup);
      multiQuestionsListEl.appendChild(card);
    });
  }

  if (clearMultiDocBtn) {
    clearMultiDocBtn.addEventListener("click", () => {
      if (multiQuestions.length === 0) return;
      if (confirm("Are you sure you want to clear all added questions from this session?")) {
        multiQuestions = [];
        renderMultiQuestionsList();
        setStatus(statusEl, "Cleared session questions.", "info");
      }
    });
  }

  // Generator Handler
  async function handleGenerate(event) {
    event.preventDefault();

    if (!currentUser) {
      openAuthModal();
      return;
    }

    const apiKey = getUserApiKey();
    const topic = topicInput.value.trim();
    const model = modelInput.value.trim();
    const qtype = mcqForm.querySelector('input[name="qtype"]:checked').value;

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

    if (mcqMode === "multi") {
      setStatus(statusEl, "Generating question to add to document...", "info");

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ apiKey, topic, model, qtype, returnJson: true }),
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

        const data = await response.json();
        if (data.success && data.resdict) {
          multiQuestions.push({
            resdict: data.resdict,
            qtype: data.qtype || qtype,
            topic: topic
          });
          renderMultiQuestionsList();
          setStatus(statusEl, `Added Question #${multiQuestions.length} to session! You can add more or download below.`, "success");
          refreshKeyUsage(apiKey);
        } else {
          setStatus(statusEl, "Failed to generate question data.", "error");
        }
      } catch (err) {
        setStatus(statusEl, "Couldn't reach the server. Check your connection.", "error");
      } finally {
        setLoading(false);
      }

    } else {
      // Single Question Mode
      setStatus(statusEl, "Generating question document...", "info");
      const filename = singleDocxFilenameInput ? singleDocxFilenameInput.value.trim() : "";

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ apiKey, topic, model, qtype, filename }),
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
        const downloadedFilename = filenameFromResponse(response, "question.docx");
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = downloadedFilename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        setStatus(statusEl, `Downloaded ${downloadedFilename}`, "success");
        refreshKeyUsage(apiKey);
      } catch (err) {
        setStatus(statusEl, "Couldn't reach the server. Check your connection.", "error");
      } finally {
        setLoading(false);
      }
    }
  }

  mcqForm.addEventListener("submit", handleGenerate);

  // Download Multi-Question Combined DOCX Handler
  if (downloadMultiDocxBtn) {
    downloadMultiDocxBtn.addEventListener("click", async () => {
      if (multiQuestions.length === 0) return;

      const apiKey = getUserApiKey();
      const customFilename = multiDocxFilenameInput ? multiDocxFilenameInput.value.trim() : "";

      downloadMultiDocxBtn.disabled = true;
      downloadMultiDocxBtn.classList.add("is-loading");
      setStatus(statusEl, "Building combined DOCX document...", "info");

      try {
        const response = await fetch("/api/generate-multi-docx", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            questions: multiQuestions,
            filename: customFilename,
            apiKey
          }),
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
        const downloadedFilename = filenameFromResponse(response, "MCQ_Combined_Document.docx");
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = downloadedFilename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        setStatus(statusEl, `Downloaded ${downloadedFilename} (${multiQuestions.length} questions)`, "success");
        refreshKeyUsage(apiKey);
      } catch (err) {
        setStatus(statusEl, "Failed to download combined document.", "error");
      } finally {
        downloadMultiDocxBtn.classList.remove("is-loading");
        updateDownloadButtonState();
      }
    });
  }

  // Translator Handler
  async function handleTranslate(event) {
    event.preventDefault();

    const apiKey = (translateApiKeyInput ? translateApiKeyInput.value.trim() : "") || getUserApiKey();
    const text = translateSourceInput ? translateSourceInput.value.trim() : "";
    const model = (translateModelInput && translateModelInput.value.trim()) || (modelInput && modelInput.value.trim()) || "gemini-3.6-flash";

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
      if (apiKey) {
        reqHeaders["x-api-key"] = apiKey;
      }
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

      if (data.keyUsage) {
        updateKeyUsageUI(data.keyUsage);
      } else {
        refreshKeyUsage(apiKey);
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
      setStatus(suggestStatusEl, "Submitting word mapping…", "info");
      const headers = getAuthHeaders();

      const res = await fetch("/api/vocabulary/suggest", {
        method: "POST",
        headers,
        body: JSON.stringify({ english, sinhala }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit mapping");
      }

      suggestEnglishInput.value = "";
      suggestSinhalaInput.value = "";

      if (data.direct) {
        setStatus(
          suggestStatusEl,
          "Word mapping directly added to the prompt by Academic Staff / Admin!",
          "success"
        );
        if (data.vocabulary) {
          renderGlossary(data.vocabulary);
        } else {
          fetchGlossary();
        }
      } else {
        setStatus(
          suggestStatusEl,
          "Suggestion submitted! An admin will review it before it is added to the generator.",
          "success"
        );
      }
    } catch (err) {
      setStatus(suggestStatusEl, err.message || "Failed to submit mapping.", "error");
    }
  }

  if (suggestForm) {
    suggestForm.addEventListener("submit", handleSuggest);
  }

  // Gemini Model Management
  let currentDefaultModels = {
    generator: "gemini-3.6-flash",
    translator: "gemini-3.6-flash",
    docx: "gemini-3.6-flash",
  };

  const userManualModelSelection = {
    generator: false,
    translator: false,
    docx: false,
  };

  if (modelInput) {
    modelInput.addEventListener("change", () => {
      userManualModelSelection.generator = true;
    });
  }
  if (translateModelInput) {
    translateModelInput.addEventListener("change", () => {
      userManualModelSelection.translator = true;
    });
  }
  if (docxModelInput) {
    docxModelInput.addEventListener("change", () => {
      userManualModelSelection.docx = true;
    });
  }

  async function fetchModels(forceDefaults = false) {
    try {
      const res = await fetch("/api/models");
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.models)) {
        if (data.defaults) {
          currentDefaultModels = { ...currentDefaultModels, ...data.defaults };
        }
        updateModelDropdowns(data.models, data.defaults || currentDefaultModels, forceDefaults);
        renderAdminModels(data.models);
      }
    } catch (_) {}
  }

  function updateModelDropdowns(models, defaults, forceDefaults = false) {
    if (defaults) {
      currentDefaultModels = { ...currentDefaultModels, ...defaults };
    }
    const defs = defaults || currentDefaultModels || {};

    const toolDropdowns = [
      { el: modelInput, defaultVal: defs.generator, feature: "generator" },
      { el: translateModelInput, defaultVal: defs.translator, feature: "translator" },
      { el: docxModelInput, defaultVal: defs.docx, feature: "docx" },
    ];

    toolDropdowns.forEach(({ el, defaultVal, feature }) => {
      if (!el) return;
      const prevVal = el.value;
      el.innerHTML = "";

      if (!models || models.length === 0) {
        const opt = document.createElement("option");
        opt.value = "gemini-3.6-flash";
        opt.textContent = "gemini-3.6-flash";
        el.appendChild(opt);
        return;
      }

      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        el.appendChild(opt);
      });

      // If forceDefaults is active OR the user hasn't manually selected a custom model in this session,
      // apply the default model configured by the admin.
      if (!forceDefaults && userManualModelSelection[feature] && prevVal && models.includes(prevVal)) {
        el.value = prevVal;
      } else if (defaultVal && models.includes(defaultVal)) {
        el.value = defaultVal;
      } else if (models.length > 0) {
        el.value = models[0];
      }
    });

    // Admin default pre-selected configuration dropdowns
    const adminDropdowns = [
      { el: adminDefaultGeneratorModel, defaultVal: defs.generator },
      { el: adminDefaultTranslatorModel, defaultVal: defs.translator },
      { el: adminDefaultDocxModel, defaultVal: defs.docx },
    ];

    adminDropdowns.forEach(({ el, defaultVal }) => {
      if (!el) return;
      el.innerHTML = "";

      if (!models || models.length === 0) {
        const opt = document.createElement("option");
        opt.value = "gemini-3.6-flash";
        opt.textContent = "gemini-3.6-flash";
        el.appendChild(opt);
        return;
      }

      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        el.appendChild(opt);
      });

      if (defaultVal && models.includes(defaultVal)) {
        el.value = defaultVal;
      } else if (models.length > 0) {
        el.value = models[0];
      }
    });
  }

  function renderAdminModels(models) {
    if (!adminModelsListEl) return;
    adminModelsListEl.innerHTML = "";
    if (!models || models.length === 0) {
      adminModelsListEl.innerHTML = `<div class="empty-vocab">No allowed Gemini models configured.</div>`;
      return;
    }

    models.forEach((m) => {
      const row = document.createElement("div");
      row.className = "vocab-row admin-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "vocab-english";
      nameSpan.style.fontWeight = "600";
      nameSpan.textContent = m;

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "action-btns";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-sm btn-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => adminDeleteModel(m));

      actionsDiv.appendChild(deleteBtn);
      row.appendChild(nameSpan);
      row.appendChild(actionsDiv);

      adminModelsListEl.appendChild(row);
    });
  }

  async function adminAddModel(event) {
    if (event) event.preventDefault();
    const modelName = adminModelNameInput ? adminModelNameInput.value.trim() : "";
    if (!modelName) {
      setStatus(adminModelStatusEl, "Please enter a model name.", "error");
      return;
    }

    try {
      setStatus(adminModelStatusEl, "Adding Gemini model…", "info");
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/models", {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelName }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add model.");
      }

      if (adminModelNameInput) adminModelNameInput.value = "";
      renderAdminModels(data.models);
      updateModelDropdowns(data.models, data.defaults || currentDefaultModels, false);
      setStatus(adminModelStatusEl, `Model "${escapeHtml(modelName)}" added successfully!`, "success");
    } catch (err) {
      setStatus(adminModelStatusEl, err.message || "Failed to add model.", "error");
    }
  }

  async function adminDeleteModel(modelName) {
    if (!modelName) return;
    try {
      setStatus(adminModelStatusEl, "Deleting Gemini model…", "info");
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/models", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ model: modelName }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete model.");
      }

      renderAdminModels(data.models);
      updateModelDropdowns(data.models, data.defaults || currentDefaultModels, false);
      setStatus(adminModelStatusEl, `Model "${escapeHtml(modelName)}" removed successfully!`, "success");
    } catch (err) {
      setStatus(adminModelStatusEl, err.message || "Failed to delete model.", "error");
    }
  }

  async function adminSaveDefaultModels(event) {
    if (event) event.preventDefault();
    const generator = adminDefaultGeneratorModel ? adminDefaultGeneratorModel.value : "gemini-3.6-flash";
    const translator = adminDefaultTranslatorModel ? adminDefaultTranslatorModel.value : "gemini-3.6-flash";
    const docx = adminDefaultDocxModel ? adminDefaultDocxModel.value : "gemini-3.6-flash";

    try {
      setStatus(adminDefaultModelsStatusEl, "Saving default models…", "info");
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch("/api/admin/default-models", {
        method: "POST",
        headers,
        body: JSON.stringify({ generator, translator, docx }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save default models.");
      }

      currentDefaultModels = {
        generator: data.defaults?.generator || generator,
        translator: data.defaults?.translator || translator,
        docx: data.defaults?.docx || docx,
      };

      // Reset manual overrides so updated defaults reflect immediately
      userManualModelSelection.generator = false;
      userManualModelSelection.translator = false;
      userManualModelSelection.docx = false;

      if (modelInput) modelInput.value = currentDefaultModels.generator;
      if (translateModelInput) translateModelInput.value = currentDefaultModels.translator;
      if (docxModelInput) docxModelInput.value = currentDefaultModels.docx;

      await fetchModels(true);

      setStatus(adminDefaultModelsStatusEl, "Default pre-selected models saved successfully for all users!", "success");
    } catch (err) {
      setStatus(adminDefaultModelsStatusEl, err.message || "Failed to save default models.", "error");
    }
  }

  if (adminAddModelForm) {
    adminAddModelForm.addEventListener("submit", adminAddModel);
  }

  if (adminDefaultModelsForm) {
    adminDefaultModelsForm.addEventListener("submit", adminSaveDefaultModels);
  }

  // Admin Data & Logic
  async function fetchAdminData() {
    try {
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const [pendingRes, activeRes, usersRes, promptsRes, transRes, modelsRes] = await Promise.all([
        fetch("/api/admin/pending", { headers }),
        fetch("/api/vocabulary"),
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/prompts", { headers }),
        fetch("/api/admin/translations", { headers }),
        fetch("/api/models"),
      ]);

      const pending = pendingRes.ok ? await pendingRes.json() : [];
      const active = activeRes.ok ? await activeRes.json() : [];
      const users = usersRes.ok ? await usersRes.json() : [];
      adminPromptsData = promptsRes.ok ? await promptsRes.json() : [];
      adminTranslationStats = transRes.ok ? await transRes.json() : { users: [], guests: [], total: 0 };
      const modelsData = modelsRes.ok ? await modelsRes.json() : { models: [], defaults: null };

      renderAdminPending(pending);
      renderAdminActive(active);
      renderAdminUsers(users);
      renderAdminGuests();
      renderAdminPrompts();
      renderAdminModels(modelsData.models || []);
      if (modelsData.defaults) {
        currentDefaultModels = { ...currentDefaultModels, ...modelsData.defaults };
      }
      updateModelDropdowns(modelsData.models || [], modelsData.defaults || currentDefaultModels);
    } catch (err) {
      setStatus(adminStatusEl, "Error loading admin data.", "error");
    }
  }

  async function updateUserRoleInAdmin(userId, newRole, selectEl) {
    if (!userId) return;
    try {
      setStatus(adminStatusEl, "Updating user role…", "info");
      const headers = getAuthHeaders();
      headers["x-admin-pass"] = "ictfromabcadmin";

      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update user role.");
      }

      const roleDisplay = newRole === "academic_staff" ? "Academic Staff" : newRole === "admin" ? "Admin" : "User";
      setStatus(adminStatusEl, `User role updated to "${roleDisplay}" successfully!`, "success");
    } catch (err) {
      setStatus(adminStatusEl, err.message || "Failed to update user role.", "error");
      fetchAdminData();
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

      const currentRole = (u.role || "user").toLowerCase();
      const isSuperAdminEmail = (u.email && u.email.toLowerCase() === "sachoice51@gmail.com");

      const roleSelectHtml = `
        <select class="admin-role-select" data-user-id="${escapeHtml(u.id)}" ${isSuperAdminEmail ? "disabled" : ""} style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; font-weight: 500; background: var(--bg-card, #ffffff); cursor: pointer; min-width: 130px;">
          <option value="user" ${currentRole === "user" ? "selected" : ""}>User</option>
          <option value="academic_staff" ${currentRole === "academic_staff" || currentRole === "academic staff" ? "selected" : ""}>Academic Staff</option>
          <option value="admin" ${currentRole === "admin" ? "selected" : ""}>Admin</option>
        </select>
      `;

      tr.innerHTML = `
        <td><strong>${escapeHtml(u.name || "User")}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="user-role-badge">${escapeHtml(authProvider)}</span></td>
        <td>${roleSelectHtml}</td>
        <td><strong>${translationCount}</strong></td>
        <td>${dateStr}</td>
      `;

      const selectEl = tr.querySelector(".admin-role-select");
      if (selectEl && !isSuperAdminEmail) {
        selectEl.addEventListener("change", (e) => {
          updateUserRoleInAdmin(u.id, e.target.value, selectEl);
        });
      }

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

  // Admin: API Key Usage Management
  const adminKeyUsageForm = document.getElementById("admin-key-usage-form");
  const adminKeyTypeSelect = document.getElementById("admin-key-type-select");
  const adminCustomKeyWrapper = document.getElementById("admin-custom-key-wrapper");
  const adminCustomKeyInput = document.getElementById("admin-custom-key-input");
  const adminKeyCountInput = document.getElementById("admin-key-count-input");
  const adminKeyUsageStatus = document.getElementById("admin-key-usage-status");

  if (adminKeyTypeSelect) {
    adminKeyTypeSelect.addEventListener("change", () => {
      if (adminKeyTypeSelect.value === "custom") {
        if (adminCustomKeyWrapper) adminCustomKeyWrapper.style.display = "block";
      } else {
        if (adminCustomKeyWrapper) adminCustomKeyWrapper.style.display = "none";
      }
    });
  }

  if (adminKeyUsageForm) {
    adminKeyUsageForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const keyType = adminKeyTypeSelect ? adminKeyTypeSelect.value : "default";
      const customApiKey = adminCustomKeyInput ? adminCustomKeyInput.value.trim() : "";
      const newCount = adminKeyCountInput ? adminKeyCountInput.value.trim() : "0";

      if (keyType === "custom" && !customApiKey) {
        setStatus(adminKeyUsageStatus, "Please enter the Custom API Key to update.", "error");
        return;
      }

      try {
        setStatus(adminKeyUsageStatus, "Updating API key usage count…", "info");
        const headers = getAuthHeaders();
        headers["x-admin-pass"] = "ictfromabcadmin";

        const res = await fetch("/api/admin/key-usage", {
          method: "POST",
          headers,
          body: JSON.stringify({ keyType, customApiKey, newCount }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to update API key usage.");
        }

        setStatus(adminKeyUsageStatus, "API key usage count updated successfully!", "success");
        if (adminKeyCountInput) adminKeyCountInput.value = "";

        if (data.usage) {
          updateKeyUsageUI(data.usage);
        }
        refreshKeyUsage();
      } catch (err) {
        setStatus(adminKeyUsageStatus, err.message || "Failed to update usage count.", "error");
      }
    });
  }

  // DOCX Translate Logic
  const docxForm = document.getElementById("docx-form");
  const docxFileInput = document.getElementById("docx-file-input");
  const docxDropZone = document.getElementById("docx-drop-zone");
  const docxBrowseBtn = document.getElementById("docx-browse-btn");
  const docxDropContent = document.getElementById("docx-drop-content");
  const docxFileInfo = document.getElementById("docx-file-info");
  const docxFileName = document.getElementById("docx-file-name");
  const docxFileSize = document.getElementById("docx-file-size");
  const docxRemoveBtn = document.getElementById("docx-remove-btn");
  const docxTranslateBtn = document.getElementById("docx-translate-btn");
  const docxStatusEl = document.getElementById("docx-status");

  let selectedDocxFile = null;

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function setSelectedDocx(file) {
    if (!file) {
      selectedDocxFile = null;
      if (docxFileInput) docxFileInput.value = "";
      if (docxFileInfo) {
        docxFileInfo.classList.add("is-hidden");
        docxFileInfo.style.display = "none";
      }
      if (docxDropContent) {
        docxDropContent.classList.remove("is-hidden");
        docxDropContent.style.display = "block";
      }
      if (docxTranslateBtn) docxTranslateBtn.disabled = true;
      return;
    }

    if (!file.name.toLowerCase().endsWith(".docx")) {
      setStatus(docxStatusEl, "Invalid file format. Please upload a .docx Word document.", "error");
      return;
    }

    selectedDocxFile = file;
    if (docxFileName) docxFileName.textContent = file.name;
    if (docxFileSize) docxFileSize.textContent = formatBytes(file.size);
    if (docxDropContent) {
      docxDropContent.classList.add("is-hidden");
      docxDropContent.style.display = "none";
    }
    if (docxFileInfo) {
      docxFileInfo.classList.remove("is-hidden");
      docxFileInfo.style.display = "flex";
    }
    if (docxTranslateBtn) docxTranslateBtn.disabled = false;
    setStatus(docxStatusEl, "", "");
  }

  if (docxBrowseBtn) {
    docxBrowseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (docxFileInput) docxFileInput.click();
    });
  }

  if (docxDropZone) {
    docxDropZone.addEventListener("click", (e) => {
      if (e.target !== docxRemoveBtn && !docxRemoveBtn?.contains(e.target) && !selectedDocxFile) {
        if (docxFileInput) docxFileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      docxDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        docxDropZone.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      docxDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        docxDropZone.classList.remove("is-dragover");
      });
    });

    docxDropZone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const files = dt ? dt.files : null;
      if (files && files.length > 0) {
        setSelectedDocx(files[0]);
      }
    });
  }

  if (docxFileInput) {
    docxFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        setSelectedDocx(e.target.files[0]);
      }
    });
  }

  if (docxRemoveBtn) {
    docxRemoveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setSelectedDocx(null);
    });
  }

  if (docxForm) {
    docxForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedDocxFile) {
        setStatus(docxStatusEl, "Please select a .docx file to translate.", "error");
        return;
      }

      const apiKey = getUserApiKey();

      try {
        if (docxTranslateBtn) {
          docxTranslateBtn.disabled = true;
          docxTranslateBtn.classList.add("is-loading");
        }
        setStatus(docxStatusEl, "Reading document and sending paragraphs to Gemini API...", "info");

        const docxTypeInput = document.querySelector('input[name="docxType"]:checked');
        const docxType = docxTypeInput ? docxTypeInput.value : "question";
        const model = (docxModelInput && docxModelInput.value.trim()) || (modelInput && modelInput.value.trim()) || "gemini-3.6-flash";

        const formData = new FormData();
        formData.append("file", selectedDocxFile);
        formData.append("docxType", docxType);
        formData.append("model", model);
        if (apiKey) formData.append("apiKey", apiKey);

        const headers = getAuthHeaders();
        // Delete Content-Type so fetch sets correct boundary for multipart/form-data
        delete headers["Content-Type"];

        const res = await fetch("/api/translate-docx", {
          method: "POST",
          headers,
          body: formData,
        });

        if (!res.ok) {
          let errMsg = "Failed to translate DOCX document.";
          try {
            const errJson = await res.json();
            if (errJson.error) errMsg = errJson.error;
          } catch (_) {}
          throw new Error(errMsg);
        }

        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        let filename = "Translated_Document.docx";
        const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1].replace(/['"]/g, ""));
        } else {
          filename = selectedDocxFile.name.replace(/\.docx$/i, "") + "_translated.docx";
        }

        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

        setStatus(
          docxStatusEl,
          `Translation completed successfully! Downloaded: ${escapeHtml(filename)}`,
          "success"
        );
        refreshKeyUsage();
      } catch (err) {
        setStatus(docxStatusEl, err.message || "Failed to translate document.", "error");
      } finally {
        if (docxTranslateBtn) {
          docxTranslateBtn.classList.remove("is-loading");
          if (selectedDocxFile) docxTranslateBtn.disabled = false;
        }
      }
    });
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
  fetchModels();
  checkCurrentUserSession();
  checkAdminAccess();
})();
