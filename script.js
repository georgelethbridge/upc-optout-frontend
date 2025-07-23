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
let hasParsedAddress = false;

function extractFromSpreadsheet(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Parsed rows from spreadsheet:', rows);
    if (!rows.length || !Array.isArray(rows[0])) {
      alert('Spreadsheet headers are malformed.');
      return;
    }

    let headerRowIndex = -1;
    let headers = [];
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const candidate = rows[i].map(h => (h ?? '').toString().toLowerCase().trim());
      if (candidate.some(h => (h || '').includes('ep pub'))) {
        headers = candidate;
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) return alert('Header row not found');

    const epIndex = headers.findIndex(h => h.includes('ep pub'));
    const nameIndex = headers.findIndex(h => h.includes('owner 1 name'));
    const addrIndex = headers.findIndex(h => h.includes('owner 1 address'));
    if (epIndex === -1 || nameIndex === -1 || addrIndex === -1) {
      alert('Expected headers not found');
      return;
    }

    extractedEPs = rows.slice(headerRowIndex + 1)
      .map(row => (row[epIndex] ?? '').toString().trim())
      .filter(ep => ep.startsWith('EP'));
    epList.innerHTML = extractedEPs.map(ep => `<li>${ep}</li>`).join('');

    const name = rows[headerRowIndex + 1]?.[nameIndex]?.trim() || '';
    const addressFull = rows[headerRowIndex + 1]?.[addrIndex]?.trim() || '';

    const isNatural = document.getElementById('person-type').value === 'true';
    showSpinner(true);

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

      applicantInfo = {
        isNaturalPerson: isNatural,
        name,
        address: addrRes,
        naturalPersonDetails: nameRes || undefined
      };
    } catch (err) {
      console.error(err);
      alert('Failed to parse address or name');
    } finally {
      updateApplicantDisplay();
      updatePreview();
      showSpinner(false);
    }
  };
  reader.readAsArrayBuffer(file);
}

function updateApplicantDisplay() {
  const { address, name, isNaturalPerson, naturalPersonDetails } = applicantInfo;
  let html = `<strong>Name:</strong> ${name}<br>
              <strong>Type:</strong> ${isNaturalPerson ? 'Natural Person' : 'Legal Entity'}<br>
              <strong>Address:</strong><br>
              ${address.address}<br>
              ${address.city} ${address.zipCode}<br>
              ${address.country}`;

  if (isNaturalPerson && naturalPersonDetails) {
    html += `<br><strong>First Name:</strong> ${naturalPersonDetails.firstName}<br>
             <strong>Last Name:</strong> ${naturalPersonDetails.lastName}`;
  }

  applicantSummary.innerHTML = html;
}

document.getElementById('person-type').addEventListener('change', () => {
  applicantInfo.isNaturalPerson = document.getElementById('person-type').value === 'true';
  updateApplicantDisplay();
  updatePreview();
});

document.getElementById('edit-applicant').addEventListener('click', () => {
  const form = document.getElementById('applicant-edit-form');
  const isNatural = applicantInfo.isNaturalPerson;

  document.getElementById('edit-name').value = applicantInfo.name;
  document.getElementById('edit-address').value = applicantInfo.address.address;
  document.getElementById('edit-city').value = applicantInfo.address.city;
  document.getElementById('edit-zip').value = applicantInfo.address.zipCode;
  document.getElementById('edit-country').value = applicantInfo.address.country;

  if (isNatural && applicantInfo.naturalPersonDetails) {
    document.getElementById('name-split-fields').style.display = 'block';
    document.getElementById('edit-first').value = applicantInfo.naturalPersonDetails.firstName;
    document.getElementById('edit-last').value = applicantInfo.naturalPersonDetails.lastName;
  } else {
    document.getElementById('name-split-fields').style.display = 'none';
  }

  form.style.display = form.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('save-applicant').addEventListener('click', () => {
  applicantInfo.name = document.getElementById('edit-name').value;
  applicantInfo.address = {
    address: document.getElementById('edit-address').value,
    city: document.getElementById('edit-city').value,
    zipCode: document.getElementById('edit-zip').value,
    country: document.getElementById('edit-country').value
  };

  if (applicantInfo.isNaturalPerson) {
    applicantInfo.naturalPersonDetails = {
      firstName: document.getElementById('edit-first').value,
      lastName: document.getElementById('edit-last').value
    };
  }

  updateApplicantDisplay();
  updatePreview();
  document.getElementById('applicant-edit-form').style.display = 'none';
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
      naturalPersonDetails: applicantInfo.isNaturalPerson ? applicantInfo.naturalPersonDetails : undefined,
      legalEntityDetails: !applicantInfo.isNaturalPerson ? {
        name: applicantInfo.name,
        placeOfBusiness: applicantInfo.address.country
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

function showSpinner(show) {
  document.getElementById('spinner').style.display = show ? 'block' : 'none';
};
