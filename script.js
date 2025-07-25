// script.js

document.addEventListener('DOMContentLoaded', () => {
  let extractedEPs = [];
  let applicationPDF = null;
  let mandatePDF = null;
  let applicantInfo = {};
  let applicationPdfBase64 = "";
  let hasParsedAddress = false;


  const epList = document.getElementById('ep-list');
  const preview = document.getElementById('preview');
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


  function readFileAsBase64(file, callback) {
    const reader = new FileReader();
    reader.onload = () => callback(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  }

  function extractFromSpreadsheet(file) {
    console.log('Starting to extract from spreadsheet:', file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      console.log('FileReader loaded');
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      console.log('Parsed rows from spreadsheet:', rows);
  
      if (!rows.length || !Array.isArray(rows[0])) {
        console.error('Spreadsheet headers are malformed:', rows);
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
      console.log('Detected headers:', headers);
      console.log('Header row index:', headerRowIndex);
  
      if (headerRowIndex === -1) {
        console.error('Header row not found');
        alert('Header row not found');
        return;
      }
  
      const epIndex = headers.findIndex(h => (h || '').includes('ep pub'));
      const nameIndex = headers.findIndex(h => (h || '').includes('owner 1 name'));
      const addrIndex = headers.findIndex(h => (h || '').includes('owner 1 address'));
      console.log('Found indices:', { epIndex, nameIndex, addrIndex });
  
      if (epIndex === -1 || nameIndex === -1 || addrIndex === -1) {
        console.error('Expected headers not found:', { epIndex, nameIndex, addrIndex });
        alert('Expected headers not found');
        return;
      }
  
      extractedEPs = rows.slice(headerRowIndex + 1)
        .map(row => (row[epIndex] ?? '').toString().trim())
        .filter(ep => ep.startsWith('EP'));
      console.log('Extracted EPs:', extractedEPs);
  
      const name = rows[headerRowIndex + 1]?.[nameIndex]?.trim() || '';
      const addressFull = rows[headerRowIndex + 1]?.[addrIndex]?.trim() || '';
      console.log('Extracted name and address:', { name, addressFull });
  
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
        console.log('API responses:', { addrRes, nameRes });
  
        applicantInfo = {
          isNaturalPerson: isNatural,
          name,
          address: addrRes,
          naturalPersonDetails: nameRes || undefined
        };
        console.log('Updated applicantInfo:', applicantInfo);
      } catch (err) {
        console.error('API error:', err);
        alert('Failed to parse address or name');
      } finally {
        updateApplicantDisplay();
        updatePreview();
        showSpinner(false);
      }
    };
    
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
    };
    
    reader.readAsArrayBuffer(file);
  }

  function updateApplicantDisplay() {
    try {
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
    } catch (error) {
      console.error('Error updating applicant display:', error);
    }
  }

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

  function showSpinner(show) {
    document.getElementById('spinner').style.display = show ? 'block' : 'none';
  };

  document.getElementById('person-type').addEventListener('change', () => {
    applicantInfo.isNaturalPerson = document.getElementById('person-type').value === 'true';
    updateApplicantDisplay();
    updatePreview();
  });

  document.getElementById('initials').addEventListener('input', updatePreview);
  
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

  const mandatePdfInput = document.getElementById('mandate_pdf');
  if (mandatePdfInput) {
    mandatePdfInput.addEventListener('change', e => {
      mandatePDF = e.target.files[0];
      readFileAsBase64(mandatePDF, base64 => {
        mandatePdfBase64Display.textContent = base64;
      });
    });
  }

  if (submitButton) {

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

  }

  if (copyRequestJsonButton) {
    copyRequestJsonButton.addEventListener('click', () => {
      if (requestBodyDisplay.textContent) {
        navigator.clipboard.writeText(requestBodyDisplay.textContent)
          .then(() => alert('Copied to clipboard!'))
          .catch(err => console.error('Failed to copy:', err));
      }
    });
  }

  if (editBtn && saveBtn) {
    editBtn.addEventListener('click', () => {
      const isNatural = applicantInfo.isNaturalPerson;
      document.getElementById('edit-name').value = applicantInfo.name || '';
      document.getElementById('edit-address').value = applicantInfo.address.address || '';
      document.getElementById('edit-city').value = applicantInfo.address.city || '';
      document.getElementById('edit-zip').value = applicantInfo.address.zipCode || '';
      document.getElementById('edit-country').value = applicantInfo.address.country || '';
      if (isNatural) {
        document.getElementById('edit-first').value = applicantInfo.naturalPersonDetails?.firstName || '';
        document.getElementById('edit-last').value = applicantInfo.naturalPersonDetails?.lastName || '';
        document.getElementById('name-split-fields').style.display = 'block';
      } else {
        document.getElementById('name-split-fields').style.display = 'none';
      }
      editForm.style.display = 'block';
    });


    saveBtn.addEventListener('click', () => {
      applicantInfo.name = document.getElementById('edit-name').value.trim();
      applicantInfo.address = {
        address: document.getElementById('edit-address').value.trim(),
        city: document.getElementById('edit-city').value.trim(),
        zipCode: document.getElementById('edit-zip').value.trim(),
        country: document.getElementById('edit-country').value.trim()
      };
      if (applicantInfo.isNaturalPerson) {
        applicantInfo.naturalPersonDetails = {
          firstName: document.getElementById('edit-first').value.trim(),
          lastName: document.getElementById('edit-last').value.trim()
        };
      }
      updateApplicantDisplay();
      updatePreview();
      editForm.style.display = 'none';
    });
  }
});