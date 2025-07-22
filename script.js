// script.js
const epList = document.getElementById('ep-list');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const applicantSummary = document.getElementById('applicant-summary');
const submitButton = document.getElementById('submit');

let extractedEPs = [];
let applicationPDF = null;
let mandatePDF = null;
let applicantInfo = {};

function extractFromSpreadsheet(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Parsed rows from spreadsheet:', rows);
    if (!rows.length || !Array.isArray(rows[0])) {
      console.error('Spreadsheet is empty or headers are malformed');
      alert('The spreadsheet is missing a recognizable header row. Make sure the first row contains: EP Pub Number, Owner 1 Name, Owner 1 Address');
      return;
    }
    let headerRowIndex = -1;
    let headers = [];
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const candidate = rows[i].map(h => (h ?? '').toString().toLowerCase().trim());
      if (candidate.some(h => (h || '').toString().toLowerCase().includes('ep pub'))) {
        headers = candidate;
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      console.error('Could not find a valid header row.');
      alert('Could not find a row with EP Pub Number. Please check your spreadsheet.');
      return;
    }
    console.log('Detected headers:', headers);

    const epIndex = headers.findIndex(h => h.includes('ep pub'));
    const nameIndex = headers.findIndex(h => h.includes('owner 1 name'));
    const addrIndex = headers.findIndex(h => h.includes('owner 1 address'));

    

    

    if (epIndex === -1 || nameIndex === -1 || addrIndex === -1) {
      console.warn('One or more required headers were not found.');
      alert('Could not find one of the expected headers: EP Pub Number, Owner 1 Name, Owner 1 Address. Please check your spreadsheet.');
      return;
    }
    

    extractedEPs = rows.slice(headerRowIndex + 1)
      .map(row => row[epIndex])
      .filter(ep => ep && ep.toString().startsWith('EP'))
      .map(ep => ep.toString().trim());

    epList.innerHTML = extractedEPs.length
      ? `<li>${extractedEPs.join('</li><li>')}</li>`
      : '<li>No EP Publication Numbers found</li>';

    const name = rows[headerRowIndex + 1]?.[nameIndex]?.trim() || '';
    const addressFull = rows[headerRowIndex + 1]?.[addrIndex]?.trim() || '';
    const addressParts = addressFull.split(',').map(part => part.trim());
    applicantInfo = {
      isNaturalPerson: document.getElementById('person-type').value === 'true',
      name,
      address: {
        address: addressParts[0] || '',
        city: addressParts[1] || '',
        zipCode: addressParts[2] || '',
        state: addressParts[3] || 'DE'
      }
    };

    updateApplicantDisplay();
    updatePreview();
  };
  reader.readAsArrayBuffer(file);
}

function updateApplicantDisplay() {
  const html = applicantInfo.name ? `
    <strong>Name:</strong> ${applicantInfo.name}<br>
    <strong>Type:</strong> ${applicantInfo.isNaturalPerson ? 'Natural Person' : 'Legal Entity'}<br>
    <strong>Address:</strong><br>
    ${applicantInfo.address.address}<br>
    ${applicantInfo.address.city} ${applicantInfo.address.zipCode}<br>
    ${applicantInfo.address.state}
  ` : '<em>No applicant data found</em>';
  applicantSummary.innerHTML = html;
}

document.getElementById('person-type').addEventListener('change', () => {
  applicantInfo.isNaturalPerson = document.getElementById('person-type').value === 'true';
  updateApplicantDisplay();
  updatePreview();
});

function updatePreview() {
  const initials = document.getElementById('initials').value.trim();
  const mandator = document.getElementById('mandator_json').value;

  const payloads = extractedEPs.map(ep => ({
    initials,
    ep_number: ep,
    applicant: applicantInfo,
    mandator: mandator ? JSON.parse(mandator) : undefined
  }));
  preview.textContent = JSON.stringify(payloads, null, 2);
}

document.getElementById('initials').addEventListener('input', updatePreview);
document.getElementById('mandator_json').addEventListener('input', updatePreview);

document.getElementById('spreadsheet').addEventListener('change', e => {
  if (e.target.files[0]) extractFromSpreadsheet(e.target.files[0]);
});

document.getElementById('application_pdf').addEventListener('change', e => {
  applicationPDF = e.target.files[0];
});

document.getElementById('mandate_pdf').addEventListener('change', e => {
  mandatePDF = e.target.files[0];
});

submitButton.addEventListener('click', async () => {
  const initials = document.getElementById('initials').value.trim();
  const mandator = document.getElementById('mandator_json').value;

  if (!applicationPDF || !initials || !applicantInfo.name) {
    alert('Initials, applicant info and application PDF are required.');
    return;
  }

  for (const ep of extractedEPs) {
    const formData = new FormData();
    formData.append('initials', initials);
    formData.append('ep_number', ep);
    formData.append('applicant', JSON.stringify({
      isNaturalPerson: applicantInfo.isNaturalPerson,
      contactAddress: applicantInfo.address,
      email: 'placeholder@example.com',
      naturalPersonDetails: applicantInfo.isNaturalPerson ? {
        firstName: applicantInfo.name.split(' ')[0] || 'First',
        lastName: applicantInfo.name.split(' ').slice(1).join(' ') || 'Last'
      } : undefined,
      legalEntityDetails: !applicantInfo.isNaturalPerson ? {
        name: applicantInfo.name,
        placeOfBusiness: applicantInfo.address.state
      } : undefined
    }));
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
