// script.js — original-look version (uses your existing DOM ids)

window.onSignIn = async function (response) {
  try {
    const token = response.credential;

    const res = await fetch('https://upc-optout-backend.onrender.com/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    if (!data.allowed) {
      alert("⛔ You are not authorized.");
      return;
    }

    // Show your original app container
    document.getElementById('login-box').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
  } catch (err) {
    console.error("Google login failed", err);
    alert("Login failed. Try again.");
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  let extractedEPs = [];
  let applicationPDF = null;
  let mandatePDF = null;
  let applicantInfo = {}; // { isNaturalPerson, name, naturalPersonDetails?, email, address:{address,city,zipCode,state} }
  let applicationPdfBase64 = "";
  let mandatePdfBase64 = "";

  // ------------------------------------------------------------
  // Elements (match your original DOM)
  // ------------------------------------------------------------
  const applicationPdfInput = document.getElementById('application_pdf');
  const epList = document.getElementById('ep-list');
  const result = document.getElementById('result');                // you already had this container
  const submitBtn = document.getElementById('submit');
  const appPdfBase64Display = document.getElementById('app-pdf-base64');
  const mandatePdfBase64Display = document.getElementById('mandate-pdf-base64');
  const requestBodyDisplay = document.getElementById('preview-json'); // original id
  const copyRequestJsonButton = document.getElementById('copy-request-json'); // optional if present
  const editBtn = document.getElementById('edit-applicant');
  const saveBtn = document.getElementById('save-applicant');
  const editForm = document.getElementById('applicant-edit-form');
  const spinner = document.getElementById('spinner');

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // Applicant display – write to your existing spans
  // ------------------------------------------------------------
  function updateApplicantDisplay() {
    try {
      const nameEl = document.getElementById('applicant-name');
      const emailEl = document.getElementById('applicant-email');
      const addrEl = document.getElementById('applicant-address');
      const cityZipEl = document.getElementById('applicant-cityzip');

      if (!applicantInfo) {
        nameEl.textContent = emailEl.textContent = addrEl.textContent = cityZipEl.textContent = '—';
        return;
      }

      const { address = {}, name, email } = applicantInfo;
      nameEl.textContent = name || '—';
      emailEl.textContent = email || '—';
      addrEl.textContent = address.address || '—';
      cityZipEl.textContent = [address.city, address.zipCode, address.state].filter(Boolean).join(' ') || '—';
    } catch (err) {
      console.error('Failed to update applicant display', err);
    }
  }

  function buildApplicantJSON() {
    if (!applicantInfo) return {};
    const a = applicantInfo.address || {};
    const base = {
      email: applicantInfo.email || undefined,
      contactAddress: {
        address: a.address || "",
        zipCode: a.zipCode || "",
        city: a.city || "",
        state: a.state || ""
      }
    };
    if (applicantInfo.isNaturalPerson) {
      const np = applicantInfo.naturalPersonDetails || {};
      return {
        applicant: {
          isNaturalPerson: true,
          naturalPersonDetails: {
            lastName: (np.lastName || "").toUpperCase(),
            firstName: np.firstName || ""
          },
          ...base
        }
      };
    }
    return {
      applicant: {
        isNaturalPerson: false,
        legalEntityDetails: { name: applicantInfo.name || "" },
        ...base
      }
    };
  }

  function updatePreview() {
    const payload = buildApplicantJSON();
    requestBodyDisplay.textContent = JSON.stringify(payload, null, 2);

    const initials = document.getElementById('initials')?.value?.trim();
    const ok = Boolean(applicationPDF && applicantInfo && applicantInfo.name && (extractedEPs.length >= 0) && initials);
    submitBtn.disabled = !ok;
  }

  // ------------------------------------------------------------
  // Spreadsheet ingest → one call to /parse-address with {name, address}
  // ------------------------------------------------------------
  document.getElementById('spreadsheet')?.addEventListener('change', e => {
    if (e.target.files?.[0]) extractFromSpreadsheet(e.target.files[0]);
  });

  async function extractFromSpreadsheet(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Find header row (first row containing an “EP pub” column)
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

      if (spinner) spinner.style.display = 'block';
      try {
        // Single call: parse address + classify name (and split if natural)
        const addrRes = await fetch(`https://upc-optout-backend.onrender.com/parse-address`, {
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

        // show EP list
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

  // ------------------------------------------------------------
  // Update EP list with PDF matches
  // ------------------------------------------------------------
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

    epList.innerHTML = html;
  }

  // ------------------------------------------------------------
  // File inputs (Application PDF, Mandate PDF)
  // ------------------------------------------------------------
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

  document.getElementById('mandate_pdf')?.addEventListener('change', e => {
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

  // ------------------------------------------------------------
  // Edit panel (uses your existing Applicant Type dropdown if present)
  // ------------------------------------------------------------
  if (editBtn && saveBtn && editForm) {
    let originalInfo = null;

    editBtn.addEventListener('click', () => {
      if (!applicantInfo) return;
      if (editBtn.textContent === 'Edit') {
        originalInfo = JSON.parse(JSON.stringify(applicantInfo));
        editForm.style.display = 'block';
        editBtn.textContent = 'Cancel';

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        // If you added the Applicant Type dropdown in your HTML, set it here:
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
      const typeSel = document.getElementById('edit-applicant-type');
      const isNat = typeSel ? typeSel.value === 'true' : !!applicantInfo.isNaturalPerson;

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

  // ------------------------------------------------------------
  // Submit (same server endpoints you already have)
  // ------------------------------------------------------------
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

      try {
        const res = await fetch(`https://upc-optout-backend.onrender.com/submit`, { method: 'POST', body: formData });
        const resJson = await res.json();
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
        }

        const tableBody = document.querySelector('#results-table tbody');
        const now = resJson.receptionTime ? new Date(resJson.receptionTime).toLocaleString() : new Date().toLocaleString();
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${ep}</td>
          <td>${message}</td>
          <td>${now}</td>
          <td>${resJson.requestId || '—'}</td>`;
        tableBody.appendChild(row);
      } catch (e) {
        result.innerHTML += `<p><strong>${ep}</strong>: ❌ Failed to connect</p>`;
        console.error(`❌ Network or backend error for ${ep}:`, e);
      }
    }

    submitBtn.disabled = false;
  });

  // ------------------------------------------------------------
  // Build Mandator object (if needed)
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // Wire up preview JSON show/hide (your existing toggle if present)
  // ------------------------------------------------------------
  document.getElementById('toggle-json')?.addEventListener('click', () => {
    const wrapper = document.getElementById('json-wrapper');
    if (!wrapper) return;
    const isHidden = wrapper.classList.toggle('hidden');
    document.getElementById('toggle-json').textContent = isHidden ? '▶ Show Final JSON' : '▼ Hide Final JSON';
  });

  // ------------------------------------------------------------
  // Reactive bits
  // ------------------------------------------------------------
  document.getElementById('initials')?.addEventListener('input', () => {
    updateMandatorSection();
    updatePreview();
    enableSubmitIfReady();
  });

  ['mandator-first','mandator-last','mandator-email','mandator-address','mandator-city','mandator-zip','mandator-country']
    .forEach(id => document.getElementById(id)?.addEventListener('input', updatePreview));
});
