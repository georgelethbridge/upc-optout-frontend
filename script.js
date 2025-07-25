// script.js
const epList = document.getElementById('ep-list');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const applicantSummary = document.getElementById('applicant-summary');
const submitButton = document.getElementById('submit');
const appPdfBase64Display = document.getElementById('app-pdf-base64');
const mandatePdfBase64Display = document.getElementById('mandate-pdf-base64');
const requestBodyDisplay = document.getElementById('request-json');
const copyRequestJsonButton = document.getElementById('copy-request-json');

let extractedEPs = [];
let applicationPDF = null;
let mandatePDF = null;
let applicantInfo = {};
let applicationPdfBase64 = "";
let hasParsedAddress = false;

function readFileAsBase64(file, callback) {
  const reader = new FileReader();
  reader.onload = () => callback(reader.result.split(',')[1]);
  reader.readAsDataURL(file);
}

function extractFromSpreadsheet(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
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

    const epIndex = headers.findIndex(h => (h || '').includes('ep pub'));
    const nameIndex = headers.findIndex(h => (h || '').includes('owner 1 name'));
    const addrIndex = headers.findIndex(h => (h || '').includes('owner 1 address'));
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

document.getElementById('initials').addEventListener('input', updatePreview);

function updatePreview() {
  const initials = document.getElementById('initials').value.trim();
  const ep = extractedEPs[0];
  const status = initials === 'YH' ? 'RegisteredRepresentativeBeforeTheUPC' : 'NotARegisteredRepresentativeBeforeTheUPC';

  const basePayload = {
    statusPersonLodgingApplication: status,
    internalReference: ep,
    applicant: {
      isNaturalPerson: applicantInfo.isNaturalPerson,
      contactAddress: applicantInfo.address,
      ...(applicantInfo.isNaturalPerson ? {
        naturalPersonDetails: applicantInfo.naturalPersonDetails
      } : {
        legalEntityDetails: { name: applicantInfo.name }
      })
    },
    patent: {
      patentNumber: ep
    },
    documents: [
      {
        documentType: 'Application',
        documentTitle: `Opt-out ${ep}`,
        documentDescription: `Opt-out application for ${ep}`,
        attachments: [
          {
            data: applicationPdfBase64,
            language: 'en',
            filename: `Optout_${ep}.pdf`,
            mimeType: 'application/pdf'
          }
        ]
      }
    ]
  };

  requestBodyDisplay.textContent = JSON.stringify(basePayload, null, 2);
}

document.getElementById('spreadsheet').addEventListener('change', e => {
  if (e.target.files[0]) extractFromSpreadsheet(e.target.files[0]);
});

document.getElementById('application_pdf').addEventListener('change', e => {
  applicationPDF = e.target.files[0];
  readFileAsBase64(applicationPDF, base64 => {
    appPdfBase64Display.textContent = base64;
    applicationPdfBase64 = base64;
    updatePreview();
  });
});

document.getElementById('mandate_pdf').addEventListener('change', e => {
  mandatePDF = e.target.files[0];
  readFileAsBase64(mandatePDF, base64 => {
    mandatePdfBase64Display.textContent = base64;
  });
});

submitButton.addEventListener('click', async () => {
  const initials = document.getElementById('initials').value.trim();

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

if (copyRequestJsonButton) {
  copyRequestJsonButton.addEventListener('click', () => {
    navigator.clipboard.writeText(requestBodyDisplay.textContent)
      .then(() => alert('Request JSON copied to clipboard.'))
      .catch(() => alert('Failed to copy JSON.'));
  });
}
