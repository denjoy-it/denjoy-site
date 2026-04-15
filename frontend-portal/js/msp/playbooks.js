/**
 * Denjoy IT Platform — Playbook Definitions
 * Per controle-sleutel: gestructureerde stap-voor-stap remediation-handleidingen.
 */
(function initDenjoyPlaybooks(global) {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Playbook Registry
  // ─────────────────────────────────────────────────────────────────────────────
  const PLAYBOOK_REGISTRY = {

    'guest-user-governance': {
      title: 'Gastgebruikers opschonen',
      category: 'Identiteit',
      severity: 'warning',
      summary: 'Identificeer en verwijder of blokkeer inactieve en ongeclassificeerde gastaccounts.',
      steps: [
        {
          label: 'Inventariseer actieve gasten',
          description: 'Exporteer alle gastaccounts via het Gebruikers-overzicht of via de Assessment-export. Filter op inactiviteit > 90 dagen.',
          actionType: 'review',
        },
        {
          label: 'Valideer zakelijke noodzaak',
          description: 'Neem per gastaccount contact op met de eigenaar (sponsor). Bevestig of de samenwerking nog actief is. Documenteer de uitkomst.',
          actionType: 'approve',
        },
        {
          label: 'Blokkeer of verwijder inactieve gasten',
          description: 'Accounts zonder geldige zakelijke rechtvaardiging: zet de sign-in op "Geblokkeerd" in Entra ID en plan verwijdering na 30 dagen.',
          actionType: 'remediate',
        },
        {
          label: 'Stel gastbeleid in',
          description: 'Activeer gast-review-policies in Entra ID Identity Governance (Toegangsbeoordelingen). Stel een terugkerende review in van 90 dagen.',
          actionType: 'configure',
        },
        {
          label: 'Verifieer en sluit af',
          description: 'Controleer dat de bevinding in een volgende scan is opgelost. Leg het resultaat vast als opgelost in de actielijst.',
          actionType: 'verify',
        },
      ],
    },

    'app-secrets-and-certs': {
      title: 'Verlopende app-secrets en -certificaten',
      category: 'Applicatie-beveiliging',
      severity: 'critical',
      summary: 'Verlopen of bijna-verlopen credentials op app-registraties kunnen leiden tot uitval of ongeautoriseerde toegang.',
      steps: [
        {
          label: 'Identificeer betrokken applicaties',
          description: 'Open de lijst met bevindingen. Filter op "Verlopen" en "Verloopt binnenkort". Noteer de app-IDs en eigenaren.',
          actionType: 'review',
        },
        {
          label: 'Contacteer applicatieëigenaar',
          description: 'Informeer de eigenaar over het naderende/verstreken verlopen. Geef een deadlinedatum voor actie (max. 5 werkdagen voor kritiek).',
          actionType: 'notify',
        },
        {
          label: 'Roteer credentials',
          description: 'Maak een nieuw secret of certificaat aan in Entra ID. Update de configuratie van de applicatie. Verwijder het oude credential na bevestiging.',
          actionType: 'remediate',
        },
        {
          label: 'Documenteer levenscyclus',
          description: 'Voeg de applicatie toe aan het credential-rotation-schema. Stel een kalenderherinnering in voor 30 dagen voor de volgende vervaldatum.',
          actionType: 'document',
        },
        {
          label: 'Hervalideer in volgende scan',
          description: 'Trigger een nieuwe assessment of wacht op de geplande scan. Bevestig dat de bevinding is opgelost.',
          actionType: 'verify',
        },
      ],
    },

    'ca-policy-export': {
      title: 'Conditional Access — beleidsgaten',
      category: 'Toegangscontrole',
      severity: 'critical',
      summary: 'Controleer of Conditional Access-policies compleet, actief en goed geconfigureerd zijn voor alle gebruikers en apps.',
      steps: [
        {
          label: 'Exporteer en analyseer CA-policies',
          description: 'Download de CA-export via de bevindingen. Vergelijk met de Denjoy-baseline (MFA verplicht, legacy auth geblokkeerd, app-protectie actief).',
          actionType: 'review',
        },
        {
          label: 'Identificeer gaten en uitzonderingen',
          description: 'Let op: policies in Report-only mode, uitsluitingen van beheerdersaccounts, en policies die niet alle cloud-apps dekken.',
          actionType: 'review',
        },
        {
          label: 'Ontwikkel herstelplan',
          description: 'Stel per gap een policy voor. Test nieuwe policies in Report-only mode voor minimaal 5 werkdagen.',
          actionType: 'plan',
        },
        {
          label: 'Activeer policies',
          description: 'Zet correcte policies op "Ingeschakeld". Behoud Report-only voor policies die nog niet volledig getest zijn.',
          actionType: 'remediate',
        },
        {
          label: 'Verifieer en documenteer',
          description: 'Controleer sign-in logs op ongewenste blokkades. Documenteer de eindconfiguratie. Meld als afgerond.',
          actionType: 'verify',
        },
      ],
    },

    'mail-forwarding-detection': {
      title: 'Externe mail-forwarding blokkeren',
      category: 'E-mail beveiliging',
      severity: 'critical',
      summary: 'Externe doorstuurregels zijn een veelgebruikte techniek bij datalek en BEC-aanvallen. Verwijder alle ongeautoriseerde regels.',
      steps: [
        {
          label: 'Valideer elk doorstuuradres',
          description: 'Controleer per gevonden forwarding-regel of het bestemadres bekend en zakelijk gerechtvaardigd is. Vraag bevestiging bij de gebruiker/eigenaar.',
          actionType: 'review',
        },
        {
          label: 'Blokkeer op tenant-niveau',
          description: 'Activeer anti-spam outbound policy in Defender voor Microsoft 365 om externe automatische forwarding te blokkeren (Automatic: Off).',
          actionType: 'configure',
        },
        {
          label: 'Verwijder ongeautoriseerde regels',
          description: 'Gebruik Exchange Admin Center of PowerShell (Remove-InboxRule) om de specifieke regels te verwijderen. Log de actie.',
          actionType: 'remediate',
        },
        {
          label: 'Onderzoek op compromis',
          description: 'Controleer de sign-in logs van betrokken accounts op verdachte activiteit (onbekende IP, AiTM, etc.). Escaleer indien nodig naar incident response.',
          actionType: 'investigate',
        },
        {
          label: 'Herbevestig in volgende scan',
          description: 'Bevestig dat geen nieuwe forwarding-regels zijn aangemaakt. Sluit de actie.',
          actionType: 'verify',
        },
      ],
    },

    'inbox-rule-risk-detection': {
      title: 'Risicovolle inbox-regels opschonen',
      category: 'E-mail beveiliging',
      severity: 'warning',
      summary: 'Inbox-regels die berichten verbergen, verwijderen of doorsturen kunnen indicatoren zijn van accountcompromis.',
      steps: [
        {
          label: 'Beoordeel gevonden regels',
          description: 'Bekijk elke markeerde regel: aard van de actie (verbergen? verwijderen? doorsturen?), aanmaakdatum en betrokken account.',
          actionType: 'review',
        },
        {
          label: 'Valideer bij gebruiker',
          description: 'Vraag de gebruiker of de regel door hem/haar aangemaakt is. Bij ontkenning: verhoog naar incident response.',
          actionType: 'approve',
        },
        {
          label: 'Verwijder niet-geautoriseerde regels',
          description: 'Gebruik Exchange Admin Center of PowerShell (Remove-InboxRule -Identity) om de regel te verwijderen.',
          actionType: 'remediate',
        },
        {
          label: 'Reset wachtwoord bij vermoeden van compromis',
          description: 'Bij verdacht account: reset wachtwoord, revoceer sessies (Revoke-AzureADUserAllRefreshToken) en forceer MFA-herregistratie.',
          actionType: 'remediate',
        },
        {
          label: 'Sluit af en documenteer',
          description: 'Leg de bevinding en de actie vast. Herbevestig in volgende scan.',
          actionType: 'verify',
        },
      ],
    },

    'mailbox-permission-governance': {
      title: 'Mailbox-permissies opschonen',
      category: 'E-mail beveiliging',
      severity: 'warning',
      summary: 'FullAccess en SendAs-permissies op mailboxen buiten directe behoefte vergroten het aanvalsoppervlak aanzienlijk.',
      steps: [
        {
          label: 'Inventariseer afwijkende permissies',
          description: 'Bekijk de lijst met mailboxen met niet-standaard permissies: FullAccess, SendAs buiten gedeelde mailboxen en beheerderaccounts.',
          actionType: 'review',
        },
        {
          label: 'Valideer zakelijke rechtvaardiging',
          description: 'Neem contact op met de permissie-eigenaar. Elke permissie moet een gedocumenteerde zakelijke reden hebben.',
          actionType: 'approve',
        },
        {
          label: 'Verwijder onnodige permissies',
          description: 'Gebruik Exchange Admin Center of Remove-MailboxPermission / Remove-RecipientPermission. Leg de actie vast.',
          actionType: 'remediate',
        },
        {
          label: 'Voer periodieke review in',
          description: 'Plan een kwartaalsreview van mailbox-permissies als standaard beheerproces.',
          actionType: 'configure',
        },
        {
          label: 'Verifieer in volgende scan',
          description: 'Bevestig dat de permissies correct zijn bijgewerkt en de bevinding is opgelost.',
          actionType: 'verify',
        },
      ],
    },

    'domain-mail-auth': {
      title: 'E-mail authenticatie (SPF/DKIM/DMARC) herstellen',
      category: 'E-mail beveiliging',
      severity: 'critical',
      summary: 'Ontbrekende of onjuiste SPF, DKIM en DMARC-records maken domeinspoofing en phishing eenvoudiger.',
      steps: [
        {
          label: 'Controleer DNS-records per domein',
          description: 'Bekijk de lijst met domeinen en de status van SPF, DKIM en DMARC. Noteer welke records ontbreken of incorrect zijn.',
          actionType: 'review',
        },
        {
          label: 'Publiceer correct SPF-record',
          description: 'Stel een SPF TXT-record in die alle legitieme zend-IP\'s en services omvat. Gebruik ~all (softfail) als startpunt, migreer naar -all na validatie.',
          actionType: 'remediate',
        },
        {
          label: 'Activeer DKIM-ondertekening',
          description: 'Activeer DKIM in Exchange Online / Defender Admin Center. Publiceer de CNAME-records in DNS zoals aangegeven door Microsoft 365.',
          actionType: 'remediate',
        },
        {
          label: 'Implementeer DMARC-policy',
          description: 'Publiceer een DMARC TXT-record met p=none voor monitoring. Analyseer rapporten gedurende 2 weken. Verhoog naar p=quarantine of p=reject na validatie.',
          actionType: 'configure',
        },
        {
          label: 'Valideer en sluit af',
          description: 'Verifieer records via MXToolbox of Microsoft\'s DMARC-analyseur. Bevestig groene status in de volgende scan.',
          actionType: 'verify',
        },
      ],
    },

    'admin-role-membership': {
      title: 'Adminrol-bezetting saneren',
      category: 'Privileged Access',
      severity: 'critical',
      summary: 'Overbodige globale admin- en bevoorrechte rolleden vergroten het aanvalsoppervlak voor privilege-escalatie.',
      steps: [
        {
          label: 'Inventariseer leden per bevoorrechte rol',
          description: 'Bekijk de lijst: Global Admin, Privileged Role Admin, Security Admin, Exchange Admin. Noteer alle leden en vergelijk met de verwachte beheerdersbezetting.',
          actionType: 'review',
        },
        {
          label: 'Identificeer onnodige rolleden',
          description: 'Verwijder service-accounts, shared-accounts en medewerkers die de rol niet actief gebruiken. Zorg voor max. 2–4 Global Admins.',
          actionType: 'review',
        },
        {
          label: 'Migreer naar PIM (Just-in-time)',
          description: 'Activeer Entra ID PIM voor bevoorrechte rollen. Converteer permanente roltoewijzingen naar "Eligible" met goedkeuringsworkflow.',
          actionType: 'configure',
        },
        {
          label: 'Verwijder onnodige toewijzingen',
          description: 'Gebruik Entra ID Roles & Administrators om rolleden te verwijderen. Documenteer elke wijziging.',
          actionType: 'remediate',
        },
        {
          label: 'Stel monitoring in',
          description: 'Activeer waarschuwingen in Microsoft Defender for Identity / Entra ID voor nieuwe globale admin-toewijzingen.',
          actionType: 'configure',
        },
      ],
    },

    'break-glass-accounts': {
      title: 'Break-glass accounts corrigeren',
      category: 'Privileged Access',
      severity: 'critical',
      summary: 'Noodtoegangsaccounts moeten correct geconfigureerd zijn: niet in CA-policies uitgesloten, sterk wachtwoord, geen MFA-afhankelijkheid van één persoon.',
      steps: [
        {
          label: 'Inventariseer break-glass accounts',
          description: 'Identificeer de break-glass accounts in de tenant. Controleer of ze aanwezig zijn, actief zijn en de juiste configuratie hebben.',
          actionType: 'review',
        },
        {
          label: 'Verifieer CA-uitsluitingen',
          description: 'Zorg dat break-glass accounts zijn uitgesloten van alle Conditional Access-policies die MFA of locatierestricties opleggen.',
          actionType: 'configure',
        },
        {
          label: 'Controleer credential-sterkte',
          description: 'Wachtwoord moet minimaal 32 tekens zijn, willekeurig gegenereerd, en opgeslagen in een fysieke kluis of Enterprise Password Manager met gedeeld beheer.',
          actionType: 'remediate',
        },
        {
          label: 'Stel sign-in monitoring in',
          description: 'Activeer waarschuwingen in Entra ID / Sentinel voor elk inloggebeurtenis op break-glass accounts.',
          actionType: 'configure',
        },
        {
          label: 'Test toegang en documenteer',
          description: 'Test de accounts jaarlijks. Documenteer procedures voor gebruik, inclusief wie verantwoordelijk is en hoe escalatie verloopt.',
          actionType: 'document',
        },
      ],
    },

    'legacy-auth-exposure': {
      title: 'Verouderde authenticatie blokkeren',
      category: 'Toegangscontrole',
      severity: 'critical',
      summary: 'Legacy-authenticatieprotocollen (IMAP, POP3, SMTP AUTH, Basic Auth) ondersteunen geen MFA en zijn veelgebruikte aanvalsvectoren.',
      steps: [
        {
          label: 'Identificeer legacy auth-gebruik',
          description: 'Controleer de sign-in logs in Entra ID op legacy-authenticatieprotocollen. Identificeer gebruikers en apps die dit nog gebruiken.',
          actionType: 'review',
        },
        {
          label: 'Informeer betrokkenen',
          description: 'Contacteer gebruikers en applicatiebeheerders die legacy auth gebruiken. Bied moderne alternatieven (moderne auth, app passwords of OAuth).',
          actionType: 'notify',
        },
        {
          label: 'Migreer clients naar moderne authenticatie',
          description: 'Zorg dat alle e-mailclients, mobiele apps en integraties zijn geconfigureerd voor OAuth/Modern Auth. Stel een migratiedeadline in.',
          actionType: 'remediate',
        },
        {
          label: 'Blokkeer via Conditional Access',
          description: 'Maak een CA-policy aan die alle legacy-authenticatieprotocollen blokkeert voor alle gebruikers. Test eerst in Report-only mode.',
          actionType: 'configure',
        },
        {
          label: 'Bevestig in volgende scan',
          description: 'Controleer dat geen legacy-auth-events meer worden gelogd. Sluit de actie.',
          actionType: 'verify',
        },
      ],
    },

    'teams-with-guests': {
      title: 'Teams-gastconfiguratie beveiligen',
      category: 'Samenwerking',
      severity: 'warning',
      summary: 'Teams met externe gasten en onbeperkte instellingen kunnen leiden tot onbedoelde datadeling en ongecontroleerde toegang.',
      steps: [
        {
          label: 'Overzicht teams met gasten',
          description: 'Bekijk de lijst van teams met externe leden. Noteer teams met veel gasten of met gevoelige data (Finance, HR, Management).',
          actionType: 'review',
        },
        {
          label: 'Valideer gastlidmaatschap',
          description: 'Neem per team contact op met de teameigenaar. Bevestig dat elk gastaccount zakelijk gerechtvaardigd is.',
          actionType: 'approve',
        },
        {
          label: 'Beperk gastrechten',
          description: 'Configureer in Teams Admin Center: gasten mogen geen kanalen aanmaken, geen leden toevoegen, en bestanden zijn beperkt door sensitivity labels.',
          actionType: 'configure',
        },
        {
          label: 'Activeer gastreviews',
          description: 'Stel periodieke Toegangsbeoordelingen in voor teams met externe leden via Entra ID Identity Governance.',
          actionType: 'configure',
        },
        {
          label: 'Verifieer beleidsnaleving',
          description: 'Bevestig in de volgende scan dat de bevindingen zijn opgelost en de instellingen correct zijn.',
          actionType: 'verify',
        },
      ],
    },

    'sharepoint-sharing-risk': {
      title: 'SharePoint-delingsrisico beperken',
      category: 'Samenwerking',
      severity: 'warning',
      summary: 'Onbeperkte organisatie-brede of anonieme deelrechten op SharePoint verhogen het risico op onbedoelde dataexfiltratie.',
      steps: [
        {
          label: 'Inventariseer risicovolle sites',
          description: 'Bekijk de lijst van SharePoint-sites met externe deling op "Iedereen" of "Iedereen met de link". Prioriteer op gevoeligheid.',
          actionType: 'review',
        },
        {
          label: 'Valideer legitieme deling',
          description: 'Neem contact op met site-eigenaren. Bepaal welke externe deling zakelijk noodzakelijk is. Pas het scope zo beperkt mogelijk toe.',
          actionType: 'approve',
        },
        {
          label: 'Beperk deelrechten per site',
          description: 'Zet externe deling op "Alleen bestaande externe gebruikers" of "Specifieke personen" voor gevoelige sites. Gebruik sensitivity labels.',
          actionType: 'remediate',
        },
        {
          label: 'Configureer tenant-niveau deelbeleid',
          description: 'Stel in SharePoint Admin Center het standaard deelbeleid in op "Nieuwe en bestaande gasten". Blokkeer anonieme links voor de hele tenant als mogelijk.',
          actionType: 'configure',
        },
        {
          label: 'Bevestig in volgende scan',
          description: 'Verifieer dat de deelrechten zijn aangepast en dat geen nieuwe risico-instellingen zijn geïntroduceerd.',
          actionType: 'verify',
        },
      ],
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  function getPlaybookForControl(controlKey) {
    return PLAYBOOK_REGISTRY[controlKey] || null;
  }

  const ACTION_TYPE_ICONS = {
    review: '🔍',
    approve: '✅',
    remediate: '🔧',
    configure: '⚙️',
    verify: '✔️',
    notify: '📣',
    investigate: '🕵️',
    plan: '📋',
    document: '📄',
  };

  function renderPlaybookModal(controlKey, context = {}) {
    const playbook = PLAYBOOK_REGISTRY[controlKey];
    if (!playbook) {
      global.openSideRail?.({
        title: 'Geen playbook beschikbaar',
        html: `<p style="color:var(--text-muted,#6b7280)">Er is nog geen playbook gedefinieerd voor <code>${esc(controlKey)}</code>.</p>`,
      });
      return;
    }

    const stepsHtml = playbook.steps.map((step, i) => `
      <div style="display:flex;gap:.75rem;padding:.75rem 0;${i < playbook.steps.length - 1 ? 'border-bottom:1px solid var(--border-color,#e5e7eb);' : ''}">
        <div style="flex-shrink:0;width:1.75rem;height:1.75rem;border-radius:50%;background:var(--dj-accent,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;">${i + 1}</div>
        <div>
          <div style="font-weight:600;font-size:.9rem;">${esc(step.label)}</div>
          <div style="font-size:.82rem;color:var(--text-muted,#6b7280);margin-top:.2rem;">${esc(step.description)}</div>
          <div style="font-size:.72rem;color:var(--text-muted,#9ca3af);margin-top:.15rem;">${ACTION_TYPE_ICONS[step.actionType] || ''} ${esc(step.actionType)}</div>
        </div>
      </div>
    `).join('');

    const tenantLine = context.tenantName
      ? `<div style="font-size:.8rem;color:var(--text-muted,#6b7280);margin-bottom:.75rem;">Tenant: <strong>${esc(context.tenantName)}</strong></div>`
      : '';

    const html = `
      <div>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.25rem;">
          <span class="mspcc-pill" style="background:${playbook.severity === 'critical' ? 'var(--dj-crit,#dc2626)' : 'var(--dj-warn,#d97706)'};color:#fff;">${esc(playbook.category)}</span>
        </div>
        ${tenantLine}
        <p style="font-size:.88rem;color:var(--text-body,#374151);margin:.5rem 0 1rem;">${esc(playbook.summary)}</p>
        <div>${stepsHtml}</div>
        ${context.findingTitle ? `<div style="margin-top:1rem;padding:.75rem;background:var(--bg-subtle,#f9fafb);border-radius:.5rem;font-size:.82rem;color:var(--text-muted,#6b7280);">Bevinding: <strong>${esc(context.findingTitle)}</strong></div>` : ''}
      </div>
    `;

    if (global.openSideRail) {
      global.openSideRail({ title: playbook.title, html });
    } else {
      // Fallback: simple modal
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:flex-end;justify-content:flex-end;';
      const panel = document.createElement('div');
      panel.style.cssText = 'width:min(520px,100vw);height:100vh;background:var(--bg-card,#fff);overflow-y:auto;padding:1.5rem 1.25rem;box-shadow:-2px 0 16px rgba(0,0,0,.15);';
      panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;"><h2 style="font-size:1.05rem;font-weight:700;margin:0;">${esc(playbook.title)}</h2><button id="_pbCloseBtn" style="background:none;border:none;font-size:1.25rem;cursor:pointer;">✕</button></div>${html}`;
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      panel.querySelector('#_pbCloseBtn')?.addEventListener('click', () => overlay.remove());
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Playbook Registry Section (standalone UI)
  // ─────────────────────────────────────────────────────────────────────────────

  function loadPlaybooksSection() {
    const root = document.getElementById('playbooksRoot');
    if (!root) return;
    const entries = Object.entries(PLAYBOOK_REGISTRY);
    if (!entries.length) {
      root.innerHTML = '<div class="mspcc-empty">Geen playbooks beschikbaar.</div>';
      return;
    }
    root.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;">
        ${entries.map(([key, pb]) => `
          <div class="mspcc-list-item" style="cursor:pointer;" data-pb-key="${esc(key)}">
            <div class="mspcc-list-item-top">
              <strong style="font-size:.92rem;">${esc(pb.title)}</strong>
              <span class="mspcc-pill" style="background:${pb.severity === 'critical' ? 'var(--dj-crit,#dc2626)' : 'var(--dj-warn,#d97706)'};color:#fff;flex-shrink:0;">${esc(pb.category)}</span>
            </div>
            <p style="font-size:.8rem;color:var(--text-muted,#6b7280);margin:.35rem 0 .5rem;">${esc(pb.summary)}</p>
            <div style="font-size:.75rem;color:var(--text-muted,#9ca3af);">${pb.steps.length} stappen &middot; <code style="font-size:.72rem;">${esc(key)}</code></div>
          </div>
        `).join('')}
      </div>
    `;
    root.querySelectorAll('[data-pb-key]').forEach((card) => {
      card.addEventListener('click', () => renderPlaybookModal(card.dataset.pbKey));
    });
  }

  global.getPlaybookForControl = getPlaybookForControl;
  global.renderPlaybookModal = renderPlaybookModal;
  global.loadPlaybooksSection = loadPlaybooksSection;
})(window);
