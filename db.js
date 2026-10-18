// Configurazione Supabase fornita
const SUPABASE_URL = 'https://rufwnvehlhdcgmjxhqkl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Iq-gLUMnM36Y3k-ZoCYZUg_4TVtZFnr';

// Inizializzazione client Supabase
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authStatusEl = document.getElementById('auth-status');
const authBtn = document.getElementById('auth-btn');
const refreshBtn = document.getElementById('refresh-btn');
const dataViewEl = document.getElementById('data-view');

// GESTIONE POPUP: Se questa finestra è il popup di ritorno da Google OAuth
if (window.opener && (window.location.hash.includes('access_token') || window.location.search.includes('code='))) {
  document.body.innerHTML = `
    <main style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:'EB Garamond',serif;background:#fbfbfa;color:#1a1a1a;">
      <h2 style="font-size:1.8rem;font-weight:500;">Accesso completato</h2>
      <p style="color:#666;margin-top:0.5rem;font-style:italic;">Sincronizzazione della sessione con l'anteprima...</p>
    </main>
  `;

  (async () => {
    let currentSession = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const { data } = await client.auth.getSession();
      if (data?.session) {
        currentSession = data.session;
        break;
      }
      await new Promise(res => setTimeout(res, 200));
    }

    if (currentSession && window.opener) {
      try {
        window.opener.postMessage({
          type: 'SUPABASE_AUTH_SUCCESS',
          session: {
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token
          }
        }, '*');
      } catch (e) {}
    }

    setTimeout(() => {
      try { window.close(); } catch (e) {}
    }, 500);
  })();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Rendering elegante e tabulare con stile coerente a Garamond
function renderTableHtml(data) {
  if (!data || data.length === 0) {
    return `
      <div class="db-empty-state">
        <p class="db-empty-title">Nessun dato trovato</p>
        <p class="db-empty-desc">La tabella "testab" è accessibile ma non contiene record, oppure le policy RLS attive limitano la visibilità.</p>
      </div>
    `;
  }

  // Estrai tutte le chiavi (colonne) uniche mantenendo l'ordine
  const columns = Array.from(
    new Set(data.flatMap(item => Object.keys(item)))
  );

  const theadHtml = `
    <thead>
      <tr>
        ${columns.map(col => `<th><span>${escapeHtml(col)}</span></th>`).join('')}
      </tr>
    </thead>
  `;

  const tbodyHtml = `
    <tbody>
      ${data.map((row, idx) => `
        <tr>
          ${columns.map(col => {
            const val = row[col];
            let displayVal = '';
            if (val === null || val === undefined) {
              displayVal = '<span class="cell-null">—</span>';
            } else if (typeof val === 'object') {
              displayVal = `<span class="cell-json">${escapeHtml(JSON.stringify(val))}</span>`;
            } else {
              displayVal = escapeHtml(String(val));
            }
            return `<td>${displayVal}</td>`;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  return `
    <div class="db-table-responsive">
      <table class="db-table">
        ${theadHtml}
        ${tbodyHtml}
      </table>
    </div>
  `;
}

// Interrogazione tabella con transizione morbida di blur e senza flash
async function fetchTableData() {
  if (!dataViewEl) return;
  
  // Applica effetto blur immediato ma morbido durante il caricamento
  dataViewEl.classList.add('is-loading');

  try {
    const { data, error } = await client.from('testab').select('*');
    
    // Breve attesa per rendere la transizione percepibile e mai a scatto
    await new Promise(r => setTimeout(r, 180));

    if (error) {
      dataViewEl.innerHTML = `
        <div class="db-error-state">
          <p class="db-error-title">Errore risposta Supabase</p>
          <pre class="db-error-code">${escapeHtml(JSON.stringify(error, null, 2))}</pre>
        </div>
      `;
    } else {
      dataViewEl.innerHTML = renderTableHtml(data);
    }
  } catch (err) {
    dataViewEl.innerHTML = `
      <div class="db-error-state">
        <p class="db-error-title">Eccezione di connessione</p>
        <p class="db-error-desc">${escapeHtml(err.message)}</p>
      </div>
    `;
  } finally {
    // Rimuove il blur con transizione CSS fluida
    dataViewEl.classList.remove('is-loading');
  }
}

// Apertura controllata del popup di login Google
async function openLoginPopup() {
  const width = 500;
  const height = 640;
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);

  const popup = window.open(
    'about:blank',
    'supabase_google_auth',
    `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
  );

  const redirectUrl = window.location.origin + window.location.pathname;

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true
    }
  });

  if (error || !data?.url) {
    if (popup) popup.close();
    dataViewEl.innerHTML = `
      <div class="db-error-state">
        <p class="db-error-title">Errore preparazione OAuth</p>
        <p class="db-error-desc">${escapeHtml(error?.message || 'URL OAuth non generato')}</p>
      </div>
    `;
    return;
  }

  popup.location.href = data.url;

  const timer = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(timer);
      updateAuthState();
      fetchTableData();
    }
  }, 1000);
}

// Controllo stato sessione e aggiornamento pulsante
async function updateAuthState() {
  const { data: { session } } = await client.auth.getSession();

  if (session && session.user) {
    const userEmail = session.user.email || 'Utente Autenticato';
    authStatusEl.textContent = 'Connesso: ' + userEmail;
    authBtn.textContent = 'Logout';
    authBtn.onclick = async () => {
      await client.auth.signOut();
      await updateAuthState();
      await fetchTableData();
    };
  } else {
    authStatusEl.textContent = 'Sessione anonima (non autenticato)';
    authBtn.textContent = 'Accedi con Google';
    authBtn.onclick = () => openLoginPopup();
  }
}

// Ricezione token via postMessage per bypassare il partizionamento dell'iframe
window.addEventListener('message', async (event) => {
  if (event.data?.type === 'SUPABASE_AUTH_SUCCESS' && event.data?.session) {
    try {
      await client.auth.setSession({
        access_token: event.data.session.access_token,
        refresh_token: event.data.session.refresh_token
      });
    } catch (e) {
      console.error('Errore setSession nell\'iframe:', e);
    }
    await updateAuthState();
    await fetchTableData();
  }
});

window.addEventListener('storage', (e) => {
  if (e.key && e.key.includes('auth-token')) {
    updateAuthState();
    fetchTableData();
  }
});

window.addEventListener('focus', () => {
  updateAuthState();
});

client.auth.onAuthStateChange((event, session) => {
  updateAuthState();
  fetchTableData();
});

if (refreshBtn) {
  refreshBtn.onclick = () => fetchTableData();
}

// Caricamento iniziale
updateAuthState();
fetchTableData();
