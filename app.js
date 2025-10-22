(function () {
  function main() {
    // UI-Elemente (erst im main initialisieren, damit DOM vorhanden ist)
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
    let invokeTdl = null; // function to invoke TDLib JSON methods
    let isAuthorized = false;

    function setStatus(text) {
      if (statusEl) statusEl.textContent = 'Status: ' + text;
      console.info('Status:', text);
    }

    // Utility: erkenne echte Client-Instanz (nur Objekte, keine Funktionen)
    function looksLikeClientInstance(obj) {
      if (!obj || typeof obj !== 'object') return false;
      return (
        typeof obj.invoke === 'function' ||
        typeof obj.send === 'function' ||
        typeof obj.request === 'function' ||
        typeof obj.invokeJSON === 'function' ||
        typeof obj.postMessage === 'function'
      );
    }

    // Versuche tdweb-Modul von bekannten globalen Namen zu ermitteln und ggf. awaiten
    async function resolveTdwebModule() {
      const globals = ['tdweb', 'Td', 'TdWeb', 'TDLib', 'TDWeb', 'TdClient', '@dibgram_tdweb'];
      for (const name of globals) {
        if (window[name]) {
          const mod = window[name];
          if (typeof mod.then === 'function') {
            try {
              return await mod;
            } catch (e) {
              console.warn('Fehler beim awaiten von', name, e);
              continue;
            }
          }
          if (mod && typeof mod === 'object' && mod.default) return mod.default;
          return mod;
        }
      }
      return undefined;
    }

    // Instantiate client from module - prefer new for class exports; only treat objects as instances
    async function instantiateClientFromModule(mod, options = {}) {
      if (!mod) throw new Error('tdweb module not available');

      console.debug('tdweb module shape:', mod);

      // If mod already looks like a client instance (must be an object, not a function)
      if (looksLikeClientInstance(mod)) {
        console.debug('Modul ist bereits eine echte Client-Instanz.');
        return mod;
      }

      // If module exposes a TdClient class/object, prefer instantiating it
      if (mod && typeof mod.TdClient === 'function') {
        try {
          console.debug('Instanziere mod.TdClient mit Optionen');
          return new mod.TdClient(options);
        } catch (e) {
          console.warn('mod.TdClient(options) fehlgeschlagen, versuche new mod.TdClient():', e);
          try { return new mod.TdClient(); } catch (e2) { console.error(e2); }
        }
      }
      if (mod && mod.default && typeof mod.default.TdClient === 'function') {
        try {
          console.debug('Instanziere mod.default.TdClient mit Optionen');
          return new mod.default.TdClient(options);
        } catch (e) {
          console.warn('mod.default.TdClient(options) fehlgeschlagen, versuche new mod.default.TdClient():', e);
          try { return new mod.default.TdClient(); } catch (e2) { console.error(e2); }
        }
      }

      // If module exposes createClient(), try that
      if (typeof mod.createClient === 'function') {
        try {
          const maybe = mod.createClient(options);
          if (maybe && typeof maybe.then === 'function') return await maybe;
          if (looksLikeClientInstance(maybe)) return maybe;
        } catch (e) {
          console.warn('mod.createClient(...) schlug fehl:', e);
        }
      }

      // If module itself is a function (could be class), prefer 'new' (class) first
      if (typeof mod === 'function') {
        try {
          console.debug('Versuche new mod(options)');
          const inst = new mod(options);
          if (looksLikeClientInstance(inst)) return inst;
          if (inst) return inst;
        } catch (newErr) {
          console.warn('new mod(options) schlug fehl, versuche new mod() fallback:', newErr);
          try {
            const inst2 = new mod();
            if (looksLikeClientInstance(inst2)) return inst2;
            if (inst2) return inst2;
          } catch (newErr2) {
            console.warn('new mod() ebenfalls fehlgeschlagen:', newErr2);
            // As a last resort, try calling as factory
            try {
              console.debug('Versuche mod(options) als Factory-Fallback');
              const res = mod(options);
              if (res && typeof res.then === 'function') {
                const awaited = await res;
                if (looksLikeClientInstance(awaited)) return awaited;
              } else if (looksLikeClientInstance(res)) {
                return res;
              }
            } catch (callErr) {
              console.error('mod(options) Aufruf ebenfalls fehlgeschlagen:', callErr);
              throw new Error('Konnte das modul nicht instanziieren (weder new noch call funktionieren). Siehe Konsole für Details.');
            }
          }
        }
      }

      // If default export is present, retry recursively
      if (mod && mod.default) {
        return instantiateClientFromModule(mod.default, options);
      }

      throw new Error('Konnte aus dem tdweb-Modul keinen Client erzeugen (keine bekannte Exportform gefunden).');
    }

    // Wrap various client API shapes into a uniform invoke function that returns a Promise
    function makeInvokerFromClient(c) {
      if (!c) throw new Error('Kein TDLib-Client übergeben');

      // Ensure it's an object (not a constructor function)
      if (typeof c === 'function' && !looksLikeClientInstance(c)) {
        throw new Error('Erwartete eine Client-Instanz, aber ein Konstruktor/Funktion wurde übergeben. Instanziiere das Modul zuerst mit "new". Objekt: ' + String(c));
      }

      if (typeof c.invoke === 'function') {
        return obj => c.invoke(obj);
      }
      if (typeof c.send === 'function') {
        return obj => {
          const res = c.send(obj);
          return (res && typeof res.then === 'function') ? res : Promise.resolve(res);
        };
      }
      if (typeof c.request === 'function') {
        return obj => {
          const res = c.request(obj);
          return (res && typeof res.then === 'function') ? res : Promise.resolve(res);
        };
      }
      if (typeof c.invokeJSON === 'function') {
        return obj => {
          const res = c.invokeJSON(obj);
          return (res && typeof res.then === 'function') ? res : Promise.resolve(res);
        };
      }
      if (typeof c.postMessage === 'function') {
        return obj => {
          try {
            c.postMessage(obj);
            return Promise.resolve();
          } catch (e) {
            return Promise.reject(e);
          }
        };
      }

      const shape = Object.keys(c).slice(0, 40);
      throw new Error('TDLib-Client unterstützt nicht die erwarteten Methoden (invoke/send/request/invokeJSON/postMessage). Client keys sample: ' + JSON.stringify(shape));
    }

    async function initializeTdlibClient(apiId, apiHash) {
      setStatus('Lade/initialisiere TDLib (WASM) Modul (fix-call-detection)...');

      const mod = await resolveTdwebModule();
      if (!mod) {
        setStatus('TDLib/WASM-Modul nicht gefunden. Prüfe die geladene tdweb-URL und öffne die Konsole.');
        console.error('tdweb global module not found on window.');
        return;
      }
      console.debug('resolved tdweb module:', mod);

      try {
        client = await instantiateClientFromModule(mod, {
          onUpdate: (u) => {
            try { onUpdate(u); } catch (e) { console.error('onUpdate handler error:', e); }
          }
        });
      } catch (e) {
        console.error('Fehler beim Erzeugen/Instanziieren des Clients:', e);
        setStatus('Fehler beim Erzeugen des TDLib-Clients — siehe Konsole.');
        throw e;
      }

      if (!client) {
        throw new Error('Client-Instanz konnte nicht erzeugt werden (client ist falsy).');
      }

      console.debug('client instance/shape:', client);

      try {
        invokeTdl = makeInvokerFromClient(client);
      } catch (e) {
        console.error('Fehler beim Erzeugen des invoke-Wrapper:', e);
        setStatus('Fehler: ' + e.message + ' (Siehe Konsole).');
        throw e;
      }

      // Register update handler if available
      if (typeof client.on === 'function') {
        client.on('update', onUpdate);
      } else if (typeof client.addEventListener === 'function') {
        client.addEventListener('update', (ev) => onUpdate(ev.detail || ev));
      } else if (typeof client.setOnUpdate === 'function') {
        client.setOnUpdate(onUpdate);
      } else if (typeof client.onUpdate === 'function') {
        client.onUpdate(onUpdate);
      } else {
        console.warn('Update-Handler konnte nicht registriert werden (client.on / addEventListener / setOnUpdate / onUpdate nicht gefunden). Updates evtl. nicht empfangen.');
      }

      // set_tdlib_parameters and DB key
      const setParams = {
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
      };

      console.info('Sende setTdlibParameters mit api_id=', apiId, '(api_hash nicht geloggt)');

      const resParams = await invokeTdl(setParams);
      if (resParams && resParams['@type'] === 'error') {
        console.error('TDLib error response for setTdlibParameters:', resParams);
        throw resParams;
      }

      const resCheck = await invokeTdl({ '@type': 'checkDatabaseEncryptionKey', 'encryption_key': '' });
      if (resCheck && resCheck['@type'] === 'error') {
        console.error('TDLib error response for checkDatabaseEncryptionKey:', resCheck);
        throw resCheck;
      }

      return true;
    }

    // Generic invoke convenience that ensures invokeTdl exists
    function invoke(obj) {
      if (!invokeTdl) return Promise.reject(new Error('Kein TDLib-invoke initialisiert (invokeTdl fehlt)'));
      return invokeTdl(obj);
    }

    // Login: Telefonnummer senden
    async function sendPhoneNumber() {
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
        if (err && err['@type'] === 'error') {
          setStatus('Fehler beim Senden der Telefonnummer: ' + err.message + ' (code ' + err.code + ')');
        } else {
          setStatus('Fehler beim Senden der Telefonnummer: ' + (err && err.message ? err.message : String(err)));
        }
      }
    }

    // Code senden
    async function sendCode() {
      const code = codeInput.value.trim();
      if (!code) { alert('Bitte Code eingeben'); return; }

      setStatus('Sende Code zur Überprüfung...');
      try {
        const res = await invoke({
          '@type': 'checkAuthenticationCode',
          'code': code
        });

        if (res && res['@type'] === 'error') {
          setStatus('Fehler beim Verifizieren des Codes: ' + res.message);
          return;
        }

        setStatus('Code gesendet. Warte auf Autorisierung...');
      } catch (err) {
        console.error('Fehler beim Senden des Codes:', err);
        setStatus('Fehler beim Senden des Codes: ' + (err && err.message ? err.message : String(err)));
      }
    }

    // Update-Handler
    function onUpdate(update) {
      try {
        const t = update && (update['@type'] || update.type);
        if (!t) return;

        if (t === 'updateAuthorizationState') {
          const state = update.authorization_state && update.authorization_state['@type'];
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
          // Weitere Updates können hier behandelt werden
          // console.debug('Update:', update);
        }
      } catch (e) {
        console.error('Fehler in onUpdate:', e, update);
      }
    }

    // Chats laden
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

        if (chatsRes && chatsRes['@type'] === 'error') {
          setStatus('Fehler beim Laden der Chats: ' + chatsRes.message);
          return;
        }

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
    sendPhoneBtn.addEventListener('click', sendPhoneNumber);
    sendCodeBtn.addEventListener('click', sendCode);

    // Haupt-Initialisierer (knüpft UI→TDLib init)
    initBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      // Lese UI-Werte
      const apiIdRaw = apiIdInput.value.trim();
      const apiHash = apiHashInput.value.trim();

      // Validierung
      if (!apiIdRaw || !/^[\d]+$/.test(apiIdRaw)) {
        alert('Bitte eine gültige API_ID eingeben (nur Ziffern). Du bekommst sie unter https://my.telegram.org/apps');
        return;
      }
      const apiId = Number(apiIdRaw);
      if (!Number.isInteger(apiId) || apiId <= 0) {
        alert('API_ID muss eine positive ganze Zahl sein.');
        return;
      }
      if (!apiHash) {
        alert('Bitte API_HASH eingeben (von https://my.telegram.org/apps).');
        return;
      }

      setStatus('Initialisiere TDLib (WASM)...');

      try {
        await initializeTdlibClient(apiId, apiHash);
        setStatus('TDLib initialisiert. Bitte Telefonnummer senden.');
        sendPhoneBtn.disabled = false;
      } catch (err) {
        console.error('Fehler bei Initialisierung:', err);
        if (err && err['@type'] === 'error') {
          setStatus('Fehler bei Initialisierung: ' + err.message + ' (code ' + err.code + ')');
        } else if (err && err.message) {
          setStatus('Fehler beim Initialisieren: ' + err.message);
        } else {
          setStatus('Unbekannter Fehler beim Initialisieren. Siehe Konsole.');
        }
      }
    });

    // Startstatus
    setStatus('Bereit. Bitte API_ID/API_HASH eingeben und TDLib initialisieren.');
  } // end main()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
