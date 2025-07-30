// script.js

document.addEventListener('DOMContentLoaded', () => {
  let extractedEPs = [];
  let applicationPDF = null;
  let mandatePDF = null;
  let applicantInfo = {};
  let applicationPdfBase64 = "";
  let hasParsedAddress = false;
  let mandatePdfBase64 = "";


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

  function getMandator() {
    const firstName = document.getElementById('mandator-first')?.value.trim();
    const lastName = document.getElementById('mandator-last')?.value.trim();
    const email = document.getElementById('mandator-email')?.value.trim();
    const address = document.getElementById('mandator-address')?.value.trim();
    const city = document.getElementById('mandator-city')?.value.trim();
    const zip = document.getElementById('mandator-zip')?.value.trim();
    const country = document.getElementById('mandator-country')?.value.trim();

    if (!firstName && !lastName && !email && !address && !city && !zip && !country) {
      return null;
    }

    return {
      firstName,
      lastName,
      email,
      contactAddress: {
        address,
        zipCode: zip,
        city,
        state: country
      }
    };
  }

    // Update the preview function to include state in the payload
  function updatePreview() {
    const initials = document.getElementById('initials').value.trim();
    const status = initials === 'YH' ? 'RegisteredRepresentativeBeforeTheUPC' : 'NotARegisteredRepresentativeBeforeTheUPC';

    const requestContainer = document.getElementById('request-json');
    requestContainer.innerHTML = '';

    const gridWrapper = document.createElement('div');
    gridWrapper.style.display = 'grid';
    gridWrapper.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
    gridWrapper.style.gap = '1rem';

    extractedEPs.forEach(ep => {
      const basePayload = {
        statusPersonLodgingApplication: status,
        internalReference: ep,
        applicant: {
          isNaturalPerson: applicantInfo.isNaturalPerson,
          contactAddress: {
            address: applicantInfo.address?.address || '',
            city: applicantInfo.address?.city || '',
            zipCode: applicantInfo.address?.zipCode || '',
            state: applicantInfo.address?.state || ''
          },
          ...(applicantInfo.isNaturalPerson ? {
            naturalPersonDetails: applicantInfo.naturalPersonDetails
          } : {
            legalEntityDetails: {
              name: applicantInfo.name
            }
          }),
          ...(applicantInfo.email ? { email: applicantInfo.email } : {})
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

      const mandatorSection = document.getElementById('mandator-section');
      const mandateBox = document.getElementById('mandate-preview-box');

      if (status === 'NotARegisteredRepresentativeBeforeTheUPC') {
        mandatorSection?.classList.remove('hidden');
        mandateBox?.classList.remove('hidden');
        mandateBox?.classList.remove('hidden');

        const firstName = document.getElementById('mandator-first')?.value.trim();
        const lastName = document.getElementById('mandator-last')?.value.trim();
        const email = document.getElementById('mandator-email')?.value.trim();
        const phone = document.getElementById('mandator-phone')?.value.trim();
        const address = document.getElementById('mandator-address')?.value.trim();
        const city = document.getElementById('mandator-city')?.value.trim();
        const zip = document.getElementById('mandator-zip')?.value.trim();
        const country = document.getElementById('mandator-country')?.value.trim();

        if (firstName && lastName && email && phone && address && city && zip && country) {
          basePayload.mandator = {
            naturalPersonDetails: {
              firstName,
              lastName
            },
            email,
            phone,
            contactAddress: {
              address,
              zipCode: zip,
              city,
              state: country
            }
          };
        }

        if (mandatePdfBase64) {
          basePayload.documents.push({
            documentType: 'Mandate',
            documentTitle: 'Mandate Form',
            documentDescription: `Mandate for ${ep}`,
            attachments: [
              {
                data: mandatePdfBase64,
                language: 'en',
                filename: `Optout_mandate_${ep}.pdf`,
                mimeType: 'application/pdf'
              }
            ]
          });
        }
      } else {
        mandatorSection?.classList.add('hidden');
        mandateBox?.classList.add('hidden');
      }

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.border = '1px solid #ccc';
      container.style.background = '#f9f9f9';
      container.style.padding = '1em';
      container.style.overflow = 'auto';

      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.margin = 0;
      pre.textContent = JSON.stringify(basePayload, null, 2);

      const copyBtn = document.createElement('button');
      copyBtn.innerHTML = '<img src="copy-icon.svg" alt="Copy" width="16" height="16">';
      copyBtn.style.position = 'absolute';
      copyBtn.style.top = '0.5rem';
      copyBtn.style.right = '0.5rem';
      copyBtn.style.cursor = 'pointer';
      copyBtn.style.background = 'transparent';
      copyBtn.style.border = 'none';
      copyBtn.style.padding = 0;

      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.textContent)
          .then(() => {
            copyBtn.innerHTML = '<img src="check-icon.svg" alt="Copied" width="16" height="16">';
            setTimeout(() => {
              copyBtn.innerHTML = '<img src="copy-icon.svg" alt="Copy" width="16" height="16">';
            }, 1500);
          })
          .catch(err => console.error('Copy failed', err));
      });

      container.appendChild(copyBtn);
      container.appendChild(pre);
      gridWrapper.appendChild(container);
    });

    requestContainer.appendChild(gridWrapper);
  }
  // Hook to show/hide Mandator section on initials input
  const initialsField = document.getElementById('initials');
  if (initialsField) {
    initialsField.addEventListener('input', updatePreview);
  }
  [
    'mandator-first',
    'mandator-last',
    'mandator-email',
    'mandator-address',
    'mandator-city',
    'mandator-zip',
    'mandator-country'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updatePreview);
    }
  });


  function readFileAsBase64(file, callback) {
    const reader = new FileReader();
    reader.onload = () => callback(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  }

  // Update the extractFromSpreadsheet function
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
      const emailIndex = headers.findIndex(h => (h || '').includes('owner 1 email'));

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
      const email = rows[headerRowIndex + 1]?.[emailIndex]?.trim() || '';

  
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

        // Ensure the country is set as state
        const addressData = {
          ...addrRes,
          state: addrRes.country || addrRes.state || ''  // Prioritize country as state
        };

        applicantInfo = {
          isNaturalPerson: isNatural,
          name,
          address: addressData,
          naturalPersonDetails: nameRes || undefined,
          email: email || undefined

        };
        console.log('Updated applicantInfo:', applicantInfo);

        // Display extracted EPs
        if (epList) {
          epList.innerHTML = `<p>Found ${extractedEPs.length} EP numbers:</p>
            <ul>${extractedEPs.map(ep => `<li>${ep}</li>`).join('')}</ul>`;
        }

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

  // Update the updateApplicantDisplay function to properly show the state
  function updateApplicantDisplay() {
    try {
      const { address = {}, name, isNaturalPerson, naturalPersonDetails } = applicantInfo;
      let html = `<strong>Name:</strong> ${name || ''}<br>
                  <strong>Type:</strong> ${isNaturalPerson ? 'Natural Person' : 'Legal Entity'}<br>
                  <strong>Address:</strong><br>
                  ${address.address || ''}<br>
                  ${address.city || ''} ${address.zipCode || ''}<br>
                  ${address.state || ''}`;  // Make sure state is displayed
      if (applicantInfo.email) {
        html += `<br><strong>Email:</strong> ${applicantInfo.email}`;
      }

      if (isNaturalPerson && naturalPersonDetails) {
        html += `<br><strong>First Name:</strong> ${naturalPersonDetails.firstName || ''}<br>
                <strong>Last Name:</strong> ${naturalPersonDetails.lastName || ''}`;
      }

      const applicantSummary = document.getElementById('applicant-summary');
      if (applicantSummary) {
        applicantSummary.innerHTML = html;
      }
    } catch (error) {
      console.error('Error updating applicant display:', error);
    }
  }




  function showSpinner(show) {
    document.getElementById('spinner').style.display = show ? 'block' : 'none';
  };

  // Add event listeners with null checks for all elements
  const personType = document.getElementById('person-type');
  if (personType) {
    personType.addEventListener('change', () => {
      applicantInfo.isNaturalPerson = personType.value === 'true';
      updateApplicantDisplay();
      updatePreview();
    });
  }

  const initials = document.getElementById('initials');
  if (initials) {
    initials.addEventListener('input', updatePreview);
  }

  const spreadsheet = document.getElementById('spreadsheet');
  if (spreadsheet) {
    spreadsheet.addEventListener('change', e => {
      if (e.target.files[0]) extractFromSpreadsheet(e.target.files[0]);
    });
  }

  const applicationPdfInput = document.getElementById('application_pdf');
  if (applicationPdfInput) {
    applicationPdfInput.addEventListener('change', e => {
      applicationPDF = e.target.files[0];

      readFileAsBase64(applicationPDF, base64 => {
        applicationPdfBase64 = base64;
        appPdfBase64Display.textContent = base64;
        updatePreview();
      });

      // --- Preview in <embed> ---
      const preview = document.getElementById('application-preview');
      if (preview && applicationPDF) {
        preview.innerHTML = '';  // Clear previous content

        const objectURL = URL.createObjectURL(applicationPDF);
        preview.innerHTML = `<embed src="${objectURL}" type="application/pdf" width="100%" height="600px">`;
      }
    });
  }

  const mandatePdfInput = document.getElementById('mandate_pdf');
  if (mandatePdfInput) {
    mandatePdfInput.addEventListener('change', e => {
      mandatePDF = e.target.files[0];
      readFileAsBase64(mandatePDF, base64 => {
        mandatePdfBase64Display.textContent = base64;
        mandatePdfBase64 = base64;
        updatePreview();
      });

      const preview = document.getElementById('mandate-preview');
      if (preview) {
        const url = URL.createObjectURL(mandatePDF);
        preview.innerHTML = `<embed src="${url}" type="application/pdf" width="100%" height="400px" />`;
      }
    });
  }

  if (submitButton) {

    submitButton.addEventListener('click', async () => {
      const initials = document.getElementById('initials').value.trim();

      if (!applicationPDF || !initials || !applicantInfo.name) {
        alert('Initials, applicant info and application PDF are required.');
        return;
      }
      const mandator = getMandator();

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
            // placeOfBusiness: applicantInfo.address.state // Optional field - commented out
          } : undefined
        }));
        if (mandator) formData.append('mandator', JSON.stringify(mandator));
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

  // For the edit/save buttons, add toggle functionality
  if (editBtn && saveBtn && editForm) {
    console.log('Edit and Save buttons found');
    let originalInfo = null; // Store original info for cancel

    editBtn.addEventListener('click', () => {
      console.log('Edit button clicked');
      if (editBtn.textContent === 'Edit') {
        // Store original info before editing
        originalInfo = JSON.parse(JSON.stringify(applicantInfo));
        
        // Safely set form values with null checks
        const setInputValue = (id, value) => {
          const element = document.getElementById(id);
          if (element) element.value = value || '';
        };

        setInputValue('edit-name', applicantInfo.name);
        setInputValue('edit-address', applicantInfo.address?.address);
        setInputValue('edit-city', applicantInfo.address?.city);
        setInputValue('edit-zip', applicantInfo.address?.zipCode);
        setInputValue('edit-state', applicantInfo.address?.state);

        const nameSplitFields = document.getElementById('name-split-fields');
        if (nameSplitFields) {
          nameSplitFields.style.display = applicantInfo.isNaturalPerson ? 'block' : 'none';
        }

        if (applicantInfo.isNaturalPerson) {
          setInputValue('edit-first', applicantInfo.naturalPersonDetails?.firstName);
          setInputValue('edit-last', applicantInfo.naturalPersonDetails?.lastName);
        }

        editForm.style.display = 'block';
        editBtn.textContent = 'Cancel';
      } else {
        // Cancel was clicked - restore original info
        if (originalInfo) {
          applicantInfo = originalInfo;
          updateApplicantDisplay();
          updatePreview();
        }
        editForm.style.display = 'none';
        editBtn.textContent = 'Edit';
      }
    });

    saveBtn.addEventListener('click', () => {
      console.log('Save button clicked');
      const getValue = (id) => document.getElementById(id)?.value?.trim() || '';

      applicantInfo.name = getValue('edit-name');
      applicantInfo.address = {
        address: getValue('edit-address'),
        city: getValue('edit-city'),
        zipCode: getValue('edit-zip'),
        state: getValue('edit-state')
      };

      if (applicantInfo.isNaturalPerson) {
        applicantInfo.naturalPersonDetails = {
          firstName: getValue('edit-first'),
          lastName: getValue('edit-last')
        };
      }

      applicantInfo.email = getValue('edit-email');

      updateApplicantDisplay();
      
      updatePreview();
      editForm.style.display = 'none';
      editBtn.textContent = 'Edit'; // Reset button text
    });
  } else {
    console.log('Edit/Save buttons not found');
  }

  // For the copy button, update with icon toggle
  if (copyRequestJsonButton) {
    console.log('Copy button found');
    const copyIcon = copyRequestJsonButton.querySelector('.copy-icon');
    const successIcon = copyRequestJsonButton.querySelector('.success-icon');
    
    copyRequestJsonButton.addEventListener('click', () => {
      if (requestBodyDisplay.textContent) {
        navigator.clipboard.writeText(requestBodyDisplay.textContent)
          .then(() => {
            if (copyIcon && successIcon) {
              copyIcon.style.display = 'none';
              successIcon.style.display = 'block';
              
              setTimeout(() => {
                copyIcon.style.display = 'block';
                successIcon.style.display = 'none';
              }, 2000);
            }
          })
          .catch(err => console.error('Failed to copy:', err));
      }
    });
  } else {
    console.log('Copy button not found');
  }
});
const allowedEmails = ["you@example.com", "colleague@example.com"];

window.handleCredentialResponse = async (response) => {
  const { credential } = response;

  const backendRes = await fetch('https://upc-optout-backend.onrender.com/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: credential })
  });

  const result = await backendRes.json();
  if (result.allowed) {
    alert(`Welcome, ${result.email}`);
    // Optionally store session info
    sessionStorage.setItem('userEmail', result.email);
  } else {
    alert('Access denied');
  }
};

