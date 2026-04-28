/* President Panel — fetches the static state JSON, renders, handles
   mode toggle + note-form mailto. No deps. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STATE_URL = '../data/president-state.json';
  const OPERATOR_EMAIL = 'heskeny@gmail.com';

  // ── mode toggle ───────────────────────────────────────────
  const setMode = (m) => {
    document.body.dataset.mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    try { localStorage.setItem('president.mode', m); } catch (e) {}
  };
  document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  try { const m = localStorage.getItem('president.mode'); if (m) setMode(m); } catch (e) {}

  // ── fetch state + render ──────────────────────────────────
  fetch(STATE_URL, { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      const stamp = data.generated_at || '';
      $('pill-stamp').innerHTML = `<strong>Synced</strong>${esc(stamp)}`;
      $('foot-stamp').textContent = `state: ${stamp}`;
      const stats = data.stats || {};
      $('pill-active').innerHTML = `<strong>Active</strong>${stats.active_projects || 0}`;

      renderKpis(data, stats);
      renderFlow(data.system_flow || {});
      renderDeploys(data.deployments || []);
      renderSharePoint(data.sharepoint || []);
      renderProjects(data.checklist || {});
      renderWins(data.wins || []);
      renderTruth(data.truth_gate || {});
    })
    .catch(err => {
      $('foot-stamp').textContent = 'failed to load state — ' + err.message;
      $('pill-stamp').innerHTML = `<strong>Synced</strong>offline`;
      $('pill-stamp').classList.add('err');
    });

  // ── KPI strip values ─────────────────────────────────────
  function renderKpis(data, stats) {
    if ($('kpi-active'))   $('kpi-active').textContent   = stats.active_projects ?? '—';
    if ($('kpi-progress')) $('kpi-progress').textContent = (stats.avg_progress != null) ? `${stats.avg_progress}%` : '—';
    if ($('kpi-truth')) {
      const t = data.truth_gate || {};
      $('kpi-truth').textContent = (t.available && (t.total||0) > 0)
        ? `${Math.round(((t.pass||0)/t.total)*100)}%`
        : '—';
    }
    if ($('kpi-deploy')) {
      const d = data.deployments || [];
      const last = d.map(x => x.last_deploy_at).filter(Boolean).sort().pop();
      $('kpi-deploy').textContent = last ? last.replace('T', ' ').replace('Z', '') : '—';
    }
    if ($('kpi-customers')) $('kpi-customers').textContent = stats.paid_customers ?? 1;
    if ($('kpi-shipped'))   $('kpi-shipped').textContent   = stats.total_milestones ?? '—';
  }

  // ── deployment status grid ──────────────────────────────
  function renderDeploys(deploys) {
    const wrap = $('deploy-grid');
    if (!wrap) return;
    if (!deploys.length) { wrap.innerHTML = '<div style="color:#5c6b61">no deployment data</div>'; return; }
    wrap.innerHTML = deploys.map(d => {
      const cls = (d.state === 'live' || d.state === 'ready') ? 'live'
                : (d.state === 'failed' || d.state === 'error') ? 'failing'
                : 'unknown';
      const stateLabel = d.state || 'unknown';
      const badge = d.badge_url
        ? `<div class="dp-badge"><img src="${esc(d.badge_url)}" alt="${esc(d.name)} status"></div>`
        : '';
      const meta = d.last_deploy_at ? `last: ${esc(d.last_deploy_at)}` : '';
      const tag = d.url ? 'a' : 'div';
      const href = d.url ? `href="${esc(d.url)}" target="_blank" rel="noopener"` : '';
      return `<${tag} class="deploy-tile ${cls}" ${href}>
        <div class="dp-row1">
          <span class="dp-name">${esc(d.name || '')}</span>
          <span class="dp-state">${esc(stateLabel)}</span>
        </div>
        <div class="dp-host">${esc(d.url || d.host || '')}</div>
        ${meta ? `<div class="dp-meta">${meta}</div>` : ''}
        ${d.note ? `<div class="dp-note">${esc(d.note)}</div>` : ''}
        ${badge}
      </${tag}>`;
    }).join('');
  }

  // ── customer SharePoint surfaces ────────────────────────
  function renderSharePoint(items) {
    const wrap = $('sp-grid');
    if (!wrap) return;
    if (!items.length) {
      wrap.innerHTML = '<div style="color:#5c6b61">no customer SharePoint surfaces filed</div>';
      return;
    }
    wrap.innerHTML = items.map(it => {
      const tag = it.url ? 'a' : 'div';
      const href = it.url ? `href="${esc(it.url)}" target="_blank" rel="noopener"` : '';
      return `<${tag} class="sp-tile" ${href}>
        <div class="sp-customer">${esc(it.customer || '')}</div>
        <div class="sp-title">${esc(it.title || '')}</div>
        ${it.url ? `<div class="sp-url">${esc(it.url)}</div>` : ''}
        ${it.note ? `<div class="sp-note">${esc(it.note)}</div>` : ''}
      </${tag}>`;
    }).join('');
  }

  // ── system flow chart ────────────────────────────────────
  function renderFlow(flow) {
    const c = $('flow-canvas');
    if (!c) return;
    const nodes = flow.nodes || [];
    if (!nodes.length) { c.innerHTML = '<div style="color:#5c6b61">no flow defined</div>'; return; }
    // Sort by row + col for grid layout
    nodes.sort((a, b) => (a.row - b.row) || (a.col - b.col));
    c.innerHTML = nodes.map(n => `
      <div class="flow-node" data-kind="${esc(n.kind || 'internal')}">
        <h4>${esc(n.label || n.id)}</h4>
        <p class="biz">${esc(n.biz || '')}</p>
        <p class="tech">${esc(n.tech || '')}</p>
      </div>
    `).join('');
  }

  // ── projects (active first, planning under fold) ─────────
  function renderProjects(checklist) {
    const all = [];
    for (const g of (checklist.groups || [])) {
      for (const p of (g.projects || [])) {
        all.push({ ...p, _group: g.title || g.id });
      }
    }
    const active = all.filter(p => p.status === 'active').sort((a, b) => (b.percent || 0) - (a.percent || 0));
    const planning = all.filter(p => p.status === 'planning' || p.status === 'planned').sort((a, b) => (b.percent || 0) - (a.percent || 0));

    const renderCard = (p) => {
      const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
      return `
        <div class="proj-card">
          <div class="proj-row1">
            <span><span class="proj-status ${esc(p.status || '')}">${esc(p.status || '')}</span><span class="proj-name">${esc(p.name || p.id)}</span></span>
            <span class="proj-pct">${pct}%</span>
          </div>
          <div class="proj-bar"><div class="proj-bar-fill" style="width:${pct}%"></div></div>
          <p class="proj-summary biz">${esc(p.business_summary || p.summary || '')}</p>
          <p class="proj-summary tech">${esc(p.summary || '')}</p>
          ${p.business_current ? `<p class="proj-current biz">${esc(p.business_current)}</p>` : ''}
          ${p.current ? `<p class="proj-current tech">${esc(p.current)}</p>` : ''}
        </div>`;
    };

    $('project-grid').innerHTML = active.map(renderCard).join('') || '<div style="color:#5c6b61">no active projects</div>';
    $('planning-grid').innerHTML = planning.map(renderCard).join('') || '<div style="color:#5c6b61">none on deck</div>';
  }

  // ── recent wins ─────────────────────────────────────────
  function renderWins(wins) {
    const list = $('wins-list');
    if (!wins.length) { list.innerHTML = '<li style="border-left:none;color:#5c6b61">no wins captured yet</li>'; return; }
    list.innerHTML = wins.map(w => `
      <li>
        <div class="w-ts">${esc(w.ts || '')} · ${esc(w.channel || '')}</div>
        <div class="w-msg biz">${esc(w.business_summary || w.summary || '')}</div>
        <div class="w-msg tech">${esc(w.summary || '')}</div>
      </li>
    `).join('');
  }

  // ── truth gate ──────────────────────────────────────────
  function renderTruth(t) {
    const wrap = $('truth-stats');
    if (!t.available) { wrap.innerHTML = '<div style="color:#5c6b61">no claim-checks evidence yet</div>'; return; }
    const pillT = $('pill-truth');
    if (pillT) {
      const ok = (t.fail || 0) === 0 && (t.pass || 0) > 0;
      pillT.classList.toggle('ok', ok);
      pillT.classList.toggle('err', (t.fail || 0) > 0);
      pillT.innerHTML = `<strong>Truth gate</strong>${t.pass || 0}/${t.total || 0} verified`;
    }
    wrap.innerHTML = `
      <div class="truth-stat pass"><div class="v">${t.pass || 0}</div><div class="l">verified</div></div>
      <div class="truth-stat fail"><div class="v">${t.fail || 0}</div><div class="l">failed</div></div>
      <div class="truth-stat"><div class="v">${t.partial || 0}</div><div class="l">partial</div></div>
      <div class="truth-stat"><div class="v">${t.indeterminate || 0}</div><div class="l">no testable tokens</div></div>
      <div class="truth-stat"><div class="v">${t.window_hours || 24}h</div><div class="l">window</div></div>`;
  }

  // ── note form → mailto ─────────────────────────────────
  $('note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = $('note-subject').value.trim() || 'CHERP — note from Sean';
    const body = $('note-body').value.trim();
    if (!body) { $('note-meta').textContent = 'enter a note first'; return; }
    const mailto = `mailto:${OPERATOR_EMAIL}?subject=${encodeURIComponent('[from sean] ' + subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    $('note-meta').textContent = 'opened in your email client — send to deliver';
  });
})();
