const memoryStore = {};

function storageGet(key) {
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch {
        return memoryStore[key] || null;
    }

    return memoryStore[key] || null;
}

function storageSet(key, value) {
    memoryStore[key] = value;
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(key, value);
        }
    } catch {}
}

function storageRemove(key) {
    delete memoryStore[key];
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.removeItem(key);
        }
    } catch {}
}

function tabStorageGet(key) {
    const memoryKey = `tab:${key}`;
    try {
        if (typeof window !== "undefined" && window.sessionStorage) {
            return window.sessionStorage.getItem(key);
        }
    } catch {
        return memoryStore[memoryKey] || null;
    }

    return memoryStore[memoryKey] || null;
}

function tabStorageSet(key, value) {
    memoryStore[`tab:${key}`] = value;
    try {
        if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.setItem(key, value);
        }
    } catch {}
}

function tabStorageRemove(key) {
    delete memoryStore[`tab:${key}`];
    try {
        if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.removeItem(key);
        }
    } catch {}
}

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

const LOCAL_API_URL = "http://127.0.0.1:8000";
const FALLBACK_API_URL = "https://infera-ai-backend-tcm4.onrender.com";

function isLocalFrontend() {
    if (typeof window === "undefined") return true;
    return ["127.0.0.1", "localhost", ""].includes(window.location.hostname) || window.location.protocol === "file:";
}

function getDefaultApiUrl() {
    return isLocalFrontend() ? LOCAL_API_URL : FALLBACK_API_URL;
}

function getInitialApiUrl() {
    const storedApiUrl = storageGet("apiUrl");
    if (isLocalFrontend() && (!storedApiUrl || storedApiUrl === FALLBACK_API_URL)) {
        return LOCAL_API_URL;
    }
    return storedApiUrl || getDefaultApiUrl();
}

let API_URL = getInitialApiUrl();

const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const voiceStatus = document.getElementById("voiceStatus");
const chatHistory = document.getElementById("chatHistory");
const sessionInfo = document.getElementById("sessionInfo");
const historyCount = document.getElementById("historyCount");
const pdfFile = document.getElementById("pdfFile");
const imageInput = document.getElementById("imageInput");
const attachmentMenu = document.getElementById("attachmentMenu");
const attachmentPreview = document.getElementById("attachmentPreview");
const attachFileBtn = document.getElementById("attachFileBtn");
const toastRoot = document.getElementById("toastRoot");
const sendBtn = document.getElementById("sendBtn");
const voiceSendBtn = document.getElementById("voiceSendBtn");
const composerMicBtn = document.getElementById("composerMicBtn");
const voiceModuleState = document.getElementById("voiceModuleState");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const regenerateBtn = document.getElementById("regenerateBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const authScreen = document.getElementById("authScreen");
const authForm = document.getElementById("authForm");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authStatus = document.getElementById("authStatus");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const userName = document.getElementById("userName");

let currentSessionId = tabStorageGet("activeSessionId") || null;
let authMode = "login";
let authToken = storageGet("authToken") || "";
let authUser = safeJsonParse(storageGet("authUser"), null);
let localAuth = storageGet("localAuth") === "true";
let recognition = null;
let isListening = false;
let heardSpeech = false;
let listeningError = false;
let mediaRecorder = null;
let micStream = null;
let micAudioContext = null;
let micAnalyser = null;
let micMonitorFrame = null;
let micRecordingChunks = [];
let micStopTimer = null;
let micNoSpeechTimer = null;
let micLastSpeechAt = 0;
let micHeardAudio = false;
let micStopReason = "manual";
let isSending = false;
let lastAssistantText = "";
let lastUserPrompt = "";
let lastRequestConfig = null;
let activeAbortController = null;
let activeThinkingMessage = null;
let activeRequestId = "";
let hasUserInteracted = false;
let chatNames = safeJsonParse(storageGet("chatNames"), {});
let attachedImage = null;
let attachedPdf = null;
let activePdfName = "";
let currentTheme = storageGet("theme") || "dark";
let isVoiceSpeaking = false;
let currentSpeechText = "";

if (localAuth || authToken === "local-demo-token") {
    storageRemove("localAuth");
    storageRemove("authToken");
    storageRemove("authUser");
    localAuth = false;
    authToken = "";
    authUser = null;
}

function authHeaders(extraHeaders = {}) {
    if (localAuth) {
        return extraHeaders;
    }

    return {
        ...extraHeaders,
        Authorization: `Bearer ${authToken}`
    };
}

async function authFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: authHeaders(options.headers || {})
    });

    if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error("Please login again.");
    }

    return response;
}

function setAuthMode(mode) {
    authMode = mode;
    document.getElementById("loginTab").classList.toggle("active", mode === "login");
    document.getElementById("registerTab").classList.toggle("active", mode === "register");
    authName.style.display = mode === "register" ? "block" : "none";
    authSubmitBtn.textContent = mode === "register" ? "Register" : "Login";
    authStatus.textContent = "";
}

function showAppForUser() {
    authScreen.classList.add("hidden");
    userName.textContent = authUser?.name || authUser?.email || "User";
}

function openMobileSidebar() {
    document.body.classList.add("sidebar-open");
}

function closeMobileSidebar() {
    document.body.classList.remove("sidebar-open");
}

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeMobileSidebar();
    }
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
        closeMobileSidebar();
    }
});

function showLogin() {
    authScreen.classList.remove("hidden");
    userName.textContent = "Guest";
    closeMobileSidebar();
}

function logout() {
    storageRemove("authToken");
    storageRemove("authUser");
    storageRemove("localAuth");
    storageRemove("apiUrl");
    storageRemove("activeSessionId");
    tabStorageRemove("activeSessionId");
    storageRemove("pendingMessage");
    authToken = "";
    authUser = null;
    localAuth = false;
    API_URL = getDefaultApiUrl();
    currentSessionId = null;
    clearChatBox();
    chatHistory.innerHTML = "";
    historyCount.textContent = "0";
    setSession(null);
    showLogin();
}

