// script.js

document.addEventListener('DOMContentLoaded', () => {
  let extractedEPs = [];
  let applicationPDF = null;
  let mandatePDF = null;
  let applicantInfo = {};
  let applicationPdfBase64 = "";
  let mandatePdfBase64 = "";

  const epList = document.getElementById('ep-list');
  const result = document.getElementById('result');
  const applicantSummary = document.getElementById('applicant-summary');
  const submitButton = document.getElementById('submit');
  const appPdfBase64Display = document.getElementById('app-pdf-base64');
  const mandatePdfBase64Display = document.getElementById('mandate-pdf-base64');
  const requestBodyDisplay = document.getElementById('request-json');
  const copyRequestJsonButton = document.getElementById('copy-request-json');
  const editBtn = document.getElementById('edit-applicant');
  const saveBtn = document.getElementById('save-applicant');
  const editForm = document.getElementById('applicant-edit-form');

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
      const epIndex = headers.findIndex(h => h.includes('ep pub'));
      const nameIndex = headers.findIndex(h => h.includes('owner 1 name'));
      const addrIndex = headers.findIndex(h => h.includes('owner 1 address'));
      const emailIndex = headers.findIndex(h => h.includes('owner 1 email'));

      extractedEPs = rows.slice(headerRowIndex + 1)
        .map(row => (row[epIndex] ?? '').toString().trim())
        .filter(ep => ep.startsWith('EP'));

      const name = rows[headerRowIndex + 1]?.[nameIndex]?.trim() || '';
      const addressFull = rows[headerRowIndex + 1]?.[addrIndex]?.trim() || '';
      const email = rows[headerRowIndex + 1]?.[emailIndex]?.trim() || '';

      const isNatural = document.getElementById('person-type').value === 'true';
      document.getElementById('spinner').style.display = 'block';

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
        document.getElementById('spinner').style.display = 'none';
        enableSubmitIfReady();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const spreadsheet = document.getElementById('spreadsheet');
  if (spreadsheet) {
    spreadsheet.addEventListener('change', e => {
      if (e.target.files[0]) extractFromSpreadsheet(e.target.files[0]);
    });
  }

  async function submitOptOut(ep, formData) {
    try {
      const res = await fetch('https://upc-optout-backend.onrender.com/submit', {
        method: 'POST',
        body: formData
      });
      const resJson = await res.json();
      const status = res.ok ? '✅' : '❌';
      const message = resJson.message || resJson.error || 'Unknown response';
      result.innerHTML += `<p><strong>${ep}</strong>: ${status} ${message}</p>`;
    } catch (e) {
      result.innerHTML += `<p><strong>${ep}</strong>: ❌ Failed to connect to server</p>`;
    }
  }

  const submitBtn = document.getElementById('submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.addEventListener('click', async () => {
      const initials = document.getElementById('initials').value.trim();
      if (!applicationPDF || !initials || !applicantInfo.name) {
        alert('Initials, applicant info and application PDF are required.');
        return;
      }
      submitBtn.disabled = true;
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
        await submitOptOut(ep, formData);
      }
      submitBtn.disabled = false;
    });
  }

  function enableSubmitIfReady() {
    const initials = document.getElementById('initials').value.trim();
    if (applicationPDF && initials && applicantInfo.name && extractedEPs.length) {
      submitBtn.disabled = false;
    }
  }

  document.getElementById('initials')?.addEventListener('input', enableSubmitIfReady);
});
