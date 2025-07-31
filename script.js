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
    submitBtn.disabled = true; // Start disabled

    submitBtn.addEventListener('click', async () => {
      const initials = document.getElementById('initials').value.trim();
      if (!applicationPDF || !initials || !applicantInfo.name) {
        alert('Initials, applicant info and application PDF are required.');
        return;
      }
      submitBtn.disabled = true; // Prevent re-clicking during submission
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
      submitBtn.disabled = false; // Re-enable after processing
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