function completeLocalLogin(name, email) {
    localAuth = true;
    authToken = "local-demo-token";
    authUser = {
        id: "local",
        name: name || email.split("@")[0],
        email
    };
    API_URL = getDefaultApiUrl();
    storageSet("localAuth", "true");
    storageSet("authToken", authToken);
    storageSet("authUser", JSON.stringify(authUser));
    storageSet("apiUrl", API_URL);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatMessage(text) {
    if (!text) return "";

    let safeText = escapeHtml(text);
    safeText = safeText.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
    safeText = safeText.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safeText = safeText.replace(/\n/g, "<br>");
    return safeText;
}

function cleanForSpeech(text) {
    return String(text || "")
        .replace(/```[\s\S]*?```/g, "Code block generated.")
        .replace(/https?:\/\/[^\s]+/g, "source link")
        .replace(/\*\*/g, "")
        .replace(/[#_*`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function setBusy(busy) {
    isSending = busy;
    if (voiceSendBtn) {
        voiceSendBtn.disabled = busy;
    }
    userInput.disabled = busy;
    sendBtn.disabled = false;
    sendBtn.classList.toggle("stop-mode", busy);
    sendBtn.title = busy ? "Stop generating" : "Send message";
    sendBtn.setAttribute("aria-label", busy ? "Stop generating" : "Send");
    sendBtn.innerHTML = busy
        ? '<span class="stop-square"></span>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>';
    regenerateBtn.disabled = busy || !lastRequestConfig;
}

function handlePrimaryAction() {
    if (isSending) {
        stopGenerating();
        return;
    }

    sendMessage();
}

function applyTheme(theme) {
    currentTheme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = currentTheme;
    themeToggleBtn.textContent = currentTheme === "dark" ? "Light" : "Dark";
    storageSet("theme", currentTheme);
}

function toggleTheme() {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
    showToast(`Theme changed to ${currentTheme} mode.`);
}

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRoot.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 20);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 220);
    }, 2800);
}

function resizeComposer() {
    userInput.style.height = "auto";
    userInput.style.height = `${Math.min(userInput.scrollHeight, 180)}px`;
}

function setChatTitle(title) {
    sessionInfo.textContent = title || "New chat";
}

function setSession(sessionId, title = "") {
    currentSessionId = sessionId || null;

    if (currentSessionId) {
        storageSet("activeSessionId", currentSessionId);
        tabStorageSet("activeSessionId", currentSessionId);
        setChatTitle(title || chatNames[currentSessionId] || "Untitled chat");
    } else {
        storageRemove("activeSessionId");
        tabStorageRemove("activeSessionId");
        storageRemove("pendingMessage");
        setChatTitle("New chat");
    }

    highlightActiveSession();
}

function createClientSessionId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveChatNames() {
    storageSet("chatNames", JSON.stringify(chatNames));
}

function getChatName(sessionId, index) {
    return chatNames[sessionId] || `Chat ${index + 1}`;
}

function getSessionId(session) {
    if (typeof session === "string") return session;
    return session.id || session.session_id || session.sessionId || "";
}

function getSessionTitle(session, index) {
    const sessionId = getSessionId(session);
    return chatNames[sessionId] || session.title || session.name || `Chat ${index + 1}`;
}

function highlightActiveSession() {
    chatHistory.querySelectorAll(".chat-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.sessionId === currentSessionId);
    });
}

function renameChat(sessionId, fallbackName) {
    const nextName = prompt("Rename chat", chatNames[sessionId] || fallbackName);
    if (!nextName) return;

    const cleanName = nextName.trim().slice(0, 36);
    if (!cleanName) return;

    chatNames[sessionId] = cleanName;
    saveChatNames();
    loadChatSessions();
}

function toggleAttachmentMenu() {
    if (!attachmentMenu) {
        openPdfPicker();
        return;
    }
    attachmentMenu.hidden = !attachmentMenu.hidden;
    attachFileBtn?.setAttribute("aria-expanded", String(!attachmentMenu.hidden));
}

function closeAttachmentMenu() {
    if (!attachmentMenu) return;
    attachmentMenu.hidden = true;
    attachFileBtn?.setAttribute("aria-expanded", "false");
}

function openImagePicker() {
    closeMobileSidebar();
    closeAttachmentMenu();
    pdfFile.click();
}

function openPdfPicker() {
    closeMobileSidebar();
    closeAttachmentMenu();
    pdfFile.click();
}

function clearAttachedImage() {
    attachedImage = null;
    attachedPdf = null;
    imageInput.value = "";
    pdfFile.value = "";
    attachmentPreview.hidden = true;
    attachmentPreview.innerHTML = "";
}

function isImageFile(file) {
    return Boolean(file?.type?.startsWith("image/"));
}

function isDocumentFile(file) {
    const name = (file?.name || "").toLowerCase();
    return file && (
        file.type === "application/pdf"
        || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        || file.type === "text/plain"
        || name.endsWith(".pdf")
        || name.endsWith(".docx")
        || name.endsWith(".txt")
    );
}

function getFileLabel(file) {
    const name = (file?.name || "").toLowerCase();

    if (isImageFile(file)) return "Image";
    if (name.endsWith(".pdf") || file?.type === "application/pdf") return "PDF";
    if (name.endsWith(".docx")) return "Word";
    if (name.endsWith(".txt")) return "Text";
    return "File";
}

function setAttachedFile(file) {
    if (!file) return;

    if (isImageFile(file)) {
        setAttachedImage(file);
        return;
    }

    if (isDocumentFile(file)) {
        setAttachedPdf(file);
        return;
    }

    showToast("Unsupported file. Attach image, PDF, DOCX or TXT.", "error");
    pdfFile.value = "";
}

function setAttachedImage(file) {
    if (!file) return;

    attachedImage = file;
    attachedPdf = null;
    const imageUrl = URL.createObjectURL(file);
    attachmentPreview.hidden = false;
    attachmentPreview.innerHTML = `
        <div class="attachment-card">
            <img src="${imageUrl}" alt="Attached image preview">
            <div>
                <strong>${escapeHtml(file.name)}</strong>
                <span>Image ready for your error/debug prompt</span>
            </div>
            <button type="button" onclick="clearAttachedImage()" aria-label="Remove image">Remove</button>
        </div>
    `;
}

