import API from "./api.js";

const fileInput = document.getElementById("certFile");
const fileInfo = document.getElementById("fileInfo");
const fileError = document.getElementById("fileError");
const verifyBtn = document.getElementById("verifyBtn");
const fileSuccess = document.getElementById("fileSuccess");

let selectedFile = null;

fileInput.addEventListener("change", () => {
  fileError.textContent = "";
  if (fileSuccess) {
    fileSuccess.textContent = "";
    fileSuccess.classList.add("hidden");
  }

  const file = fileInput.files[0];
  selectedFile = file || null;
  if (!file) {
    fileInfo.textContent = "";
    return;
  }
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowed.includes(file.type)) {
    fileError.textContent = "Only PDF or DOC/DOCX files are allowed.";
    selectedFile = null;
    fileInput.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    fileError.textContent = "File too large. Max size is 5 MB.";
    selectedFile = null;
    fileInput.value = "";
    return;
  }
  fileInfo.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
});

verifyBtn.addEventListener("click", async () => {
  fileError.textContent = "";
  if (fileSuccess) {
    fileSuccess.textContent = "";
    fileSuccess.classList.add("hidden");
  }

  if (!selectedFile) {
    fileError.textContent = "Please choose a certificate file.";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const forRole = params.get("role") || "Coach";

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("forRole", forRole);

  // Disable button during upload
  verifyBtn.disabled = true;
  const originalText = verifyBtn.textContent;
  verifyBtn.textContent = "Verifying…";

  try {
    await API.uploadCertificate(formData);

    // Inline success message
    if (fileSuccess) {
      fileSuccess.textContent = "Submitted for approval";
      fileSuccess.classList.remove("hidden");
    }

    // Redirect back to Details Step 3 after a short delay
    setTimeout(() => {
      window.location.href = "details.html?cert=uploaded#step-3";
    }, 900);
  } catch (err) {
    fileError.textContent = err.message || "Upload failed";
    verifyBtn.disabled = false;
    verifyBtn.textContent = originalText;
  }
});
