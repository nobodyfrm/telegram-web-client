// Einfaches clientseitiges Beispiel für eine TDLib-WASM-Integration.
// Anpassung möglich je nach tdweb-Build/API.

// UI-Elemente
const apiIdInput = document.getElementById('apiId');
const apiHashInput = document.getElementById('apiHash');
const phoneInput = document.getElementById('phone');
const initBtn = document.getElementById('initBtn');
const sendPhoneBtn = document.getElementById('sendPhoneBtn');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const loginCodeArea = document.getElementById('loginCodeArea');
const codeInput = document.getElementById('code');
const statusEl = document.getElementById('status');
const chatsSection = document.getElementById('chatsSection');
const refreshChatsBtn = document.getElementById('refreshChatsBtn');
const chatsList = document.getElementById('chatsList');

let client = null;
let isAuthorized = false;

function setStatus(text) {
    statusEl.textContent = 'Status: ' + text;
}

initBtn.addEventListener('click', async () => {
    const apiId = Number(apiIdInput.value.trim());
    const apiHash = apiHashInput.value.trim();

    if (!apiId || !apiHash) {
        alert('Bitte API_ID und API_HASH eingeben (von https://my.telegram.org/apps).');
        return;
    }

    setStatus('Initialisiere TDLib (WASM)...');

    if (!window.tdweb && !window.Td && !window.TdWeb && !window.TDLib) {
        setStatus('TDLib/WASM nicht gefunden. Lege tdweb.js (oder passende Datei) in den Ordner und lade die Seite neu.');
        console.error('TDLib/WASM global object not found. Available globals:', Object.keys(window).slice(0,50));
        return;
    }

    try {
        if (window.tdweb && typeof window.tdweb.createClient === 'function') {
            client = window.tdweb.createClient();
        } else if (window.Td && typeof window.Td.createClient === 'function') {
            client = window.Td.createClient();
        } else if (window.TdWeb && typeof window.TdWeb.createClient === 'function') {
            client = window.TdWeb.createClient();
        } else if (window.TDLib && typeof window.TDLib.createClient === 'function') {
            client = window.TDLib.createClient();
        } else if (window.tdweb && typeof window.tdweb === 'object') {
            client = window.tdweb;
        } else if (typeof window.createTdClient === 'function') {
            client = window.createTdClient();
        } else {
            const maybe = ['tdweb','Td','TdWeb','TDLib'].map(k=>window[k]).find(v => v && typeof v.invoke === 'function');
            if (maybe) client = maybe;
        }
    } catch (e) {
        console.error('Fehler beim Erzeugen des Clients:', e);
    }

    if (!client) {
        setStatus('Konnte keinen passenden TDLib-Client in der tdweb-Build finden. Siehe README.');
        return;
    }

    if (typeof client.on === 'function') {
        client.on('update', onUpdate);
    } else if (typeof client.addEventListener === 'function') {
        client.addEventListener('update', (ev) => onUpdate(ev.detail || ev));
    } else {
        console.warn('client.on nicht gefunden, Updates werden evtl. nicht empfangen.');
    }

    setStatus('Setze TDLib-Parameter...');
    try {
        await invoke({
            '@type': 'setTdlibParameters',
            'parameters': {
                'use_test_dc': false,
                'api_id': apiId,
                'api_hash': apiHash,
                'system_language_code': 'de',
                'device_model': 'Browser',
                'system_version': 'Web',
                'application_version': '1.0',
                'enable_storage_optimizer': true
            }
        });

        await invoke({ '@type': 'checkDatabaseEncryptionKey', 'encryption_key': '' });

        setStatus('TDLib initialisiert. Bitte Telefonnummer senden.');
        sendPhoneBtn.disabled = false;
    } catch (err) {
        console.error('Fehler bei setTdlibParameters:', err);
        setStatus('Fehler beim Initialisieren: ' + (err && err.message ? err.message : String(err)));
    }
});

function invoke(obj) {
    if (!client) return Promise.reject(new Error('Kein TDLib-Client initialisiert'));

    if (typeof client.invoke === 'function') {
        return client.invoke(obj);
    } else if (typeof client.send === 'function') {
        return client.send(obj);
    } else if (typeof client.postMessage === 'function') {
        client.postMessage(obj);
        return Promise.resolve();
    } else {
        return Promise.reject(new Error('TDLib-Client unterstützt weder invoke noch send.'));
    }
}

sendPhoneBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim();
    if (!phone) { alert('Telefonnummer eingeben'); return; }

    setStatus('Sende Telefonnummer an Telegram...');
    try {
        await invoke({
            '@type': 'setAuthenticationPhoneNumber',
            'phone_number': phone,
            'allow_flash_call': false,
            'is_current_phone_number': false
        });

        setStatus('Telefon gesendet. Warte auf code (achte in Telegram auf SMS/App).');
        loginCodeArea.style.display = 'block';
    } catch (err) {
        console.error('Fehler beim Senden der Telefonnummer:', err);
        setStatus('Fehler beim Senden der Telefonnummer: ' + (err && err.message ? err.message : String(err)));
    }
});

sendCodeBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) { alert('Bitte Code eingeben'); return; }

    setStatus('Sende Code zur Überprüfung...');
    try {
        await invoke({
            '@type': 'checkAuthenticationCode',
            'code': code
        });

        setStatus('Code gesendet. Warte auf Autorisierung...');
    } catch (err) {
        console.error('Fehler beim Senden des Codes:', err);
        setStatus('Fehler beim Senden des Codes: ' + (err && err.message ? err.message : String(err)));
    }
});

function onUpdate(update) {
    try {
        const t = update['@type'] || update.type;
        if (!t) return;

        if (t === 'updateAuthorizationState') {
            const state = update.authorization_state['@type'];
            console.log('Authorization State:', state);

            if (state === 'authorizationStateReady') {
                isAuthorized = true;
                setStatus('Autorisiert — Chats können geladen werden.');
                chatsSection.style.display = 'block';
                loginCodeArea.style.display = 'none';
                sendPhoneBtn.disabled = true;
                refreshChatsBtn.disabled = false;
                loadChats();
            } else if (state === 'authorizationStateWaitCode') {
                setStatus('Gib den Telegram-Code ein (siehe SMS/Telegram App).');
                loginCodeArea.style.display = 'block';
            } else if (state === 'authorizationStateWaitPhoneNumber') {
                setStatus('Bitte Telefonnummer senden.');
            } else if (state === 'authorizationStateClosed') {
                setStatus('Session geschlossen.');
            } else {
                setStatus('Auth-Zustand: ' + state);
            }
        } else {
            // weitere Updates können hier gehandhabt werden
        }
    } catch (e) {
        console.error('Fehler in onUpdate:', e, update);
    }
}

async function loadChats() {
    if (!isAuthorized) { alert('Nicht autorisiert'); return; }
    setStatus('Lade Chats...');

    try {
        const chatsRes = await invoke({
            '@type': 'getChats',
            'offset_order': '9223372036854775807',
            'offset_chat_id': 0,
            'limit': 100
        });

        const chatIds = (chatsRes && chatsRes.chat_ids) || [];
        chatsList.innerHTML = '';
        if (chatIds.length === 0) {
            chatsList.innerHTML = '<li>(keine Chats gefunden)</li>';
            setStatus('Keine Chats gefunden.');
            return;
        }

        const promises = chatIds.map(id => invoke({ '@type': 'getChat', 'chat_id': id }).catch(e => null));
        const chats = await Promise.all(promises);

        for (const c of chats) {
            if (!c) continue;
            const li = document.createElement('li');
            const title = chatTitleFromChatObject(c);
            li.textContent = title + ' (id: ' + c.id + ')';
            chatsList.appendChild(li);
        }

        setStatus('Chats geladen (' + chatIds.length + ').');
    } catch (err) {
        console.error('Fehler beim Laden der Chats:', err);
        setStatus('Fehler beim Laden der Chats: ' + (err && err.message ? err.message : String(err)));
    }
}

refreshChatsBtn.addEventListener('click', loadChats);

function chatTitleFromChatObject(chat) {
    if (!chat) return '(unbekannter Chat)';
    if (chat.title) return chat.title;
    if (chat.type && chat.type['@type'] === 'chatTypePrivate' && chat.type.user_id) {
        return 'Privater Chat: ' + chat.type.user_id;
    }
    return 'Chat ' + (chat.id || '(id?)');
}

window.addEventListener('load', () => {
    setStatus('Bereit. Bitte API_ID/API_HASH eingeben und TDLib initialisieren.');
});