function setAttachedPdf(file) {
    if (!file) return;

    attachedPdf = file;
    attachedImage = null;
    imageInput.value = "";
    const label = getFileLabel(file);
    attachmentPreview.hidden = false;
    attachmentPreview.innerHTML = `
        <div class="attachment-card pdf-card">
            <div class="file-chip-icon">${label}</div>
            <div>
                <strong>${escapeHtml(file.name)}</strong>
                <span>Ready. Add a question or press send to analyze this file.</span>
            </div>
            <button type="button" onclick="clearAttachedImage()" aria-label="Remove file">Remove</button>
        </div>
    `;
    showToast(`${label} attached.`);
}

function addMessage(text, sender, options = {}) {
    removeWelcomeMessage();

    const message = document.createElement("article");
    message.className = `message ${sender}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = formatMessage(text);
    message.appendChild(bubble);

    if (options.imageUrl) {
        const image = document.createElement("img");
        image.className = "message-image";
        image.src = options.imageUrl;
        image.alt = "Attached image";
        message.appendChild(image);
    }

    if (sender === "bot" && !options.thinking) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const speakBtn = document.createElement("button");
        speakBtn.type = "button";
        speakBtn.textContent = "Speak";
        speakBtn.addEventListener("click", () => speakText(text));

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = "Copied";
            showToast("Answer copied.");
            setTimeout(() => {
                copyBtn.textContent = "Copy";
            }, 1200);
        });

        actions.append(speakBtn, copyBtn);
        message.appendChild(actions);
    }

    chatBox.appendChild(message);
    chatBox.scrollTop = chatBox.scrollHeight;
    return message;
}

function updateMessage(element, text, options = {}) {
    const bubble = element.querySelector(".bubble");
    bubble.innerHTML = formatMessage(text);
    element.classList.toggle("thinking", Boolean(options.thinking));

    if (!options.thinking && !element.querySelector(".message-actions")) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const speakBtn = document.createElement("button");
        speakBtn.type = "button";
        speakBtn.textContent = "Speak";
        speakBtn.addEventListener("click", () => speakText(text));

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = "Copied";
            showToast("Answer copied.");
            setTimeout(() => {
                copyBtn.textContent = "Copy";
            }, 1200);
        });

        actions.append(speakBtn, copyBtn);
        element.appendChild(actions);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}

function clearChatBox() {
    chatBox.innerHTML = "";
}

function addWelcomeMessage() {
    const welcome = document.createElement("section");
    welcome.className = "welcome-panel";
    welcome.innerHTML = `
        <img class="welcome-logo" src="assets/infera-logo.svg" alt="Infera AI logo">
        <h3>What do you want to solve today?</h3>
        <p>Start with a question, upload a PDF, debug code, or use voice input.</p>
        <div class="welcome-actions">
            <button type="button" onclick="quickPrompt('Explain this topic in simple language: ')">
                <strong>Explain topic</strong>
                <span>Clear and exam-ready</span>
            </button>
            <button type="button" onclick="quickPrompt('Fix this code or error: ')">
                <strong>Fix code</strong>
                <span>Debug with steps</span>
            </button>
            <button type="button" onclick="openPdfPicker()">
                <strong>Attach file</strong>
                <span>PDF, Word, text or image</span>
            </button>
            <button type="button" onclick="quickPrompt('Search and explain the latest information about: ')">
                <strong>Research</strong>
                <span>Current web context</span>
            </button>
        </div>
    `;
    chatBox.appendChild(welcome);
}

function removeWelcomeMessage() {
    const welcome = chatBox.querySelector(".welcome-panel");
    if (welcome) {
        welcome.remove();
    }
}

function quickPrompt(text) {
    closeMobileSidebar();
    userInput.value = text;
    resizeComposer();
    userInput.focus();
    chatBox.scrollTop = chatBox.scrollHeight;
}

function getVoicesWhenReady() {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            resolve(voices);
            return;
        }

        window.speechSynthesis.onvoiceschanged = () => {
            resolve(window.speechSynthesis.getVoices());
        };

        setTimeout(() => resolve(window.speechSynthesis.getVoices()), 700);
    });
}

function splitSpeech(text) {
    const chunks = [];
    let remaining = cleanForSpeech(text);

    while (remaining.length > 0) {
        let chunk = remaining.slice(0, 180);
        const splitAt = Math.max(chunk.lastIndexOf("."), chunk.lastIndexOf(","), chunk.lastIndexOf(" "));
        if (remaining.length > 180 && splitAt > 60) {
            chunk = chunk.slice(0, splitAt + 1);
        }
        chunks.push(chunk.trim());
        remaining = remaining.slice(chunk.length).trim();
    }

    return chunks.length ? chunks : ["Response generated."];
}

async function speakText(text) {
    if (!("speechSynthesis" in window)) {
        setVoiceState("Voice output is not supported in this browser.");
        return;
    }

    if (isVoiceSpeaking && currentSpeechText === text) {
        stopSpeaking();
        return;
    }

    window.speechSynthesis.cancel();
    isVoiceSpeaking = false;
    currentSpeechText = text;
    const voices = await getVoicesWhenReady();
    const preferredVoice = voices.find((voice) => voice.lang.startsWith("en-IN"))
        || voices.find((voice) => voice.lang.startsWith("en"))
        || voices[0];

    const chunks = splitSpeech(text);
    let index = 0;

    function speakNext() {
        if (index >= chunks.length) {
            setVoiceState("Voice ready");
            isVoiceSpeaking = false;
            currentSpeechText = "";
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = preferredVoice?.lang || "en-US";
        utterance.voice = preferredVoice || null;
        utterance.rate = 0.92;
        utterance.pitch = 1;

        utterance.onstart = () => {
            isVoiceSpeaking = true;
            setVoiceState("Speaking...");
        };
        utterance.onend = () => {
            index += 1;
            speakNext();
        };
        utterance.onerror = () => {
            isVoiceSpeaking = false;
            setVoiceState("Voice failed. Click Play once more.");
        };

        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
    }

    speakNext();
}

function stopSpeaking() {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
    isVoiceSpeaking = false;
    currentSpeechText = "";
    setVoiceState("Voice stopped.");
}

function newChat() {
    if (isSending) return;
    closeMobileSidebar();
    hasUserInteracted = true;
    setSession(null);
    clearChatBox();
    lastUserPrompt = "";
    lastRequestConfig = null;
    activePdfName = "";
    clearAttachedImage();
    regenerateBtn.disabled = true;
    addWelcomeMessage();
    showToast("New chat ready.");
}

async function loadChatSessions() {
    try {
        const response = await authFetch(`${API_URL}/chats`);
        if (!response.ok) throw new Error("Chat history request failed");

        const data = await response.json();
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];

        chatHistory.innerHTML = "";

        if (!sessions.length) {
            historyCount.textContent = "0";
            chatHistory.innerHTML = '<p class="empty-state">No saved chats yet.</p>';
            return;
        }

        sessions.forEach((session, index) => {
            const sessionId = getSessionId(session);
            if (!sessionId) return;

            const row = document.createElement("div");
            row.className = "chat-row";

            const item = document.createElement("button");
            item.type = "button";
            item.className = "chat-item";
            item.dataset.sessionId = sessionId;
            item.innerHTML = `<span>${escapeHtml(getSessionTitle(session, index))}</span><small>${sessionId.slice(0, 8)}</small>`;
            item.addEventListener("click", () => loadChat(sessionId));

            const renameButton = document.createElement("button");
            renameButton.type = "button";
            renameButton.className = "rename-chat-btn";
            renameButton.textContent = "Edit";
            renameButton.title = "Rename chat";
            renameButton.addEventListener("click", () => renameChat(sessionId, `Chat ${index + 1}`));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-chat-btn";
            deleteButton.textContent = "Del";
            deleteButton.title = "Delete chat";
            deleteButton.addEventListener("click", (event) => {
                event.stopPropagation();
                deleteChat(sessionId);
            });

            row.append(item, renameButton, deleteButton);
            chatHistory.appendChild(row);
        });

        const renderedRows = chatHistory.querySelectorAll(".chat-row").length;
        historyCount.textContent = renderedRows;
        if (!renderedRows) {
            chatHistory.innerHTML = '<p class="empty-state">No saved chats found.</p>';
        }

        highlightActiveSession();
    } catch (error) {
        console.error("Failed to load chats", error);
        historyCount.textContent = "0";
        chatHistory.innerHTML = '<p class="empty-state">History unavailable.</p>';
    }
}

async function loadChat(sessionId) {
    if (isSending) return;
    closeMobileSidebar();
    hasUserInteracted = true;
    storageSet("activeSessionId", sessionId);
    tabStorageSet("activeSessionId", sessionId);
    await renderSavedChat(sessionId);
}

async function deleteChat(sessionId) {
    if (isSending) return;
    const ok = confirm("Delete this chat?");
    if (!ok) return;

    try {
        const response = await authFetch(`${API_URL}/chats/${sessionId}`, {
            method: "DELETE"
        });

        if (!response.ok) throw new Error("Delete failed");

        if (currentSessionId === sessionId) {
            setSession(null);
            clearChatBox();
            addWelcomeMessage();
            lastUserPrompt = "";
            lastRequestConfig = null;
            regenerateBtn.disabled = true;
        }

        delete chatNames[sessionId];
        saveChatNames();
        await loadChatSessions();
        showToast("Chat deleted.", "success");
    } catch (error) {
        console.error(error);
        addMessage("Could not delete that chat. Please check backend is running.", "bot");
        showToast("Could not delete chat.", "error");
    }
}

async function renderSavedChat(sessionId) {
    try {
        const response = await authFetch(`${API_URL}/chats/${sessionId}`);
        if (!response.ok) throw new Error("Chat load failed");

        const data = await response.json();
        setSession(sessionId);
        clearChatBox();
        activePdfName = "";

        if (!data.messages?.length) {
            setChatTitle(chatNames[sessionId] || "Untitled chat");
            addWelcomeMessage();
            return [];
        }

        const firstUserMessage = data.messages.find((msg) => msg.role === "user");
        const generatedTitle = firstUserMessage
            ? firstUserMessage.content.split(/\s+/).join(" ").slice(0, 42)
            : "Untitled chat";
        setChatTitle(chatNames[sessionId] || generatedTitle);

        data.messages.forEach((msg) => {
            const sender = msg.role === "user" ? "user" : "bot";
            addMessage(msg.content, sender);
            if (sender === "user") {
                lastUserPrompt = msg.content;
            }
            if (sender === "bot") {
                lastAssistantText = msg.content;
                const pdfMatch = msg.content.match(/Active PDF set:\s*([^\n]+)/i);
                if (pdfMatch) {
                    activePdfName = pdfMatch[1].trim();
                }
            }
        });

        lastRequestConfig = lastUserPrompt
            ? { endpoint: "/chat", thinkingText: "Regenerating...", shouldSpeak: false, mode: "chat" }
            : null;
        regenerateBtn.disabled = !lastRequestConfig;

        return data.messages || [];
    } catch (error) {
        console.error("Failed to load chat", error);
        addMessage("Could not open that saved chat.", "bot");
        return [];
    }
}

function savePendingMessage(sessionId, text) {
    storageSet("pendingMessage", JSON.stringify({
        sessionId,
        text,
        createdAt: Date.now()
    }));
}

function getPendingMessage(sessionId) {
    try {
        const pending = JSON.parse(storageGet("pendingMessage") || "null");
        if (!pending || pending.sessionId !== sessionId) return null;
        if (Date.now() - pending.createdAt > 120000) {
            storageRemove("pendingMessage");
            return null;
        }
        return pending;
    } catch {
        return null;
    }
}

function getAnyPendingMessage() {
    try {
        const pending = JSON.parse(storageGet("pendingMessage") || "null");
        if (!pending?.sessionId) return null;
        if (Date.now() - pending.createdAt > 120000) {
            storageRemove("pendingMessage");
            return null;
        }
        return pending;
    } catch {
        return null;
    }
}

async function restoreActiveChat(sessionId) {
    const pending = getPendingMessage(sessionId);
    const messages = await renderSavedChat(sessionId);

    if (!pending) return;

    const latestUserIndex = messages.reduce((latestIndex, msg, index) => {
        return msg.role === "user" ? index : latestIndex;
    }, -1);
    const hasUserMessage = latestUserIndex !== -1;
    const hasAssistantReply = latestUserIndex !== -1
        && messages.slice(latestUserIndex + 1).some((msg) => msg.role !== "user");

    if (hasAssistantReply) {
        storageRemove("pendingMessage");
        return;
    }

    if (!hasUserMessage) {
        clearChatBox();
        addMessage(pending.text, "user");
    }

    addMessage("Thinking...", "bot", { thinking: true }).classList.add("thinking");
    setTimeout(() => {
        if (storageGet("activeSessionId") === sessionId && getPendingMessage(sessionId)) {
            restoreActiveChat(sessionId);
        }
    }, 2500);
}

function watchPendingResponse(sessionId, thinkingMessage) {
    let attempts = 0;

    const intervalId = setInterval(async () => {
        if (!getPendingMessage(sessionId) || storageGet("activeSessionId") !== sessionId) {
            clearInterval(intervalId);
            return;
        }

        attempts += 1;
        const response = await authFetch(`${API_URL}/chats/${sessionId}`);
        if (!response.ok) return;

        const data = await response.json();
        const messages = data.messages || [];
        const latestUserIndex = messages.reduce((latestIndex, msg, index) => {
            return msg.role === "user" ? index : latestIndex;
        }, -1);
        const assistantReply = latestUserIndex !== -1
            ? messages.slice(latestUserIndex + 1).find((msg) => msg.role !== "user")
            : null;

        if (assistantReply) {
            storageRemove("pendingMessage");
            lastAssistantText = assistantReply.content;

            if (thinkingMessage.isConnected) {
                updateMessage(thinkingMessage, assistantReply.content);
            } else {
                await renderSavedChat(sessionId);
            }

            await loadChatSessions();
            highlightActiveSession();
            clearInterval(intervalId);
        }

        if (attempts >= 48) {
            clearInterval(intervalId);
        }
    }, 2500);
}

function stopGenerating() {
    const requestId = activeRequestId;
    if (requestId) {
        authFetch(`${API_URL}/cancel-generation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_id: requestId })
        }).catch(() => {});
    }

    if (activeAbortController) {
        activeAbortController.abort();
    }

    storageRemove("pendingMessage");

    if (activeThinkingMessage?.isConnected) {
        updateMessage(activeThinkingMessage, "Generation stopped.", { stopped: true });
    }
    showToast("Generation stopped.");

    activeAbortController = null;
    activeThinkingMessage = null;
    activeRequestId = "";
    setBusy(false);
    userInput.focus();
}

