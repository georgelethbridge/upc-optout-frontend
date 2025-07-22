// script.js
const dropArea = document.getElementById('drop-area');
const spreadsheetInput = document.getElementById('spreadsheet');
const epList = document.getElementById('ep-list');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const submitButton = document.getElementById('submit');

let extractedEPs = [];

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headerRow = rows[0];
    const epIndex = headerRow.findIndex(h => h.toLowerCase().includes('ep publication'));
    const refIndex = headerRow.findIndex(h => h.toLowerCase().includes('internal reference'));

    extractedEPs = rows.slice(1)
      .map(row => ({
        ep: row[epIndex]?.toString().trim(),
        ref: row[refIndex]?.toString().trim() || ''
      }))
      .filter(entry => entry.ep && entry.ep.startsWith('EP'));

    epList.innerHTML = extractedEPs.map(e => `<li>${e.ep}${e.ref ? ' — ' + e.ref : ''}</li>`).join('');
    updatePreview();
  };
  reader.readAsArrayBuffer(file);
}

spreadsheetInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

dropArea.addEventListener('dragover', e => {
  e.preventDefault();
  dropArea.classList.add('hover');
});

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('hover');
});

dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.classList.remove('hover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

function updatePreview() {
  const initials = document.getElementById('initials').value.trim();
  const applicant = document.getElementById('applicant_json').value;
  const mandator = document.getElementById('mandator_json').value;

  const previewData = extractedEPs.map(entry => ({
    initials,
    ep_number: entry.ep,
    internalReference: entry.ref,
    applicant,
    mandator
  }));
  preview.textContent = JSON.stringify(previewData, null, 2);
}

document.getElementById('initials').addEventListener('input', updatePreview);
document.getElementById('applicant_json').addEventListener('input', updatePreview);
document.getElementById('mandator_json').addEventListener('input', updatePreview);

submitButton.addEventListener('click', async () => {
  const applicationPDF = document.getElementById('application_pdf').files[0];
  const mandatePDF = document.getElementById('mandate_pdf').files[0];
  const applicant = document.getElementById('applicant_json').value;
  const mandator = document.getElementById('mandator_json').value;
  const initials = document.getElementById('initials').value.trim();

  if (!applicationPDF || !initials || !applicant) {
    alert('Initials, applicant and application PDF are required.');
    return;
  }

  for (const { ep, ref } of extractedEPs) {
    const formData = new FormData();
    formData.append('initials', initials);
    formData.append('ep_number', ep);
    formData.append('internalReference', ref);
    formData.append('applicant', applicant);
    if (mandator) formData.append('mandator', mandator);
    formData.append('application_pdf', applicationPDF);
    if (mandatePDF) formData.append('mandate_pdf', mandatePDF);

    const response = await fetch('https://upc-optout-api.onrender.com/submit', {
      method: 'POST',
      body: formData
    });

    const resJson = await response.json();
    const status = response.ok ? '✅' : '❌';
    result.innerHTML += `<p>${status} ${ep}: ${resJson.requestId || resJson.error}</p>`;
  }
});
