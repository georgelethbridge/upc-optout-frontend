// script.js

document.addEventListener('DOMContentLoaded', () => {
  let extractedEPs = [];
  let applicationPDF = null;
  let mandatePDF = null;
  let applicantInfo = {};
  let applicationPdfBase64 = "";
  let mandatePdfBase64 = "";

  const applicationPdfInput = document.getElementById('application_pdf');
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

  function updateMandatorSection() {
    const initials = document.getElementById('initials').value.trim();
    const mandateBox = document.getElementById('mandate-preview-box');
    const mandatorSection = document.getElementById('mandator-section');
    const mainLayout = document.getElementById('main-layout');

    if (!initials) {
      // If initials not filled in at all, hide mandate UI
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
  };

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



  function enableSubmitIfReady() {
    const initials = document.getElementById('initials').value.trim();
    if (applicationPDF && initials && applicantInfo.name && extractedEPs.length) {
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
      const file = e.dataTransfer.files[0];
      if (file) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  setupDropZone('spreadsheet-drop', 'spreadsheet');
  setupDropZone('application-drop', 'application_pdf');
  setupDropZone('mandate-drop', 'mandate_pdf');

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
    const initials = document.getElementById('initials').value.trim();
    const status = initials === 'YH' ? 'RegisteredRepresentativeBeforeTheUPC' : 'NotARegisteredRepresentativeBeforeTheUPC';

    requestBodyDisplay.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid';
    wrapper.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
    wrapper.style.gap = '1rem';

    extractedEPs.forEach(ep => {
      const payload = {
        statusPersonLodgingApplication: status,
        internalReference: ep,
        applicant: {
          isNaturalPerson: applicantInfo.isNaturalPerson,
          contactAddress: applicantInfo.address || {},
          ...(applicantInfo.isNaturalPerson ? { naturalPersonDetails: applicantInfo.naturalPersonDetails } : { legalEntityDetails: { name: applicantInfo.name } }),
          ...(applicantInfo.email ? { email: applicantInfo.email } : {})
        },
        patent: { patentNumber: ep },
        documents: [{
          documentType: 'Application',
          documentTitle: `Opt-out ${ep}`,
          documentDescription: `Opt-out application for ${ep}`,
          attachments: [{
            data: applicationPdfBase64,
            language: 'en',
            filename: `Optout_${ep}.pdf`,
            mimeType: 'application/pdf'
          }]
        }]
      };

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
    const getVal = id => document.getElementById(id)?.value?.trim();
    const firstName = getVal('mandator-first');
    const lastName = getVal('mandator-last');
    const email = getVal('mandator-email');
    const address = getVal('mandator-address');
    const city = getVal('mandator-city');
    const zip = getVal('mandator-zip');
    const country = getVal('mandator-country');
    if (!firstName && !lastName && !email && !address && !city && !zip && !country) return null;
    return {
      naturalPersonDetails: { firstName, lastName },
      email,
      contactAddress: {
        address,
        zipCode: zip,
        city,
        state: country
      }
    };
  }

  function readFileAsBase64(file, callback) {
    const reader = new FileReader();
    reader.onload = () => callback(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  }

  const spreadsheet = document.getElementById('spreadsheet');
  if (spreadsheet) {
    spreadsheet.addEventListener('change', e => {
      if (e.target.files[0]) extractFromSpreadsheet(e.target.files[0]);
    });
  }

  async function extractFromSpreadsheet(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

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
        const epIndex = headers.findIndex(h => (h ?? '').toString().toLowerCase().includes('ep pub'));
        const nameIndex = headers.findIndex(h => (h ?? '').toString().toLowerCase().includes('owner 1 name'));
        const addrIndex = headers.findIndex(h => (h ?? '').toString().toLowerCase().includes('owner 1 address'));
        const emailIndex = headers.findIndex(h => (h ?? '').toString().toLowerCase().includes('owner 1 email'));

      extractedEPs = rows.slice(headerRowIndex + 1)
        .map(row => (row[epIndex] ?? '').toString().trim())
        .filter(ep => ep.startsWith('EP'));

      const name = rows[headerRowIndex + 1]?.[nameIndex]?.trim() || '';
      const addressFull = rows[headerRowIndex + 1]?.[addrIndex]?.trim() || '';
      const email = rows[headerRowIndex + 1]?.[emailIndex]?.trim() || '';
      const isNatural = document.getElementById('person-type').value === 'true';

      spinner.style.display = 'block';

      try {
        const [addrRes, nameRes] = await Promise.all([
          fetch('https://upc-optout-backend.onrender.com/parse-address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: addressFull })
          }).then(res => res.json()),
          isNatural ? fetch('https://upc-optout-backend.onrender.com/parse-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          }).then(res => res.json()) : Promise.resolve(null)
        ]);

        const addressData = { ...addrRes, state: addrRes.country || addrRes.state || '' };
        applicantInfo = {
          isNaturalPerson: isNatural,
          name,
          address: addressData,
          naturalPersonDetails: nameRes || undefined,
          email: email || undefined
        };

        if (epList) {
          epList.innerHTML = `<p>Found ${extractedEPs.length} EP numbers:</p>
            <ul>${extractedEPs.map(ep => `<li>${ep}</li>`).join('')}</ul>`;
        }

      } catch (err) {
        console.error('API error:', err);
        alert('Failed to parse address or name');
      } finally {
        spinner.style.display = 'none';
        updateApplicantDisplay();
        updateMandatorSection();
        updatePreview();
        enableSubmitIfReady();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function updateEpListWithMatches(pdfText = '') {
    if (!epList || !extractedEPs.length) return;

    // Normalize PDF text
    const normalizedText = pdfText
      .normalize('NFKD')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\[\]()\{\}]/g, '')
      .replace(/\s+/g, '')
      .toUpperCase();

    console.log("📄 Normalized PDF text preview:", normalizedText.slice(0, 500));

    const seen = new Set();
    const duplicates = new Set();
    const matchedEPs = new Set();
    const unmatchedInPdf = [];

    let html = `<p>Found ${extractedEPs.length} EP number${extractedEPs.length === 1 ? '' : 's'}:</p><ul>`;

    for (const ep of extractedEPs) {
      const epNorm = ep.replace(/[^A-Z0-9]/gi, '').toUpperCase();

      if (seen.has(epNorm)) {
        duplicates.add(ep);
      } else {
        seen.add(epNorm);
      }

      const found = normalizedText.includes(epNorm);
      if (found) matchedEPs.add(epNorm);

      const status = found ? '✅ Found in PDF' : '❌ Not in PDF';
      const color = found ? 'green' : 'red';
      html += `<li>${ep} <span style="color: ${color}; font-weight: bold;">${status}</span></li>`;
    }

    html += '</ul>';

    if (duplicates.size > 0) {
      html += `<p style="color: darkorange; font-weight: bold;">⚠️ Duplicate EPs in spreadsheet:</p><ul>`;
      for (const dup of duplicates) {
        html += `<li>${dup}</li>`;
      }
      html += '</ul>';
    }

    // Find all EP-like patterns in PDF
    const epPattern = /EP\d{7,9}/gi;
    const epMatches = new Set((pdfText.match(epPattern) || []).map(ep => ep.toUpperCase()));
    const unmatchedEPs = [...epMatches].filter(ep => !seen.has(ep));

    if (unmatchedEPs.length > 0) {
      html += `<p style="color: darkred; font-weight: bold;">📄 EPs found in application PDF but missing from spreadsheet:</p><ul>`;
      for (const ep of unmatchedEPs) {
        html += `<li>${ep}</li>`;
      }
      html += '</ul>';
    }

    epList.innerHTML = html;
  }



  document.getElementById('initials')?.addEventListener('input', () => {
    updateMandatorSection();
    updatePreview();
    enableSubmitIfReady();
  });

  applicationPdfInput?.addEventListener('change', async e => {
    applicationPDF = e.target.files[0];
    readFileAsBase64(applicationPDF, base64 => {
      applicationPdfBase64 = base64;
      appPdfBase64Display.textContent = base64;
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
      // test
      console.log("📄 Extracted PDF text:", pdfText);
      updateEpListWithMatches(pdfText);
    } catch (err) {
      console.error("Failed to extract text from PDF", err);
      alert("Could not scan PDF for EP numbers.");
    }
  });


  const mandatePdfInput = document.getElementById('mandate_pdf');
  mandatePdfInput?.addEventListener('change', e => {
    mandatePDF = e.target.files[0];
    readFileAsBase64(mandatePDF, base64 => {
      mandatePdfBase64 = base64;
      mandatePdfBase64Display.textContent = base64;
      updatePreview();
    });
    const preview = document.getElementById('mandate-preview');
    if (preview) {
      const url = URL.createObjectURL(mandatePDF);
      preview.innerHTML = `<embed src="${url}" type="application/pdf" width="100%" height="400px" />`;
    }
  });

  // Submission logic
  submitBtn?.addEventListener('click', async () => {
    const initials = document.getElementById('initials').value.trim();
    if (!applicationPDF || !initials || !applicantInfo.name) {
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

      // Optional token fetch (just for console visibility / debug)
      try {
        const tokenRes = await fetch('https://upc-optout-backend.onrender.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initials })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error(tokenData.error || 'Missing access_token');
        console.log('🔐 Token :', tokenData.access_token);
      } catch (err) {
        console.error(`❌ Failed to retrieve token for ${ep}:`, err);
        result.innerHTML += `<p><strong>${ep}</strong>: ❌ Failed to get token</p>`;
        continue; // Don't halt entire queue
      }

      // 🔄 LIVE submission
      try {
        // Mirror final JSON sent to UPC
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
            attachments: [{
              data: '[base64 omitted]',
              language: 'en',
              filename: `Optout_${ep}.pdf`,
              mimeType: 'application/pdf'
            }]
          }]
        };

        if (mandator) {
          finalJsonPreview.mandator = mandator;
          if (mandatePDF) {
            finalJsonPreview.documents.push({
              documentType: 'Mandate',
              documentTitle: 'Mandate Form',
              documentDescription: `Mandate for ${ep}`,
              attachments: [{
                data: '[base64 omitted]',
                language: 'en',
                filename: `Optout_mandate_${ep}.pdf`,
                mimeType: 'application/pdf'
              }]
            });
          }
        }

        console.log(`📦 Final JSON sent to backend for EP ${ep}:`, finalJsonPreview);

        const res = await fetch('https://upc-optout-backend.onrender.com/submit', {
          method: 'POST',
          body: formData
        });
        const resJson = await res.json();
        console.log(`📄 Full backend response for ${ep}:`, resJson);
        const status = res.ok ? '✅' : '❌';
        const message = resJson.message || resJson.error || 'Unknown response';
        if (!document.getElementById('results-table')) {
          result.innerHTML = `
            <table id="results-table" style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
              <thead>
                <tr>
                  <th style="text-align: left; border-bottom: 1px solid #ccc;">EP Number</th>
                  <th style="text-align: left; border-bottom: 1px solid #ccc;">Message</th>
                  <th style="text-align: left; border-bottom: 1px solid #ccc;">Date/Time</th>
                  <th style="text-align: left; border-bottom: 1px solid #ccc;">Request ID</th>
                  <th style="text-align: left; border-bottom: 1px solid #ccc;">Download Receipt</th>

                </tr>
              </thead>
              <tbody></tbody>
            </table>
          `;
          const downloadAllBtn = document.createElement('button');
          downloadAllBtn.id = 'download-all-receipts';
          downloadAllBtn.textContent = '⬇ Download All Receipts (.zip)';
          downloadAllBtn.style.marginTop = '1rem';

          const spinner = document.createElement('div');
          spinner.id = 'zip-spinner';
          spinner.textContent = '⏳ Zipping receipts...';
          spinner.style.display = 'none';
          spinner.style.marginTop = '0.5rem';

          result.appendChild(downloadAllBtn);
          result.appendChild(spinner);

        }

        const tableBody = document.querySelector('#results-table tbody');
        const now = resJson.receptionTime 
          ? new Date(resJson.receptionTime).toLocaleString()
          : new Date().toLocaleString();

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${ep}</td>
          <td>${message}</td>
          <td>${now}</td>
          <td>${resJson.requestId || '—'}</td>
          <td>
            ${resJson.requestId ? `<button data-requestid="${resJson.requestId}" data-ep="${ep}" class="download-receipt-btn">📄 Download</button>` : '—'}
          </td>
        `;
        tableBody.appendChild(row);


      } catch (e) {
        result.innerHTML += `<p><strong>${ep}</strong>: ❌ Failed to connect</p>`;
        console.error(`❌ Network or backend error for ${ep}:`, e);
      }

      /*
      // 🧪 TEST MODE — previously used for logging only, now disabled
      const mockBody = {
        initials,
        ep_number: ep,
        applicant: {
          isNaturalPerson: applicantInfo.isNaturalPerson,
          contactAddress: applicantInfo.address,
          email: applicantInfo.email,
          naturalPersonDetails: applicantInfo.isNaturalPerson ? applicantInfo.naturalPersonDetails : undefined,
          legalEntityDetails: !applicantInfo.isNaturalPerson ? { name: applicantInfo.name } : undefined
        },
        mandator: mandator || undefined
      };

      console.log(`📤 [TEST MODE] Would send for EP ${ep}:`, mockBody);
      result.innerHTML += `<p>🧪 [Test Mode] Prepared request for <strong>${ep}</strong> (see console)</p>`;
      */
    }

    submitBtn.disabled = false;
  });


  // Edit/Save applicant UI
  if (editBtn && saveBtn && editForm) {
    let originalInfo = null;
    editBtn.addEventListener('click', () => {
      if (editBtn.textContent === 'Edit') {
        originalInfo = JSON.parse(JSON.stringify(applicantInfo));
        editForm.style.display = 'block';
        editBtn.textContent = 'Cancel';
        const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
        set('edit-name', applicantInfo.name);
        set('edit-address', applicantInfo.address?.address);
        set('edit-city', applicantInfo.address?.city);
        set('edit-zip', applicantInfo.address?.zipCode);
        set('edit-state', applicantInfo.address?.state);
        set('edit-email', applicantInfo.email);
        if (applicantInfo.isNaturalPerson) {
          document.getElementById('name-split-fields').style.display = 'block';
          set('edit-first', applicantInfo.naturalPersonDetails?.firstName);
          set('edit-last', applicantInfo.naturalPersonDetails?.lastName);
        } else {
          document.getElementById('name-split-fields').style.display = 'none';
        }
      } else {
        applicantInfo = originalInfo;
        updateApplicantDisplay();
        updatePreview();
        editForm.style.display = 'none';
        editBtn.textContent = 'Edit';
      }
    });

    saveBtn.addEventListener('click', () => {
      const get = id => document.getElementById(id)?.value?.trim() || '';
      applicantInfo.name = get('edit-name');
      applicantInfo.address = {
        address: get('edit-address'),
        city: get('edit-city'),
        zipCode: get('edit-zip'),
        state: get('edit-state')
      };
      applicantInfo.email = get('edit-email');
      if (applicantInfo.isNaturalPerson) {
        applicantInfo.naturalPersonDetails = {
          firstName: get('edit-first'),
          lastName: get('edit-last')
        };
      }
      updateApplicantDisplay();
      updatePreview();
      editForm.style.display = 'none';
      editBtn.textContent = 'Edit';
    });
  }

  if (copyRequestJsonButton) {
    const copyIcon = copyRequestJsonButton.querySelector('.copy-icon');
    const successIcon = copyRequestJsonButton.querySelector('.success-icon');
    copyRequestJsonButton.addEventListener('click', () => {
      if (requestBodyDisplay.textContent) {
        navigator.clipboard.writeText(requestBodyDisplay.textContent).then(() => {
          copyIcon.style.display = 'none';
          successIcon.style.display = 'inline-block';
          setTimeout(() => {
            copyIcon.style.display = 'inline-block';
            successIcon.style.display = 'none';
          }, 2000);
        });
      }
    });
  }
  updateMandatorSection();

  const mandatorFields = [
    'mandator-first',
    'mandator-last',
    'mandator-email',
    'mandator-address',
    'mandator-city',
    'mandator-zip',
    'mandator-country'
  ];

  mandatorFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        updatePreview();
      });
    }
  });

  document.addEventListener('click', async e => {
    if (e.target.classList.contains('download-receipt-btn')) {
      e.target.disabled = true;
      const originalText = e.target.textContent;
      e.target.textContent = '⬇ Downloading...';

      const requestId = e.target.getAttribute('data-requestid');
      const ep = e.target.getAttribute('data-ep');
      const initials = document.getElementById('initials').value.trim();

      try {
        if (!tokenData.access_token) throw new Error(tokenData.error || 'Missing access_token');

        const pdfRes = await fetch(`https://upc-optout-backend.onrender.com/receipt?initials=${initials}&requestId=${requestId}&ep=${encodeURIComponent(ep)}`);

        if (!pdfRes.ok) throw new Error('Receipt download failed');

        const blob = await pdfRes.blob();
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `Opt-Out Request Acknowledgement ${ep}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

      } catch (err) {
        alert(`❌ Failed to download receipt: ${err.message}`);
        console.error(err);
      } finally {
        e.target.disabled = false;
        e.target.textContent = originalText;
      }
    }
  });

  document.getElementById('result')?.addEventListener('click', async e => {
    if (e.target.id === 'download-all-receipts') {
      const allButtons = [...document.querySelectorAll('.download-receipt-btn')];
      const initials = document.getElementById('initials').value.trim();
      const spinner = document.getElementById('zip-spinner');

      if (!allButtons.length) return alert('No receipts to download.');

      e.target.disabled = true;
      spinner.style.display = 'block';

      try {
        const tokenRes = await fetch('https://upc-optout-backend.onrender.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initials })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error(tokenData.error || 'Missing access_token');

        const zip = new JSZip();

        for (const btn of allButtons) {
          const ep = btn.getAttribute('data-ep');
          const requestId = btn.getAttribute('data-requestid');

          const pdfRes = await fetch(`https://upc-optout-backend.onrender.com/receipt?initials=${initials}&requestId=${requestId}&ep=${encodeURIComponent(ep)}`);


          if (!pdfRes.ok) {
            console.warn(`Skipping ${ep}: receipt not found`);
            continue;
          }

          const blob = await pdfRes.blob();
          zip.file(`Opt-Out Request Acknowledgement ${ep}.pdf`, blob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'upc_receipts.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        alert(`❌ Failed to download all receipts: ${err.message}`);
        console.error(err);
      } finally {
        e.target.disabled = false;
        spinner.style.display = 'none';
      }
    }
  });

  fetch('https://upc-optout-backend.onrender.com/mode')
    .then(res => res.json())
    .then(data => {
      const box = document.getElementById('mode-indicator');
      box.textContent = `${data.emoji} ${data.mode}`;
      box.style.background = data.mode === 'LIVE' ? '#d1fae5' : '#fef3c7';  // green or amber
      box.style.border = data.mode === 'LIVE' ? '2px solid #10b981' : '2px dashed #f59e0b';
    });



});