function regenerateAnswer() {
    if (!lastRequestConfig || !lastUserPrompt || isSending) return;

    sendToAssistant(
        lastRequestConfig.endpoint,
        (message) => {
            if (lastRequestConfig.mode === "pdf") {
                return { question: message, session_id: currentSessionId };
            }
            return { message, session_id: currentSessionId };
        },
        lastRequestConfig.thinkingText || "Regenerating...",
        lastRequestConfig.shouldSpeak || false,
        lastUserPrompt
    );
}

async function sendToAssistant(endpoint, payload, thinkingText, shouldSpeak = false, overrideMessage = "") {
    if (isSending) return;

    let message = overrideMessage || userInput.value.trim();
    if (!message && attachedImage) {
        message = "Please review this attached image for the error or issue I want to fix.";
    }
    if (!message) return;

    hasUserInteracted = true;

    if (!currentSessionId) {
        setSession(createClientSessionId());
    }

    if (currentSessionId) {
        storageSet("activeSessionId", currentSessionId);
        tabStorageSet("activeSessionId", currentSessionId);
    }

    setBusy(true);
    activeAbortController = new AbortController();
    activeRequestId = createClientSessionId();
    let submittedMessage = message;
    const imageFile = overrideMessage ? null : attachedImage;
    const imageUrl = imageFile ? URL.createObjectURL(imageFile) : null;

    if (imageFile && endpoint !== "/ask-pdf") {
        submittedMessage = `${message}\n\nAttached image: ${imageFile.name}\nUse my written error details with this screenshot/image context.`;
    }

    savePendingMessage(currentSessionId || "pdf-session", submittedMessage);
    lastUserPrompt = message;
    lastRequestConfig = {
        endpoint,
        thinkingText: "Regenerating...",
        shouldSpeak,
        mode: endpoint === "/ask-pdf" ? "pdf" : "chat"
    };
    addMessage(submittedMessage, "user", { imageUrl });
    userInput.value = "";
    clearAttachedImage();
    resizeComposer();

    const thinkingMessage = addMessage(thinkingText, "bot", { thinking: true });
    thinkingMessage.classList.add("thinking");
    activeThinkingMessage = thinkingMessage;
    watchPendingResponse(currentSessionId || "pdf-session", thinkingMessage);

    try {
        let response;

        if (imageFile && endpoint !== "/ask-pdf") {
            const formData = new FormData();
            formData.append("message", submittedMessage);
            formData.append("session_id", currentSessionId);
            formData.append("request_id", activeRequestId);
            formData.append("file", imageFile);

            response = await authFetch(`${API_URL}/image-chat`, {
                method: "POST",
                body: formData,
                signal: activeAbortController.signal
            });
        } else {
            response = await authFetch(`${API_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload(message),
                    request_id: activeRequestId
                }),
                signal: activeAbortController.signal
            });
        }

        if (!response.ok) throw new Error("Backend request failed");

        const data = await response.json();
        if (data.cancelled) {
            storageRemove("pendingMessage");
            updateMessage(thinkingMessage, "Generation stopped.");
            return;
        }

        const answer = data.response || data.answer || "Response generated.";

        if (data.session_id) {
            setSession(data.session_id, chatNames[data.session_id] || submittedMessage.slice(0, 42));
        }

        lastAssistantText = answer;
        storageRemove("pendingMessage");

        if (thinkingMessage.isConnected) {
            updateMessage(thinkingMessage, answer);
        }

        if (data.session_id) {
            setSession(data.session_id, chatNames[data.session_id] || submittedMessage.slice(0, 42));
        }

        if (!thinkingMessage.isConnected) {
            clearChatBox();
            addMessage(submittedMessage, "user");
            addMessage(answer, "bot");
        }

        await loadChatSessions();
        highlightActiveSession();

        if (shouldSpeak) {
            speakText(answer);
        }
    } catch (error) {
        console.error(error);
        if (error.name === "AbortError") {
            updateMessage(thinkingMessage, "Generation stopped.");
        } else {
            updateMessage(thinkingMessage, "Error connecting to backend. Please check that the server is running.");
        }
    } finally {
        activeAbortController = null;
        activeThinkingMessage = null;
        activeRequestId = "";
        setBusy(false);
        userInput.focus();
    }
}

async function sendMessage() {
    if (attachedPdf) {
        await uploadPDF(true);
        return;
    }

    const message = userInput.value.trim().toLowerCase();
    const wantsPdfAnswer = activePdfName && /\b(pdf|document|uploaded|file|notes|according to|summary|summarize)\b/i.test(message);
    if (wantsPdfAnswer && !attachedImage) {
        askPDF();
        return;
    }

    sendToAssistant(
        "/chat",
        (message) => ({ message, session_id: currentSessionId }),
        "Thinking..."
    );
}

function sendVoiceMessage() {
    sendToAssistant(
        "/voice-chat",
        (message) => ({ message, session_id: currentSessionId }),
        "Thinking with voice...",
        true
    );
}

function askPDF() {
    sendToAssistant(
        "/ask-pdf",
        (question) => ({ question, session_id: currentSessionId }),
        "Searching PDF..."
    );
}

function getSpeechRecognition() {
    return window.SpeechRecognition
        || window.webkitSpeechRecognition
        || window.mozSpeechRecognition
        || window.msSpeechRecognition;
}

function refreshVoiceAvailability() {
    if (!composerMicBtn) return;

    const isSupported = Boolean(navigator.mediaDevices?.getUserMedia || getSpeechRecognition());
    composerMicBtn.disabled = false;
    composerMicBtn.title = isSupported
        ? "Voice input"
        : "Voice input needs microphone support in this browser";

    if (!isSupported) {
        setVoiceState("Browser unsupported.");
        if (voiceModuleState) {
            voiceModuleState.textContent = "Unsupported";
        }
    } else {
        setVoiceState("Voice ready");
    }
}

function clearMicTimers() {
    clearTimeout(micStopTimer);
    clearTimeout(micNoSpeechTimer);
    micStopTimer = null;
    micNoSpeechTimer = null;
}

function cleanupMicRecording() {
    clearMicTimers();

    if (micMonitorFrame) {
        cancelAnimationFrame(micMonitorFrame);
        micMonitorFrame = null;
    }

    if (micAudioContext) {
        micAudioContext.close().catch(() => {});
        micAudioContext = null;
    }

    if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
        micStream = null;
    }

    micAnalyser = null;
}

function chooseAudioMimeType() {
    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg"
    ];

    return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopMediaListening(reason = "manual") {
    micStopReason = reason;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        return;
    }

    cleanupMicRecording();
    isListening = false;
    setVoiceState("Listening stopped.");
}

function monitorMicVolume() {
    if (!micAnalyser || !isListening) return;

    const data = new Uint8Array(micAnalyser.fftSize);
    micAnalyser.getByteTimeDomainData(data);

    let total = 0;
    for (const value of data) {
        const centered = value - 128;
        total += centered * centered;
    }

    const volume = Math.sqrt(total / data.length);
    const now = Date.now();

    if (volume > 8) {
        micHeardAudio = true;
        micLastSpeechAt = now;
        setVoiceState("Listening to your voice...");
    }

    if (micHeardAudio && now - micLastSpeechAt > 1500) {
        stopMediaListening("silence");
        return;
    }

    micMonitorFrame = requestAnimationFrame(monitorMicVolume);
}

async function transcribeRecordedAudio(blob) {
    if (!blob || blob.size < 500) {
        setVoiceState("Listening stopped. No voice detected.");
        showToast("Listening stopped. No voice detected.", "error");
        return;
    }

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    try {
        setVoiceState("Converting voice to text...");
        const response = await authFetch(`${API_URL}/speech-to-text`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "Speech transcription failed");
        }

        const transcript = (data.text || "").trim();
        if (!transcript) {
            setVoiceState("Listening stopped. No voice detected.");
            showToast("Listening stopped. No voice detected.", "error");
            return;
        }

        userInput.value = transcript;
        resizeComposer();
        userInput.focus();
        setVoiceState("Voice captured. Click Send.");
        showToast("Voice captured. Press send.", "success");
    } catch (error) {
        console.error(error);
        setVoiceState("Voice transcription failed.");
        showToast(error.message || "Voice transcription failed.", "error");
    }
}

async function startMediaListening() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        return false;
    }

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micRecordingChunks = [];
    micHeardAudio = false;
    micLastSpeechAt = Date.now();
    micStopReason = "manual";

    const mimeType = chooseAudioMimeType();
    mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            micRecordingChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(micRecordingChunks, {
            type: mediaRecorder.mimeType || "audio/webm"
        });

        cleanupMicRecording();
        isListening = false;

        if (!micHeardAudio || micStopReason === "no-speech") {
            setVoiceState("Listening stopped. No voice detected.");
            showToast("Listening stopped. No voice detected.", "error");
            return;
        }

        await transcribeRecordedAudio(audioBlob);
    };

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        cleanupMicRecording();
        return false;
    }

    micAudioContext = new AudioContextClass();
    const source = micAudioContext.createMediaStreamSource(micStream);
    micAnalyser = micAudioContext.createAnalyser();
    micAnalyser.fftSize = 1024;
    source.connect(micAnalyser);

    mediaRecorder.start();
    isListening = true;
    setVoiceState("Listening...");
    showToast("Listening started.");
    micMonitorFrame = requestAnimationFrame(monitorMicVolume);
    micNoSpeechTimer = setTimeout(() => {
        if (!micHeardAudio) stopMediaListening("no-speech");
    }, 3500);
    micStopTimer = setTimeout(() => stopMediaListening("timeout"), 12000);

    return true;
}

function setVoiceState(text) {
    if (voiceStatus) {
        voiceStatus.textContent = text;
    }
    if (voiceModuleState) {
        voiceModuleState.textContent = text.includes("Listening") ? "Listening" : "Ready";
    }
    if (composerMicBtn) {
        const listening = text.includes("Listening");
        composerMicBtn.classList.toggle("listening", listening);
        composerMicBtn.setAttribute("aria-pressed", listening ? "true" : "false");
    }
}

async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
        return true;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
}

async function startListening() {
    if (isListening) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            stopMediaListening("manual");
            return;
        }
        if (recognition) {
            recognition.stop();
            return;
        }
    }

    try {
        const startedMediaRecording = await startMediaListening();
        if (startedMediaRecording) {
            return;
        }
    } catch (error) {
        console.error(error);
        setVoiceState("Mic permission blocked.");
        showToast("Allow microphone permission, then try again.", "error");
        return;
    }

    const ActiveSpeechRecognition = getSpeechRecognition();

    if (!ActiveSpeechRecognition) {
        setVoiceState("Voice not supported.");
        showToast("Mic input is not supported in this browser.", "error");
        return;
    }

    try {
        await ensureMicrophonePermission();
    } catch (error) {
        setVoiceState("Mic permission blocked.");
        showToast("Allow microphone permission, then try again.", "error");
        return;
    }

    if (recognition) {
        recognition.stop();
    }

    recognition = new ActiveSpeechRecognition();
    recognition.lang = navigator.language?.startsWith("hi") ? "hi-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    heardSpeech = false;
    listeningError = false;

    recognition.onstart = () => {
        isListening = true;
        setVoiceState("Listening...");
        showToast("Listening started.");
    };

    recognition.onspeechstart = () => {
        heardSpeech = true;
        setVoiceState("Listening to your voice...");
    };

    recognition.onresult = (event) => {
        let transcript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            transcript += event.results[index][0].transcript;
        }

        if (transcript.trim()) {
            userInput.value = transcript.trim();
            resizeComposer();
            heardSpeech = true;
        }
    };

    recognition.onerror = (event) => {
        isListening = false;
        listeningError = true;
        const errorMessage = event.error === "no-speech"
            ? "Listening stopped. No voice detected."
            : "Mic error. Allow microphone permission and try again.";
        setVoiceState(errorMessage);
        showToast(errorMessage, "error");
    };

    recognition.onend = () => {
        isListening = false;
        if (listeningError) {
            return;
        }
        if (userInput.value.trim()) {
            setVoiceState("Voice captured. Click Send.");
            showToast("Voice captured. Press send.");
            userInput.focus();
            return;
        }

        if (!heardSpeech) {
            setVoiceState("Listening stopped. I did not hear anything.");
            showToast("Listening stopped. No voice detected.");
        } else {
            setVoiceState("Listening stopped.");
            showToast("Listening stopped.");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        isListening = false;
        setVoiceState("Mic could not start. Try again.");
        showToast("Mic could not start. Try again.", "error");
    }
}

async function uploadPDF(askAfterUpload = false) {
    const selectedFile = attachedPdf || pdfFile.files[0];
    const question = userInput.value.trim();
    const label = getFileLabel(selectedFile);

    if (!selectedFile) {
        showToast("Choose a file first.", "error");
        openPdfPicker();
        return;
    }

    if (!currentSessionId) {
        setSession(createClientSessionId());
    }

    if (askAfterUpload && question) {
        await uploadPdfAndAsk(selectedFile, question);
        return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("session_id", currentSessionId);
    setBusy(true);
    const uploadMessage = addMessage(`Attached ${label}: ${selectedFile.name}`, "user");
    const thinkingMessage = addMessage(`Reading ${label}...`, "bot", { thinking: true });
    thinkingMessage.classList.add("thinking");
    userInput.value = "";
    clearAttachedImage();
    resizeComposer();

    try {
        const response = await authFetch(`${API_URL}/upload-pdf`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error("Upload failed");
        const data = await response.json();

        if (data.session_id) {
            setSession(data.session_id, chatNames[data.session_id] || `PDF: ${selectedFile.name}`);
        }

        if (data.status === "failed") {
            updateMessage(uploadMessage, `${label} upload failed: ${data.message || "No readable text found."}`);
            updateMessage(thinkingMessage, "File could not be processed.");
            showToast("File upload failed.", "error");
            return;
        }

        const uploadedName = data.file_name || selectedFile.name;
        activePdfName = uploadedName;
        updateMessage(uploadMessage, `Active document set: ${uploadedName}\nChunks stored: ${data.chunks_stored || 0}\nDocument questions will answer only from this file.`);
        if (question && askAfterUpload) {
            thinkingMessage.remove();
        } else {
            updateMessage(thinkingMessage, "File is ready. Attach another file to replace it, or ask normal questions anytime.");
        }
        await loadChatSessions();
        highlightActiveSession();
        showToast("File uploaded and ready.", "success");

        if (question && askAfterUpload) {
            setBusy(false);
            await sendToAssistant(
                "/ask-pdf",
                (pdfQuestion) => ({ question: pdfQuestion, session_id: currentSessionId }),
                "Searching PDF...",
                false,
                question
            );
        }
    } catch (error) {
        updateMessage(uploadMessage, "File upload failed. Please try again.");
        updateMessage(thinkingMessage, "File upload failed. Please try again.");
        console.error(error);
        showToast("File upload failed.", "error");
    } finally {
        setBusy(false);
    }
}

async function uploadPdfAndAsk(selectedFile, question) {
    const label = getFileLabel(selectedFile);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("session_id", currentSessionId);
    formData.append("question", question);

    setBusy(true);
    activeAbortController = new AbortController();
    activeRequestId = createClientSessionId();
    formData.append("request_id", activeRequestId);

    const uploadMessage = addMessage(`Attached ${label}: ${selectedFile.name}`, "user");
    addMessage(question, "user");
    userInput.value = "";
    clearAttachedImage();
    resizeComposer();
    const thinkingMessage = addMessage(`Reading ${label} and preparing answer...`, "bot", { thinking: true });
    thinkingMessage.classList.add("thinking");
    activeThinkingMessage = thinkingMessage;

    try {
        const response = await authFetch(`${API_URL}/upload-pdf-and-ask`, {
            method: "POST",
            body: formData,
            signal: activeAbortController.signal
        });

        if (!response.ok) throw new Error("Document question failed");

        const data = await response.json();
        if (data.cancelled) {
            updateMessage(thinkingMessage, "Generation stopped.");
            return;
        }

        if (data.session_id) {
            setSession(data.session_id, chatNames[data.session_id] || `PDF: ${selectedFile.name}`);
        }

        if (data.status === "failed") {
            updateMessage(uploadMessage, `${label} upload failed: ${data.message || "No readable text found."}`);
            updateMessage(thinkingMessage, data.answer || "File could not be processed.");
            showToast("File upload failed.", "error");
            await loadChatSessions();
            highlightActiveSession();
            return;
        }

        activePdfName = data.file_name || selectedFile.name;
        updateMessage(uploadMessage, `Active document set: ${activePdfName}\nChunks stored: ${data.chunks_stored || 0}`);
        updateMessage(thinkingMessage, data.answer || "PDF answer generated.");

        lastAssistantText = data.answer || "";
        await loadChatSessions();
        highlightActiveSession();
        showToast("File uploaded and answered.", "success");
    } catch (error) {
        console.error(error);
        if (error.name === "AbortError") {
            updateMessage(thinkingMessage, "Generation stopped.");
        } else {
            updateMessage(thinkingMessage, "Document answer failed. Please try again.");
            showToast("Document answer failed.", "error");
        }
    } finally {
        activeAbortController = null;
        activeThinkingMessage = null;
        activeRequestId = "";
        setBusy(false);
    }
}

window.newChat = newChat;
window.logout = logout;
window.openMobileSidebar = openMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.setAuthMode = setAuthMode;
window.uploadPDF = uploadPDF;
window.startListening = startListening;
window.openImagePicker = openImagePicker;
window.openPdfPicker = openPdfPicker;
window.toggleAttachmentMenu = toggleAttachmentMenu;
window.clearAttachedImage = clearAttachedImage;
window.sendVoiceMessage = sendVoiceMessage;
window.speakText = speakText;
window.stopSpeaking = stopSpeaking;
window.stopGenerating = stopGenerating;
window.regenerateAnswer = regenerateAnswer;
window.toggleTheme = toggleTheme;
window.handlePrimaryAction = handlePrimaryAction;
window.quickPrompt = quickPrompt;
window.sendMessage = sendMessage;
window.askPDF = askPDF;
Object.defineProperty(window, "lastAssistantText", {
    get() {
        return lastAssistantText;
    }
});

function attachWindowActions() {
    window.newChat = newChat;
    window.logout = logout;
    window.openMobileSidebar = openMobileSidebar;
    window.closeMobileSidebar = closeMobileSidebar;
    window.setAuthMode = setAuthMode;
    window.uploadPDF = uploadPDF;
    window.startListening = startListening;
    window.openImagePicker = openImagePicker;
    window.openPdfPicker = openPdfPicker;
    window.toggleAttachmentMenu = toggleAttachmentMenu;
    window.clearAttachedImage = clearAttachedImage;
    window.sendVoiceMessage = sendVoiceMessage;
    window.speakText = speakText;
    window.stopSpeaking = stopSpeaking;
    window.stopGenerating = stopGenerating;
    window.regenerateAnswer = regenerateAnswer;
    window.toggleTheme = toggleTheme;
    window.handlePrimaryAction = handlePrimaryAction;
    window.quickPrompt = quickPrompt;
    window.sendMessage = sendMessage;
    window.askPDF = askPDF;
}

attachWindowActions();

pdfFile.addEventListener("change", () => {
    setAttachedFile(pdfFile.files[0]);
});

imageInput.addEventListener("change", () => {
    setAttachedImage(imageInput.files[0]);
});

document.addEventListener("click", (event) => {
    if (!attachmentMenu || attachmentMenu.hidden) return;
    if (event.target.closest(".attach-wrap")) return;
    closeAttachmentMenu();
});

userInput.addEventListener("input", resizeComposer);
userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authStatus.textContent = "";
    authSubmitBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/auth/${authMode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: authName.value.trim(),
                email: authEmail.value.trim(),
                password: authPassword.value
            })
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 404) {
                completeLocalLogin(authName.value.trim(), authEmail.value.trim());
                showAppForUser();
                clearChatBox();
                setSession(null);
                addWelcomeMessage();
                await loadChatSessions();
                return;
            }
            throw new Error(data.detail || "Authentication failed.");
        }

        authToken = data.token;
        authUser = data.user;
        localAuth = false;
        storageSet("authToken", authToken);
        storageSet("authUser", JSON.stringify(authUser));
        storageRemove("localAuth");
        storageRemove("activeSessionId");
        tabStorageRemove("activeSessionId");
        storageRemove("pendingMessage");
        currentSessionId = null;

        showAppForUser();
        clearChatBox();
        setSession(null);
        addWelcomeMessage();
        await loadChatSessions();
    } catch (error) {
        if (error.message === "Failed to fetch") {
            authStatus.textContent = `Backend not reachable at ${API_URL}. Start backend on port 8000 and try again.`;
        } else {
            authStatus.textContent = error.message;
        }
    } finally {
        authSubmitBtn.disabled = false;
    }
});

async function initApp() {
    setAuthMode("login");
    refreshVoiceAvailability();
    storageSet("apiUrl", API_URL);

    if (!authToken || !authUser) {
        showLogin();
        return;
    }

    showAppForUser();
    await loadChatSessions();

    const pending = getAnyPendingMessage();
    if (pending) {
        storageSet("activeSessionId", pending.sessionId);
        tabStorageSet("activeSessionId", pending.sessionId);
        currentSessionId = pending.sessionId;
        await restoreActiveChat(pending.sessionId);
    } else if (tabStorageGet("activeSessionId")) {
        currentSessionId = tabStorageGet("activeSessionId");
        await renderSavedChat(currentSessionId);
    } else {
        currentSessionId = null;
        storageRemove("activeSessionId");
        tabStorageRemove("activeSessionId");
        clearChatBox();
        setSession(null);
        addWelcomeMessage();
    }

    hasUserInteracted = false;
    resizeComposer();
}

initApp();
applyTheme(currentTheme);
