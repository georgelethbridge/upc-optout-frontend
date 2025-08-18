// script.js — updated to classify applicant type via backend and editable in "Edit"

(() => {
  // ----------------------------------------------------------------------------
  // Config
  // ----------------------------------------------------------------------------
  const backendBase = "https://upc-optout-backend.onrender.com"; // change if serving same origin

  // ----------------------------------------------------------------------------
  // State
  // ----------------------------------------------------------------------------
  let extractedEPs = [];
  let applicationPDF = null;
  let mandatePDF = null;
  let applicantInfo = null; // { isNaturalPerson, name, naturalPersonDetails?, email, address:{address,city,zipCode,state} }
  let applicationPdfBase64 = "";
  let mandatePdfBase64 = "";

  // ----------------------------------------------------------------------------
  // Elements
  // ----------------------------------------------------------------------------
  const applicationPdfInput = document.getElementById('application_pdf');
  const mandatePdfInput = document.getElementById('mandate_pdf');
  const spreadsheet = document.getElementById('spreadsheet');
  const epList = document.getElementById('ep-list');
  const result = document.getElementById('result');
  const applicantSummary = document.getElementById('applicant-summary');
  const submitBtn = document.getElementById('submit');
  const appPdfBase64Display = document.getElementById('app-pdf-base64');
  const mandatePdfBase64Display = document.getElementById('mandate-pdf-base64');
  const requestBodyDisplay = document.getElementById('request-json');
  const copyRequestJsonButton = document.getElementById('copy-request-json');
  const editBtn = document.getElementById('edit-applicant');
  const saveBtn = document.getElementById('save-applicant');
  const editForm = document.getElementById('applicant-edit-form');
  const spinner = document.getElementById('spinner');

  // ----------------------------------------------------------------------------
  // Auth (Google one-tap → backend /auth)
  // ----------------------------------------------------------------------------
  window.onSignIn = async function onSignIn(response) {
    try {
      const token = response.credential;
      const res = await fetch(`${backendBase}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (!data.allowed) {
        alert('⛔ You are not authorized.');
        return;
      }
      document.getElementById('login-box').style.display = 'none';
      // Depending on your markup this could be #app or #app-content — support both.
      const appRoot = document.getElementById('app') || document.getElementById('app-content');
      if (appRoot) appRoot.style.display = 'block';
    } catch (err) {
      console.error('Google login failed', err);
      alert('Login failed. Try again.');
    }
  };

  // ----------------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------------
  function updateMandatorSection() {
    const initials = document.getElementById('initials')?.value?.trim();
    const mandateBox = document.getElementById('mandate-preview-box');
    const mandatorSection = document.getElementById('mandator-section');
    const mainLayout = document.getElementById('main-layout');

    if (!initials) {
      mandatorSection?.classList.add('hidden');
      mandateBox?.classList.add('hidden');
      mainLayout?.classList.remove('mandate-shown');
      return;
    }

    const isRep = initials === 'YH';
    if (!isRep) {
      mandatorSection?.classList.remove('hidden');
      mandateBox?.classList.remove('hidden');
      mainLayout?.classList.add('mandate-shown');
    } else {
      mandatorSection?.classList.add('hidden');
      mandateBox?.classList.add('hidden');
      mainLayout?.classList.remove('mandate-shown');
    }
  }

  async function extractTextFromPDF(file) {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      fullText += strings.join(' ') + ' ';
    }
    return fullText;
  }

  function readFileAsBase64(file, cb) {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  }

  function enableSubmitIfReady() {
    const initials = document.getElementById('initials')?.value?.trim();
    if (applicationPDF && initials && applicantInfo?.name && extractedEPs.length) {
      submitBtn.disabled = false;
    }
  }

  function setupDropZone(dropZoneId, inputId) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);
    if (!dropZone || !input) return;
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  setupDropZone('spreadsheet-drop', 'spreadsheet');
  setupDropZone('application-drop', 'application_pdf');
  setupDropZone('mandate-drop', 'mandate_pdf');

  // Show/Hide Final JSON panel
  const toggleBtn = document.getElementById('toggle-json');
  const jsonWrapper = document.getElementById('json-wrapper');
  if (toggleBtn && jsonWrapper) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = jsonWrapper.classList.toggle('hidden');
      toggleBtn.textContent = isHidden ? '▶ Show Final JSON' : '▼ Hide Final JSON';
    });
  }

  function updateApplicantDisplay() {
    try {
      if (!applicantInfo) return;
      const { address = {}, name, isNaturalPerson, naturalPersonDetails } = applicantInfo;
      let html = `<strong>Name:</strong> ${name || ''}<br>
                  <strong>Type:</strong> ${isNaturalPerson ? 'Natural Person' : 'Legal Entity'}<br>
                  <strong>Address:</strong><br>
                  ${address.address || ''}<br>
                  ${address.city || ''} ${address.zipCode || ''}<br>
                  ${address.state || ''}`;
      if (applicantInfo.email) {
        html += `<br><strong>Email:</strong> ${applicantInfo.email}`;
      }
      if (isNaturalPerson && naturalPersonDetails) {
        html += `<br><strong>First Name:</strong> ${naturalPersonDetails.firstName || ''}<br>
                 <strong>Last Name:</strong> ${naturalPersonDetails.lastName || ''}`;
      }
      if (applicantSummary) applicantSummary.innerHTML = html;
    } catch (err) {
      console.error('Failed to update applicant display', err);
    }
  }

  function updatePreview() {
    const initials = document.getElementById('initials')?.value?.trim();
    const status = initials === 'YH' ? 'RegisteredRepresentativeBeforeTheUPC' : 'NotARegisteredRepresentativeBeforeTheUPC';
    requestBodyDisplay.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid';
    wrapper.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
    wrapper.style.gap = '1rem';

    extractedEPs.forEach(ep => {
      const payload = {
        statusPersonLodgingApplication: status, // see UPC A2A v1.6, allowed values
        internalReference: ep,
        applicant: {
          isNaturalPerson: applicantInfo?.isNaturalPerson || false,
          contactAddress: applicantInfo?.address || {},
          ...(applicantInfo?.isNaturalPerson
              ? { naturalPersonDetails: applicantInfo?.naturalPersonDetails }
              : { legalEntityDetails: { name: applicantInfo?.name || '' } }),
          ...(applicantInfo?.email ? { email: applicantInfo.email } : {})
        },
        patent: { patentNumber: ep },
        documents: [{
          documentType: 'Application',
          documentTitle: `Opt-out ${ep}`,
          documentDescription: `Opt-out application for ${ep}`,
          attachments: [{
            data: applicationPdfBase64,
            language: 'en', // per spec: fr | en | de
            filename: `Optout_${ep}.pdf`,
            mimeType: 'application/pdf'
          }]
        }]
      };

      // Mandator block only when not a registered representative
      const mandator = getMandator();
      if (status === 'NotARegisteredRepresentativeBeforeTheUPC' && mandator) {
        payload.mandator = mandator;
        if (mandatePdfBase64) {
          payload.documents.push({
            documentType: 'Mandate',
            documentTitle: 'Mandate Form',
            documentDescription: `Mandate for ${ep}`,
            attachments: [{
              data: mandatePdfBase64,
              language: 'en',
              filename: `Optout_mandate_${ep}.pdf`,
              mimeType: 'application/pdf'
            }]
          });
        }
      }

      const box = document.createElement('div');
      box.style.border = '1px solid #ccc';
      box.style.padding = '1rem';
      box.style.position = 'relative';
      box.style.background = '#f9f9f9';

      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(payload, null, 2);

      const copyBtn = document.createElement('button');
      copyBtn.innerHTML = '<img src="copy-icon.svg" alt="Copy" width="16" height="16">';
      copyBtn.style.position = 'absolute';
      copyBtn.style.top = '0.5rem';
      copyBtn.style.right = '0.5rem';
      copyBtn.style.background = 'transparent';
      copyBtn.style.border = 'none';
      copyBtn.style.cursor = 'pointer';

      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.textContent).then(() => {
          copyBtn.innerHTML = '<img src="check-icon.svg" alt="Copied" width="16" height="16">';
          setTimeout(() => {
            copyBtn.innerHTML = '<img src="copy-icon.svg" alt="Copy" width="16" height="16">';
          }, 1500);
        });
      });

      box.appendChild(copyBtn);
      box.appendChild(pre);
      wrapper.appendChild(box);
    });

    requestBodyDisplay.appendChild(wrapper);
  }

  function getMandator() {
    const v = id => document.getElementById(id)?.value?.trim();
    const firstName = v('mandator-first');
    const lastName = v('mandator-last');
    const email = v('mandator-email');
    const address = v('mandator-address');
    const city = v('mandator-city');
    const zip = v('mandator-zip');
    const country = v('mandator-country');
    if (!firstName && !lastName && !email && !address && !city && !zip && !country) return null;
    return {
      naturalPersonDetails: { firstName, lastName },
      email,
      contactAddress: { address, zipCode: zip, city, state: country }
    };
  }

  // ----------------------------------------------------------------------------
  // Spreadsheet ingest → classify via backend (/parse-address)
  // ----------------------------------------------------------------------------
  spreadsheet?.addEventListener('change', e => {
    if (e.target.files?.[0]) extractFromSpreadsheet(e.target.files[0]);
  });

  async function extractFromSpreadsheet(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Find header row (first row containing an "EP pub" column)
      let headerRowIndex = -1;
      let headers = [];
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const candidate = rows[i].map(h => (h ?? '').toString().toLowerCase().trim());
        if (candidate.some(h => h.includes('ep pub'))) {
          headers = candidate;
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) return alert('Header row not found');

      const idx = (label) => headers.findIndex(h => (h ?? '').toString().toLowerCase().includes(label));
      const epIndex = idx('ep pub');
      const nameIndex = idx('owner 1 name');
      const addrIndex = idx('owner 1 address');
      const emailIndex = idx('owner 1 email');

      extractedEPs = rows.slice(headerRowIndex + 1)
        .map(row => (row[epIndex] ?? '').toString().trim())
        .filter(ep => /^EP\d{7,9}$/i.test(ep));

      const name = rows[headerRowIndex + 1]?.[nameIndex]?.toString().trim() || '';
      const addressFull = rows[headerRowIndex + 1]?.[addrIndex]?.toString().trim() || '';
      const email = rows[headerRowIndex + 1]?.[emailIndex]?.toString().trim() || '';

      spinner && (spinner.style.display = 'block');
      try {
        // Single call: parse address + classify name (and split if natural)
        const addrRes = await fetch(`${backendBase}/parse-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addressFull, name })
        }).then(r => r.json());
        if (addrRes.error) throw new Error(addrRes.error);

        const addressData = {
          address: addrRes.address || '',
          city: addrRes.city || '',
          zipCode: addrRes.zipCode || '',
          state: addrRes.state || addrRes.country || ''
        };

        const isNatural = !!addrRes.isNaturalPerson;
        const naturalPersonDetails = isNatural ? (addrRes.naturalPersonDetails || null) : null;
        const legalEntityDetails = !isNatural ? (addrRes.legalEntityDetails || { name }) : null;

        applicantInfo = {
          isNaturalPerson: isNatural,
          name: isNatural && naturalPersonDetails
            ? `${naturalPersonDetails.firstName || ''} ${naturalPersonDetails.lastName || ''}`.trim()
            : (legalEntityDetails?.name || name || ''),
          naturalPersonDetails: naturalPersonDetails || undefined,
          email: email || '',
          address: addressData
        };

        if (epList) {
          epList.innerHTML = `<p>Found ${extractedEPs.length} EP number${extractedEPs.length === 1 ? '' : 's'}:</p>
            <ul>${extractedEPs.map(ep => `<li>${ep}</li>`).join('')}</ul>`;
        }
      } catch (err) {
        console.error('API error:', err);
        alert('Failed to parse address / classify applicant.');
      } finally {
        if (spinner) spinner.style.display = 'none';
        updateApplicantDisplay();
        updateMandatorSection();
        updatePreview();
        enableSubmitIfReady();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ----------------------------------------------------------------------------
  // Match EPs against text inside Application PDF (helps user verify)
  // ----------------------------------------------------------------------------
  function updateEpListWithMatches(pdfText = '') {
    if (!epList || !extractedEPs.length) return;
    const normalizedText = pdfText
      .normalize('NFKD')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\[\](){}]/g, '')
      .replace(/\s+/g, '')
      .toUpperCase();

    const seen = new Set();
    const duplicates = new Set();
    const unmatchedEPsInPdf = [];

    let html = `<p>Found ${extractedEPs.length} EP number${extractedEPs.length === 1 ? '' : 's'}:</p><ul>`;
    for (const ep of extractedEPs) {
      const epNorm = ep.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (seen.has(epNorm)) duplicates.add(ep); else seen.add(epNorm);
      const found = normalizedText.includes(epNorm);
      const status = found ? '✅ Found in PDF' : '❌ Not in PDF';
      const color = found ? 'green' : 'red';
      html += `<li>${ep} <span style="color:${color};font-weight:bold">${status}</span></li>`;
    }
    html += '</ul>';

    if (duplicates.size) {
      html += `<p style="color:darkorange;font-weight:bold">⚠️ Duplicate EPs in spreadsheet:</p><ul>` +
              [...duplicates].map(d => `<li>${d}</li>`).join('') + '</ul>';
    }

    const epPattern = /EP\d{7,9}/gi;
    const epMatches = new Set((pdfText.match(epPattern) || []).map(ep => ep.toUpperCase()));
    const missingFromSheet = [...epMatches].filter(ep => !seen.has(ep));
    if (missingFromSheet.length) {
      html += `<p style="color:darkred;font-weight:bold">📄 EPs in application PDF but missing from spreadsheet:</p><ul>` +
              missingFromSheet.map(x => `<li>${x}</li>`).join('') + '</ul>';
    }

    epList.innerHTML = html;
  }

  // ----------------------------------------------------------------------------
  // File inputs (Application PDF, Mandate PDF)
  // ----------------------------------------------------------------------------
  applicationPdfInput?.addEventListener('change', async e => {
    applicationPDF = e.target.files?.[0] || null;
    if (!applicationPDF) return;

    readFileAsBase64(applicationPDF, base64 => {
      applicationPdfBase64 = base64;
      if (appPdfBase64Display) appPdfBase64Display.textContent = base64;
      updatePreview();
      enableSubmitIfReady();
    });

    const preview = document.getElementById('application-preview');
    if (preview) {
      const objectURL = URL.createObjectURL(applicationPDF);
      preview.innerHTML = `<embed src="${objectURL}" type="application/pdf" width="100%" height="600px">`;
    }

    try {
      const pdfText = await extractTextFromPDF(applicationPDF);
      updateEpListWithMatches(pdfText);
    } catch (err) {
      console.error('Failed to extract text from PDF', err);
      alert('Could not scan PDF for EP numbers.');
    }
  });

  mandatePdfInput?.addEventListener('change', e => {
    mandatePDF = e.target.files?.[0] || null;
    if (!mandatePDF) return;

    readFileAsBase64(mandatePDF, base64 => {
      mandatePdfBase64 = base64;
      if (mandatePdfBase64Display) mandatePdfBase64Display.textContent = base64;
      updatePreview();
    });

    const preview = document.getElementById('mandate-preview');
    if (preview) {
      const url = URL.createObjectURL(mandatePDF);
      preview.innerHTML = `<embed src="${url}" type="application/pdf" width="100%" height="400px" />`;
    }
  });

  // ----------------------------------------------------------------------------
  // Submit (calls your backend /submit with formData for each EP)
  // ----------------------------------------------------------------------------
  submitBtn?.addEventListener('click', async () => {
    const initials = document.getElementById('initials')?.value?.trim();
    if (!applicationPDF || !initials || !applicantInfo?.name) {
      alert('Initials, applicant info and application PDF are required.');
      return;
    }

    submitBtn.disabled = true;
    result.innerHTML = '';
    const mandator = getMandator();

    for (const ep of extractedEPs) {
      const formData = new FormData();
      formData.append('initials', initials);
      formData.append('ep_number', ep);
      formData.append('applicant', JSON.stringify({
        isNaturalPerson: applicantInfo.isNaturalPerson,
        contactAddress: applicantInfo.address,
        email: applicantInfo.email,
        naturalPersonDetails: applicantInfo.isNaturalPerson ? applicantInfo.naturalPersonDetails : undefined,
        legalEntityDetails: !applicantInfo.isNaturalPerson ? { name: applicantInfo.name } : undefined
      }));
      if (mandator) formData.append('mandator', JSON.stringify(mandator));
      formData.append('application_pdf', applicationPDF);
      if (mandatePDF) formData.append('mandate_pdf', mandatePDF);

      // Optional: fetch and log token for visibility
      try {
        const tokenRes = await fetch(`${backendBase}/token`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initials })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error(tokenData.error || 'Missing access_token');
        console.log('🔐 Token:', tokenData.access_token);
      } catch (err) {
        console.error(`❌ Failed to retrieve token for ${ep}:`, err);
        result.innerHTML += `<p><strong>${ep}</strong>: ❌ Failed to get token</p>`;
        continue;
      }

      try {
        // For console preview (base64 omitted)
        const finalJsonPreview = {
          statusPersonLodgingApplication: initials === 'YH' ? 'RegisteredRepresentativeBeforeTheUPC' : 'NotARegisteredRepresentativeBeforeTheUPC',
          internalReference: ep,
          applicant: {
            isNaturalPerson: applicantInfo.isNaturalPerson,
            contactAddress: applicantInfo.address,
            email: applicantInfo.email,
            naturalPersonDetails: applicantInfo.isNaturalPerson ? applicantInfo.naturalPersonDetails : undefined,
            legalEntityDetails: !applicantInfo.isNaturalPerson ? { name: applicantInfo.name } : undefined
          },
          patent: { patentNumber: ep },
          documents: [{
            documentType: 'Application',
            documentTitle: `Opt-out ${ep}`,
            documentDescription: `Opt-out application for ${ep}`,
            attachments: [{ data: '[base64 omitted]', language: 'en', filename: `Optout_${ep}.pdf`, mimeType: 'application/pdf' }]
          }]
        };
        if (mandator) {
          finalJsonPreview.mandator = mandator;
          if (mandatePDF) {
            finalJsonPreview.documents.push({
              documentType: 'Mandate',
              documentTitle: 'Mandate Form',
              documentDescription: `Mandate for ${ep}`,
              attachments: [{ data: '[base64 omitted]', language: 'en', filename: `Optout_mandate_${ep}.pdf`, mimeType: 'application/pdf' }]
            });
          }
        }
        console.log(`📦 Final JSON for EP ${ep}:`, finalJsonPreview);

        const res = await fetch(`${backendBase}/submit`, { method: 'POST', body: formData });
        const resJson = await res.json();
        console.log(`📄 Backend response for ${ep}:`, resJson);
        const message = resJson.message || resJson.error || 'Unknown response';

        if (!document.getElementById('results-table')) {
          result.innerHTML = `
            <table id="results-table" style="width:100%;border-collapse:collapse;margin-top:1rem;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #ccc;">EP Number</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;">Message</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;">Date/Time</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;">Request ID</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>`;
          const downloadAllBtn = document.createElement('button');
          downloadAllBtn.id = 'download-all-receipts';
          downloadAllBtn.textContent = '⬇ Download All Receipts (.zip)';
          downloadAllBtn.style.marginTop = '1rem';
          const zspin = document.createElement('div');
          zspin.id = 'zip-spinner';
          zspin.textContent = '⏳ Zipping receipts...';
          zspin.style.display = 'none';
          zspin.style.marginTop = '0.5rem';
          result.appendChild(downloadAllBtn);
          result.appendChild(zspin);
        }

        const tableBody = document.querySelector('#results-table tbody');
        const now = resJson.receptionTime ? new Date(resJson.receptionTime).toLocaleString() : new Date().toLocaleString();
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${ep}</td>
          <td>${message}</td>
          <td>${now}</td>
          <td>${resJson.requestId || '—'}</td>
          <td><button class="view-registry-btn" data-ep="${ep}">🔎 View Opt-Out Search</button></td>`;
        tableBody.appendChild(row);
      } catch (e) {
        result.innerHTML += `<p><strong>${ep}</strong>: ❌ Failed to connect</p>`;
        console.error(`❌ Network or backend error for ${ep}:`, e);
      }
    }

    submitBtn.disabled = false;
  });

  // Results table actions (view UPC registry, zip receipts)
  document.addEventListener('click', async e => {
    if (e.target.classList.contains('view-registry-btn')) {
      const ep = e.target.getAttribute('data-ep');
      const url = `https://www.unifiedpatentcourt.org/en/registry/opt-out/results?case_type&patent_number=${encodeURIComponent(ep)}`;
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  });

  document.getElementById('result')?.addEventListener('click', async e => {
    if (e.target.id !== 'download-all-receipts') return;

    const rows = [...document.querySelectorAll('#results-table tbody tr')];
    const initials = document.getElementById('initials')?.value?.trim();
    const zspin = document.getElementById('zip-spinner');
    if (!rows.length) return alert('No receipts to download.');

    e.target.disabled = true; if (zspin) zspin.style.display = 'block';
    try {
      const tokenRes = await fetch(`${backendBase}/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initials }) });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) throw new Error(tokenData.error || 'Missing access_token');

      const zip = new JSZip();
      for (const row of rows) {
        const ep = row.querySelector('td:nth-child(1)')?.textContent?.trim();
        const requestId = row.querySelector('td:nth-child(4)')?.textContent?.trim();
        if (!ep || !requestId || requestId === '—') continue;

        const pdfRes = await fetch(`${backendBase}/receipt?initials=${initials}&requestId=${requestId}&ep=${encodeURIComponent(ep)}`);
        if (!pdfRes.ok) { console.warn(`Skipping ${ep}: receipt not found`); continue; }
        const blob = await pdfRes.blob();
        zip.file(`Opt-Out Receipt ${ep}.pdf`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'upc_receipts.zip';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) {
      alert(`❌ Failed to download all receipts: ${err.message}`);
      console.error(err);
    } finally {
      e.target.disabled = false; if (zspin) zspin.style.display = 'none';
    }
  });

  // Edit / Save Applicant (includes Applicant Type dropdown in the edit panel)
  if (editBtn && saveBtn && editForm) {
    let originalInfo = null;

    editBtn.addEventListener('click', () => {
      if (!applicantInfo) return;
      if (editBtn.textContent === 'Edit') {
        originalInfo = JSON.parse(JSON.stringify(applicantInfo));
        editForm.style.display = 'block';
        editBtn.textContent = 'Cancel';
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

        // Applicant Type dropdown (must exist in HTML with id="edit-applicant-type")
        const typeSel = document.getElementById('edit-applicant-type');
        if (typeSel) typeSel.value = String(!!applicantInfo.isNaturalPerson);

        set('edit-name', applicantInfo.name);
        set('edit-address', applicantInfo.address?.address);
        set('edit-city', applicantInfo.address?.city);
        set('edit-zip', applicantInfo.address?.zipCode);
        set('edit-state', applicantInfo.address?.state);
        set('edit-email', applicantInfo.email);

        if (applicantInfo.isNaturalPerson) {
          document.getElementById('name-split-fields')?.classList.remove('hidden');
          set('edit-first', applicantInfo.naturalPersonDetails?.firstName);
          set('edit-last', applicantInfo.naturalPersonDetails?.lastName);
        } else {
          document.getElementById('name-split-fields')?.classList.add('hidden');
        }
      } else {
        applicantInfo = originalInfo;
        updateApplicantDisplay();
        updatePreview();
        editForm.style.display = 'none';
        editBtn.textContent = 'Edit';
      }
    });

    document.getElementById('edit-applicant-type')?.addEventListener('change', (e) => {
      const isNat = e.target.value === 'true';
      const split = document.getElementById('name-split-fields');
      if (split) split.classList.toggle('hidden', !isNat);
    });

    saveBtn.addEventListener('click', () => {
      const get = id => document.getElementById(id)?.value?.trim() || '';
      const isNat = document.getElementById('edit-applicant-type')?.value === 'true';

      applicantInfo.isNaturalPerson = isNat;
      applicantInfo.name = get('edit-name');
      applicantInfo.address = { address: get('edit-address'), city: get('edit-city'), zipCode: get('edit-zip'), state: get('edit-state') };
      applicantInfo.email = get('edit-email');

      if (isNat) {
        applicantInfo.naturalPersonDetails = { firstName: get('edit-first'), lastName: get('edit-last') };
        const fn = applicantInfo.naturalPersonDetails.firstName;
        const ln = applicantInfo.naturalPersonDetails.lastName;
        const full = `${fn} ${ln}`.trim();
        if (full) applicantInfo.name = full;
      } else {
        delete applicantInfo.naturalPersonDetails;
      }

      updateApplicantDisplay();
      updatePreview();
      editForm.style.display = 'none';
      editBtn.textContent = 'Edit';
    });
  }

  // Copy all JSONs (concatenated text) to clipboard
  if (copyRequestJsonButton) {
    const copyIcon = copyRequestJsonButton.querySelector('.copy-icon');
    const successIcon = copyRequestJsonButton.querySelector('.success-icon');
    copyRequestJsonButton.addEventListener('click', () => {
      if (requestBodyDisplay.textContent) {
        navigator.clipboard.writeText(requestBodyDisplay.textContent).then(() => {
          if (copyIcon) copyIcon.style.display = 'none';
          if (successIcon) successIcon.style.display = 'inline-block';
          setTimeout(() => {
            if (copyIcon) copyIcon.style.display = 'inline-block';
            if (successIcon) successIcon.style.display = 'none';
          }, 2000);
        });
      }
    });
  }

  // Live/Sandbox badge
  fetch(`${backendBase}/mode`).then(r => r.json()).then(d => {
    const box = document.getElementById('mode-indicator');
    if (!box) return;
    box.textContent = `${d.emoji} ${d.mode}`;
    box.style.background = d.mode === 'LIVE' ? '#d1fae5' : '#fef3c7';
    box.style.border = d.mode === 'LIVE' ? '2px solid #10b981' : '2px dashed #f59e0b';
  }).catch(() => {});

  // Reactivity
  document.getElementById('initials')?.addEventListener('input', () => {
    updateMandatorSection();
    updatePreview();
    enableSubmitIfReady();
  });

  const mandatorFields = ['mandator-first','mandator-last','mandator-email','mandator-address','mandator-city','mandator-zip','mandator-country'];
  mandatorFields.forEach(id => document.getElementById(id)?.addEventListener('input', updatePreview));

})();
