(() => {
  "use strict";

  const source = window.OCC_DATA;
  const linkOverridesApi = "/api/link-overrides";
  const wiPdfsApi = "/api/wi-pdfs";
  const documentsApi = "/api/documents";
  const editSessionApi = "/api/edit-session";
  const maxPdfBytes = 25 * 1024 * 1024;

  if (!source || !Array.isArray(source.documents)) {
    document.getElementById("document-rows").innerHTML =
      '<tr class="empty-row"><td colspan="7">Document data could not be loaded.</td></tr>';
    return;
  }

  const baseDocuments = source.documents.map((document) => ({ ...document }));
  let documents = [...baseDocuments];
  const aspPlans = Array.isArray(window.ASP_DATA) ? window.ASP_DATA : [];
  const elements = {
    toolbar: document.getElementById("document-toolbar"),
    register: document.getElementById("document-register"),
    alternative: document.getElementById("alternative-services"),
    group: document.getElementById("group-filter"),
    search: document.getElementById("search-input"),
    line: document.getElementById("line-filter"),
    headerLine: document.getElementById("header-line-filter"),
    condition: document.getElementById("condition-filter"),
    folder: document.getElementById("folder-filter"),
    rows: document.getElementById("document-rows"),
    summary: document.getElementById("results-summary"),
    scroll: document.getElementById("table-scroll"),
    clear: document.getElementById("clear-filters"),
    theme: document.getElementById("theme-toggle"),
    editModeToggle: document.getElementById("edit-mode-toggle"),
    editModeLabel: document.getElementById("edit-mode-label"),
    addWiButton: document.getElementById("add-wi-button"),
    editAuthModal: document.getElementById("edit-auth-modal"),
    editAuthForm: document.getElementById("edit-auth-form"),
    editPassword: document.getElementById("edit-password-input"),
    editAuthStatus: document.getElementById("edit-auth-status"),
    editAuthSubmit: document.getElementById("edit-auth-submit"),
    editAuthCancel: document.getElementById("edit-auth-cancel"),
    editAuthClose: document.getElementById("edit-auth-close"),
    addWiModal: document.getElementById("add-wi-modal"),
    addWiForm: document.getElementById("add-wi-form"),
    addWiTitle: document.getElementById("add-wi-document-title"),
    addWiReference: document.getElementById("add-wi-reference"),
    addWiLine: document.getElementById("add-wi-line"),
    addWiCondition: document.getElementById("add-wi-condition"),
    addWiFolder: document.getElementById("add-wi-folder"),
    addWiGroup: document.getElementById("add-wi-group"),
    addWiLinkTitle: document.getElementById("add-wi-link-title"),
    addWiUrl: document.getElementById("add-wi-url"),
    addWiStatus: document.getElementById("add-wi-status"),
    addWiSave: document.getElementById("add-wi-save"),
    addWiCancel: document.getElementById("add-wi-cancel"),
    addWiClose: document.getElementById("add-wi-close"),
    aspBlockageSearch: document.getElementById("asp-blockage-search"),
    aspTurnbackSearch: document.getElementById("asp-turnback-search"),
    aspShuttleSearch: document.getElementById("asp-shuttle-search"),
    aspRows: document.getElementById("asp-rows"),
    aspSummary: document.getElementById("asp-summary"),
    aspModal: document.getElementById("asp-modal"),
    aspModalTitle: document.getElementById("asp-modal-title"),
    aspModalDetail: document.getElementById("asp-modal-detail"),
    aspAnimation: document.getElementById("asp-animation"),
    aspClose: document.getElementById("asp-modal-close"),
    aspOriginal: document.getElementById("asp-open-original"),
    linkEditor: document.getElementById("link-editor-modal"),
    linkForm: document.getElementById("link-editor-form"),
    linkTitle: document.getElementById("link-title-input"),
    linkUrl: document.getElementById("link-url-input"),
    linkStatus: document.getElementById("link-editor-status"),
    linkSave: document.getElementById("link-editor-save"),
    linkCancel: document.getElementById("link-editor-cancel"),
    linkClose: document.getElementById("link-editor-close"),
    pdfUploader: document.getElementById("pdf-upload-modal"),
    pdfForm: document.getElementById("pdf-upload-form"),
    pdfDocument: document.getElementById("pdf-upload-document"),
    pdfFile: document.getElementById("pdf-file-input"),
    pdfFileName: document.getElementById("pdf-file-name"),
    pdfStatus: document.getElementById("pdf-upload-status"),
    pdfSave: document.getElementById("pdf-upload-save"),
    pdfCancel: document.getElementById("pdf-upload-cancel"),
    pdfClose: document.getElementById("pdf-upload-close"),
  };

  const state = {
    sortKey: "",
    sortDirection: 1,
    activeLinkDocument: null,
    linkEditorReturnFocus: null,
    activePdfDocument: null,
    pdfUploaderReturnFocus: null,
    isEditing: false,
  };
  const linkOverrides = new Map();
  const wiPdfs = new Map();

  const uniqueValues = (key) =>
    [...new Set(documents.map((document) => document[key]).filter(Boolean))];

  const documentKey = (entry) => {
    if (entry.documentKey) return entry.documentKey;
    const referenceKey = entry.reference
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return referenceKey ? `reference-${referenceKey}` : `row-${entry.row}`;
  };

  function effectiveLink(entry) {
    const override = linkOverrides.get(documentKey(entry));
    return {
      title: override?.title ?? entry.linkTitle ?? entry.reference,
      url: override?.url ?? entry.url,
    };
  }

  function addOptions(select, values, formatter = (value) => value) {
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = formatter(value);
      select.append(option);
    }
  }

  function replaceOptions(select, values, formatter = (value) => value, keepFirst = true) {
    const selected = select.value;
    while (select.options.length > (keepFirst ? 1 : 0)) select.remove(select.options.length - 1);
    addOptions(select, values, formatter);
    select.value = [...select.options].some((option) => option.value === selected) ? selected : "";
    if (!keepFirst && !select.value && select.options.length) select.selectedIndex = 0;
  }

  function refreshDocumentOptions() {
    const lines = [
      ...new Set(
        documents.flatMap((document) =>
          document.line
            .split(",")
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      ),
    ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const groups = uniqueValues("group");
    const conditions = uniqueValues("condition");
    const availableGroups = [
      ...new Set([...baseDocuments, ...documents].map((document) => document.group).filter(Boolean)),
    ];
    const availableConditions = [
      ...new Set([...baseDocuments, ...documents].map((document) => document.condition).filter(Boolean)),
    ];

    replaceOptions(elements.group, groups);
    replaceOptions(elements.line, lines, (line) => `Line ${line}`);
    replaceOptions(elements.headerLine, lines, (line) => `Line ${line}`);
    replaceOptions(elements.condition, conditions);
    replaceOptions(elements.folder, uniqueValues("folder").sort());
    replaceOptions(elements.addWiGroup, availableGroups, (value) => value, false);
    replaceOptions(elements.addWiCondition, availableConditions, (value) => value, false);
  }

  refreshDocumentOptions();

  function lineMatches(document, selectedLine) {
    if (!selectedLine) return true;
    return document.line
      .split(",")
      .map((line) => line.trim())
      .includes(selectedLine);
  }

  function filteredDocuments() {
    const searchTerms = elements.search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

    let filtered = documents.filter((document) => {
      if (elements.group.value && document.group !== elements.group.value) return false;
      if (elements.condition.value && document.condition !== elements.condition.value) return false;
      if (elements.folder.value && document.folder !== elements.folder.value) return false;
      if (!lineMatches(document, elements.line.value)) return false;

      if (searchTerms.length) {
        const currentLink = effectiveLink(document);
        const searchable = [
          document.serial,
          document.title,
          document.reference,
          currentLink.title,
          document.line,
          document.folder,
          document.condition,
          document.group,
        ]
          .join(" ")
          .toLocaleLowerCase();

        if (!searchTerms.every((term) => searchable.includes(term))) return false;
      }

      return true;
    });

    if (state.sortKey) {
      const groupOrder = uniqueValues("group");
      const conditionOrder = uniqueValues("condition");

      filtered = [...filtered].sort((left, right) => {
        const groupDifference = groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group);
        if (groupDifference) return groupDifference;

        const conditionDifference =
          conditionOrder.indexOf(left.condition) - conditionOrder.indexOf(right.condition);
        if (conditionDifference) return conditionDifference;

        const leftValue = state.sortKey === "reference" ? effectiveLink(left).title : left[state.sortKey];
        const rightValue = state.sortKey === "reference" ? effectiveLink(right).title : right[state.sortKey];
        const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
          numeric: true,
          sensitivity: "base",
        });

        return comparison * state.sortDirection || left.row - right.row;
      });
    }

    return filtered;
  }

  function createCell(text, className, title = "") {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = text;
    if (title) cell.title = title;
    return cell;
  }

  function createGroupRow(entry) {
    const row = document.createElement("tr");
    row.className = "group-row";

    const groupIndex = uniqueValues("group").indexOf(entry.group);
    const code = String.fromCharCode(65 + groupIndex);
    const codeCell = createCell(code, "group-code");
    const labelCell = createCell(entry.group.toLocaleUpperCase(), "group-title");
    labelCell.colSpan = 6;

    row.append(codeCell, labelCell);
    return row;
  }

  function createConditionRow(entry) {
    const row = document.createElement("tr");
    const conditionClass = entry.condition.toLocaleLowerCase();
    row.className = `condition-row is-${conditionClass}`;

    const groupIndex = uniqueValues("group").indexOf(entry.group);
    const conditionIndex = uniqueValues("condition").indexOf(entry.condition);
    const code = `${String.fromCharCode(65 + groupIndex)}.${conditionIndex + 1}`;
    const codeCell = createCell(code, "group-code");
    const labelCell = createCell(entry.condition.toLocaleUpperCase(), "condition-title");
    labelCell.colSpan = 6;

    row.append(codeCell, labelCell);
    return row;
  }

  function createWiPdfCell(entry) {
    const cell = document.createElement("td");
    cell.className = "wi-pdf-cell";
    const wrapper = document.createElement("div");
    wrapper.className = "wi-pdf-actions";
    const metadata = wiPdfs.get(documentKey(entry));

    if (metadata) {
      const open = document.createElement("a");
      open.className = "wi-pdf-open";
      open.href = `${wiPdfsApi}?id=${encodeURIComponent(documentKey(entry))}`;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "Open PDF";
      open.title = metadata.fileName;
      wrapper.append(open);
    }

    if (state.isEditing) {
      const upload = document.createElement("button");
      upload.type = "button";
      upload.className = "wi-pdf-upload";
      upload.textContent = metadata ? "Replace" : "Upload PDF";
      upload.setAttribute(
        "aria-label",
        `${metadata ? "Replace" : "Upload"} WI PDF for ${entry.reference}`,
      );
      upload.addEventListener("click", () => openPdfUploader(entry, upload));
      wrapper.append(upload);
    } else if (!metadata) {
      const missing = document.createElement("span");
      missing.className = "wi-pdf-missing";
      missing.textContent = "No PDF";
      wrapper.append(missing);
    }
    cell.append(wrapper);
    return cell;
  }

  function createDocumentRow(entry) {
    const row = document.createElement("tr");
    row.className = "document-row";
    row.dataset.documentKey = documentKey(entry);

    row.append(createCell(entry.serial, "serial-cell"));
    const titleCell = document.createElement("td");
    titleCell.className = "title-cell";
    titleCell.title = entry.title;
    const titleWrapper = document.createElement("div");
    titleWrapper.className = "title-entry";
    const titleText = document.createElement("span");
    titleText.textContent = entry.title;
    titleWrapper.append(titleText);
    if (state.isEditing) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-wi-button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.reference} from the register`);
      remove.addEventListener("click", () => removeWorkInstruction(entry, remove));
      titleWrapper.append(remove);
    }
    titleCell.append(titleWrapper);
    row.append(titleCell);

    const reference = document.createElement("td");
    reference.className = "reference-cell";
    const referenceEditor = document.createElement("div");
    referenceEditor.className = "reference-editor";
    const referenceContent = document.createElement("div");
    referenceContent.className = "reference-content";
    const currentLink = effectiveLink(entry);

    if (currentLink.url && /^https?:\/\//i.test(currentLink.url)) {
      const link = document.createElement("a");
      link.className = "reference-link";
      link.href = currentLink.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = currentLink.title;
      link.title = `Open ${currentLink.title}`;
      referenceContent.append(link);
    } else {
      const plainReference = document.createElement("span");
      plainReference.className = "reference-without-link";
      plainReference.textContent = currentLink.title;
      plainReference.title = "No hyperlink is currently assigned to this reference.";
      referenceContent.append(plainReference);
    }

    referenceEditor.append(referenceContent);
    if (state.isEditing) {
      const editLink = document.createElement("button");
      editLink.type = "button";
      editLink.className = "link-edit-button";
      editLink.textContent = "Edit";
      editLink.setAttribute("aria-label", `Edit hyperlink for ${currentLink.title}`);
      editLink.addEventListener("click", () => openLinkEditor(entry, editLink));
      referenceEditor.append(editLink);
    }
    reference.append(referenceEditor);

    row.append(reference);
    row.append(createWiPdfCell(entry));
    row.append(createCell(entry.line, "line-cell"));
    row.append(
      createCell(entry.condition, `condition-cell is-${entry.condition.toLocaleLowerCase()}`),
    );
    row.append(createCell(entry.folder, "folder-cell", entry.folder));
    return row;
  }

  function setLinkStatus(message, isError = false) {
    elements.linkStatus.textContent = message;
    elements.linkStatus.classList.toggle("is-error", isError);
  }

  function openLinkEditor(entry, returnFocus) {
    if (!state.isEditing) return;
    const currentLink = effectiveLink(entry);
    state.activeLinkDocument = entry;
    state.linkEditorReturnFocus = returnFocus;
    elements.linkTitle.value = currentLink.title;
    elements.linkUrl.value = currentLink.url;
    setLinkStatus("");
    elements.linkEditor.hidden = false;
    elements.linkTitle.focus();
    elements.linkTitle.select();
  }

  function closeLinkEditor({ restoreFocus = true } = {}) {
    elements.linkEditor.hidden = true;
    elements.linkForm.reset();
    setLinkStatus("");
    state.activeLinkDocument = null;
    if (restoreFocus && state.linkEditorReturnFocus?.isConnected) {
      state.linkEditorReturnFocus.focus();
    }
    state.linkEditorReturnFocus = null;
  }

  function validHttpUrl(value) {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function saveLinkOverride(event) {
    event.preventDefault();
    const entry = state.activeLinkDocument;
    if (!entry) return;

    const title = elements.linkTitle.value.trim();
    const url = elements.linkUrl.value.trim();
    if (!title) {
      setLinkStatus("Enter a hyperlink title.", true);
      elements.linkTitle.focus();
      return;
    }
    if (!validHttpUrl(url)) {
      setLinkStatus("Enter a complete http:// or https:// URL.", true);
      elements.linkUrl.focus();
      return;
    }

    elements.linkSave.disabled = true;
    setLinkStatus("Saving for all devices…");

    try {
      const response = await fetch(linkOverridesApi, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: documentKey(entry), title, url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setEditMode(false);
        throw new Error(payload.error || "The shared link could not be saved.");
      }

      linkOverrides.set(documentKey(entry), payload.override);
      const savedDocumentKey = documentKey(entry);
      closeLinkEditor({ restoreFocus: false });
      render();
      document
        .querySelector(`.document-row[data-document-key="${CSS.escape(savedDocumentKey)}"] .link-edit-button`)
        ?.focus();
    } catch (error) {
      setLinkStatus(error.message || "The shared link could not be saved.", true);
    } finally {
      elements.linkSave.disabled = false;
    }
  }

  async function loadLinkOverrides() {
    try {
      const response = await fetch(linkOverridesApi, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json();
      for (const override of payload.overrides || []) {
        if (override?.id && typeof override.title === "string" && typeof override.url === "string") {
          linkOverrides.set(override.id, override);
        }
      }
      render();
    } catch {
      // The original static register remains usable while shared storage is unavailable.
    }
  }

  function setPdfStatus(message, isError = false) {
    elements.pdfStatus.textContent = message;
    elements.pdfStatus.classList.toggle("is-error", isError);
  }

  function updatePdfFileName() {
    const file = elements.pdfFile.files?.[0];
    elements.pdfFileName.textContent = file?.name || "No file selected";
    elements.pdfFileName.title = file?.name || "";
  }

  function openPdfUploader(entry, returnFocus) {
    if (!state.isEditing) return;
    state.activePdfDocument = entry;
    state.pdfUploaderReturnFocus = returnFocus;
    elements.pdfDocument.textContent = `${entry.reference} — ${entry.title}`;
    elements.pdfForm.reset();
    updatePdfFileName();
    setPdfStatus("");
    elements.pdfUploader.hidden = false;
    elements.pdfFile.focus();
  }

  function closePdfUploader({ restoreFocus = true } = {}) {
    elements.pdfUploader.hidden = true;
    elements.pdfForm.reset();
    updatePdfFileName();
    setPdfStatus("");
    state.activePdfDocument = null;
    if (restoreFocus && state.pdfUploaderReturnFocus?.isConnected) {
      state.pdfUploaderReturnFocus.focus();
    }
    state.pdfUploaderReturnFocus = null;
  }

  async function uploadWiPdf(event) {
    event.preventDefault();
    const entry = state.activePdfDocument;
    const file = elements.pdfFile.files?.[0];
    if (!entry || !file) {
      setPdfStatus("Choose a PDF file.", true);
      return;
    }
    if (!file.name.toLocaleLowerCase().endsWith(".pdf")) {
      setPdfStatus("Only PDF files are allowed.", true);
      return;
    }
    if (file.size > maxPdfBytes) {
      setPdfStatus("The PDF must be 25 MB or smaller.", true);
      return;
    }

    const formData = new FormData();
    formData.append("id", documentKey(entry));
    formData.append("file", file);
    elements.pdfSave.disabled = true;
    setPdfStatus("Uploading for all devices…");

    try {
      const response = await fetch(wiPdfsApi, {
        method: "PUT",
        headers: { Accept: "application/json" },
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setEditMode(false);
        throw new Error(payload.error || "The WI PDF could not be uploaded.");
      }

      wiPdfs.set(documentKey(entry), payload.pdf);
      const savedDocumentKey = documentKey(entry);
      closePdfUploader({ restoreFocus: false });
      render();
      document
        .querySelector(`.document-row[data-document-key="${CSS.escape(savedDocumentKey)}"] .wi-pdf-upload`)
        ?.focus();
    } catch (error) {
      setPdfStatus(error.message || "The WI PDF could not be uploaded.", true);
    } finally {
      elements.pdfSave.disabled = false;
    }
  }

  async function loadWiPdfs() {
    try {
      const response = await fetch(wiPdfsApi, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json();
      for (const pdf of payload.pdfs || []) {
        if (pdf?.id && typeof pdf.fileName === "string") wiPdfs.set(pdf.id, pdf);
      }
      render();
    } catch {
      // The register remains usable while PDF storage is unavailable.
    }
  }

  function setEditAuthStatus(message, isError = false) {
    elements.editAuthStatus.textContent = message;
    elements.editAuthStatus.classList.toggle("is-error", isError);
  }

  function setAddWiStatus(message, isError = false) {
    elements.addWiStatus.textContent = message;
    elements.addWiStatus.classList.toggle("is-error", isError);
  }

  function setEditMode(isEditing) {
    state.isEditing = isEditing;
    document.body.classList.toggle("is-edit-mode", isEditing);
    elements.editModeToggle.classList.toggle("is-active", isEditing);
    elements.editModeToggle.setAttribute("aria-pressed", String(isEditing));
    elements.editModeToggle.setAttribute("aria-haspopup", isEditing ? "false" : "dialog");
    elements.editModeLabel.textContent = isEditing ? "Exit edit" : "Edit mode";
    elements.editModeToggle.title = isEditing ? "Exit edit mode" : "Unlock edit mode";
    elements.addWiButton.hidden = !isEditing;

    if (!isEditing) {
      if (!elements.linkEditor.hidden) closeLinkEditor({ restoreFocus: false });
      if (!elements.pdfUploader.hidden) closePdfUploader({ restoreFocus: false });
      if (!elements.addWiModal.hidden) closeAddWi({ restoreFocus: false });
    }
    render();
  }

  function openEditAuth() {
    elements.editAuthForm.reset();
    setEditAuthStatus("");
    elements.editAuthModal.hidden = false;
    elements.editPassword.focus();
  }

  function closeEditAuth({ restoreFocus = true } = {}) {
    elements.editAuthModal.hidden = true;
    elements.editAuthForm.reset();
    setEditAuthStatus("");
    if (restoreFocus) elements.editModeToggle.focus();
  }

  async function unlockEditMode(event) {
    event.preventDefault();
    const password = elements.editPassword.value;
    if (!password) {
      setEditAuthStatus("Enter the edit-mode password.", true);
      elements.editPassword.focus();
      return;
    }

    elements.editAuthSubmit.disabled = true;
    setEditAuthStatus("Checking password…");
    try {
      const response = await fetch(editSessionApi, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Edit mode could not be unlocked.");

      closeEditAuth({ restoreFocus: false });
      setEditMode(true);
      elements.addWiButton.focus();
    } catch (error) {
      setEditAuthStatus(error.message || "Edit mode could not be unlocked.", true);
      elements.editPassword.select();
    } finally {
      elements.editAuthSubmit.disabled = false;
    }
  }

  async function loadEditSession() {
    try {
      const response = await fetch(editSessionApi, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json();
      setEditMode(payload.authenticated === true);
    } catch {
      setEditMode(false);
    }
  }

  async function exitEditMode() {
    elements.editModeToggle.disabled = true;
    try {
      await fetch(editSessionApi, { method: "DELETE", headers: { Accept: "application/json" } });
    } finally {
      elements.editModeToggle.disabled = false;
      setEditMode(false);
      elements.editModeToggle.focus();
    }
  }

  function openAddWi() {
    if (!state.isEditing) return;
    elements.addWiForm.reset();
    refreshDocumentOptions();
    elements.addWiLine.value = "3,4,5,6";
    elements.addWiFolder.value = "OCC";
    setAddWiStatus("");
    elements.addWiModal.hidden = false;
    elements.addWiTitle.focus();
  }

  function closeAddWi({ restoreFocus = true } = {}) {
    elements.addWiModal.hidden = true;
    elements.addWiForm.reset();
    setAddWiStatus("");
    if (restoreFocus && state.isEditing) elements.addWiButton.focus();
  }

  async function addWorkInstruction(event) {
    event.preventDefault();
    if (!state.isEditing) return;

    const input = {
      title: elements.addWiTitle.value.trim(),
      reference: elements.addWiReference.value.trim(),
      line: elements.addWiLine.value.trim(),
      condition: elements.addWiCondition.value,
      folder: elements.addWiFolder.value.trim(),
      group: elements.addWiGroup.value,
      linkTitle: elements.addWiLinkTitle.value.trim(),
      url: elements.addWiUrl.value.trim(),
    };
    if (documents.some((document) => document.reference.toLocaleLowerCase() === input.reference.toLocaleLowerCase())) {
      setAddWiStatus("That reference number already exists.", true);
      elements.addWiReference.focus();
      return;
    }
    if (!validHttpUrl(input.url)) {
      setAddWiStatus("Enter a complete http:// or https:// URL.", true);
      elements.addWiUrl.focus();
      return;
    }

    elements.addWiSave.disabled = true;
    setAddWiStatus("Saving for all devices…");
    try {
      const response = await fetch(documentsApi, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setEditMode(false);
        throw new Error(payload.error || "The work instruction could not be added.");
      }

      const addedId = payload.document?.id;
      closeAddWi({ restoreFocus: false });
      await loadDocumentChanges();
      resetFilters();
      document
        .querySelector(`.document-row[data-document-key="${CSS.escape(addedId || "")}"] .remove-wi-button`)
        ?.focus();
    } catch (error) {
      if (!elements.addWiModal.hidden) {
        setAddWiStatus(error.message || "The work instruction could not be added.", true);
      }
    } finally {
      elements.addWiSave.disabled = false;
    }
  }

  function orderedDocuments(entries) {
    const groupOrder = [...new Set(baseDocuments.map((document) => document.group))];
    const conditionOrder = [...new Set(baseDocuments.map((document) => document.condition))];
    return [...entries].sort((left, right) => {
      const groupDifference = groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group);
      if (groupDifference) return groupDifference;
      const conditionDifference =
        conditionOrder.indexOf(left.condition) - conditionOrder.indexOf(right.condition);
      if (conditionDifference) return conditionDifference;
      return left.row - right.row;
    });
  }

  async function loadDocumentChanges() {
    try {
      const response = await fetch(documentsApi, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json();
      const removedIds = new Set(Array.isArray(payload.removedIds) ? payload.removedIds : []);
      const customDocuments = Array.isArray(payload.documents) ? payload.documents : [];
      const maxRow = Math.max(0, ...baseDocuments.map((document) => Number(document.row) || 0));
      const maxSerial = Math.max(0, ...baseDocuments.map((document) => Number(document.serial) || 0));
      const custom = customDocuments.map((document, index) => ({
        documentKey: document.id,
        row: maxRow + index + 1,
        serial: String(maxSerial + index + 1),
        title: document.title,
        reference: document.reference,
        line: document.line,
        folder: document.folder,
        url: document.url || "",
        linkTitle: document.linkTitle || document.reference,
        group: document.group,
        condition: document.condition,
        createdAt: document.createdAt,
        isCustom: true,
      }));
      documents = orderedDocuments([
        ...baseDocuments.filter((document) => !removedIds.has(documentKey(document))),
        ...custom,
      ]);
      refreshDocumentOptions();
      render();
    } catch {
      // The static register remains available while shared document changes are unavailable.
    }
  }

  async function removeWorkInstruction(entry, button) {
    if (!state.isEditing) return;
    const confirmed = window.confirm(
      `Remove ${entry.reference} — ${entry.title}?\n\nIts saved hyperlink and uploaded WI PDF will also be removed.`,
    );
    if (!confirmed) return;

    button.disabled = true;
    const id = documentKey(entry);
    try {
      const response = await fetch(`${documentsApi}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setEditMode(false);
        throw new Error(payload.error || "The work instruction could not be removed.");
      }
      linkOverrides.delete(id);
      wiPdfs.delete(id);
      await loadDocumentChanges();
      elements.addWiButton.focus();
    } catch (error) {
      window.alert(error.message || "The work instruction could not be removed.");
      if (button.isConnected) button.disabled = false;
    }
  }

  function render() {
    const matches = filteredDocuments();
    const fragment = document.createDocumentFragment();

    if (!matches.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const message = createCell("No documents match your current search or filters.", "");
      message.colSpan = 7;
      row.append(message);
      fragment.append(row);
    }

    let previousGroup = "";
    let previousCondition = "";

    for (const document of matches) {
      if (document.group !== previousGroup) {
        fragment.append(createGroupRow(document));
        previousGroup = document.group;
        previousCondition = "";
      }

      if (document.condition !== previousCondition) {
        fragment.append(createConditionRow(document));
        previousCondition = document.condition;
      }

      fragment.append(createDocumentRow(document));
    }

    elements.rows.replaceChildren(fragment);

    if (matches.length === documents.length) {
      elements.summary.textContent = `Showing all ${matches.length} documents`;
    } else {
      elements.summary.textContent = `Showing ${matches.length} of ${documents.length} documents`;
    }
  }

  function refreshResults() {
    elements.scroll.scrollTop = 0;
    render();
  }

  function createAspDetailLine(label, value, className) {
    const line = document.createElement("p");
    line.className = className;

    const heading = document.createElement("strong");
    heading.textContent = `${label}: `;
    const content = document.createElement("span");
    content.textContent = value;

    line.append(heading, content);
    return line;
  }

  function openAspAnimation(plan) {
    elements.aspModalTitle.textContent = plan.title;
    elements.aspModalDetail.textContent = plan.detail;
    elements.aspAnimation.src = plan.animation;
    elements.aspAnimation.alt = `${plan.title} animated train service diagram`;
    elements.aspOriginal.href = plan.animation;
    elements.aspModal.hidden = false;
    elements.aspClose.focus();
  }

  function closeAspAnimation() {
    elements.aspModal.hidden = true;
    elements.aspAnimation.removeAttribute("src");
  }

  function renderAspPlans() {
    const searchTerms = (input) =>
      input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const blockageTerms = searchTerms(elements.aspBlockageSearch);
    const turnbackTerms = searchTerms(elements.aspTurnbackSearch);
    const shuttleTerms = searchTerms(elements.aspShuttleSearch);

    const plans = aspPlans.filter((plan) => {
      const blockage = plan.detail.toLocaleLowerCase();
      const turnback = plan.service.toLocaleLowerCase();
      const shuttle = plan.shuttle.toLocaleLowerCase();

      return (
        blockageTerms.every((term) => blockage.includes(term)) &&
        turnbackTerms.every((term) => turnback.includes(term)) &&
        shuttleTerms.every((term) => shuttle.includes(term))
      );
    });

    const fragment = document.createDocumentFragment();

    if (!plans.length) {
      const empty = document.createElement("tr");
      empty.className = "asp-empty-row";
      const message = document.createElement("td");
      message.colSpan = 3;
      message.textContent = "No alternative service plans match your search.";
      empty.append(message);
      fragment.append(empty);
    }

    for (const plan of plans) {
      const row = document.createElement("tr");
      row.className = "asp-row";
      row.dataset.asp = plan.number;

      const nameCell = document.createElement("td");
      const title = document.createElement("button");
      title.type = "button";
      title.className = "asp-title-button";
      title.textContent = plan.title;
      title.addEventListener("click", () => openAspAnimation(plan));
      nameCell.append(title);

      const detailCell = document.createElement("td");
      const description = document.createElement("p");
      description.className = "asp-detail-main";
      description.textContent = plan.detail;
      detailCell.append(description);
      if (plan.service) {
        detailCell.append(createAspDetailLine("Turnback", plan.service, "asp-detail-service"));
      }
      if (plan.shuttle) {
        detailCell.append(createAspDetailLine("Shuttle", plan.shuttle, "asp-detail-shuttle"));
      }

      const imageCell = document.createElement("td");
      imageCell.className = "asp-preview-cell";
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "asp-preview-button";
      preview.setAttribute("aria-label", `Open ${plan.title} animation`);

      const image = document.createElement("img");
      image.src = plan.thumbnail;
      image.alt = `${plan.title} diagram preview`;
      image.loading = "lazy";
      image.decoding = "async";

      const label = document.createElement("span");
      label.textContent = "View GIF";

      preview.append(image, label);
      preview.addEventListener("click", () => openAspAnimation(plan));
      imageCell.append(preview);

      row.append(nameCell, detailCell, imageCell);
      fragment.append(row);
    }

    elements.aspRows.replaceChildren(fragment);
    elements.aspSummary.textContent =
      plans.length === aspPlans.length
        ? `Showing all ${plans.length} alternative service plans`
        : `Showing ${plans.length} of ${aspPlans.length} alternative service plans`;
  }

  function resetFilters() {
    elements.group.value = "";
    elements.search.value = "";
    elements.line.value = "";
    elements.headerLine.value = "";
    elements.condition.value = "";
    elements.folder.value = "";
    state.sortKey = "";
    state.sortDirection = 1;
    document.querySelectorAll(".document-table th").forEach((header) => {
      header.removeAttribute("data-direction");
      header.removeAttribute("aria-sort");
    });
    refreshResults();
  }

  elements.search.addEventListener("input", refreshResults);
  elements.group.addEventListener("change", refreshResults);
  elements.condition.addEventListener("change", refreshResults);
  elements.folder.addEventListener("change", refreshResults);
  elements.clear.addEventListener("click", resetFilters);
  elements.editModeToggle.addEventListener("click", () => {
    if (state.isEditing) exitEditMode();
    else openEditAuth();
  });
  elements.editAuthForm.addEventListener("submit", unlockEditMode);
  elements.editAuthCancel.addEventListener("click", () => closeEditAuth());
  elements.editAuthClose.addEventListener("click", () => closeEditAuth());
  elements.editAuthModal.addEventListener("click", (event) => {
    if (event.target === elements.editAuthModal) closeEditAuth();
  });
  elements.addWiButton.addEventListener("click", openAddWi);
  elements.addWiForm.addEventListener("submit", addWorkInstruction);
  elements.addWiCancel.addEventListener("click", () => closeAddWi());
  elements.addWiClose.addEventListener("click", () => closeAddWi());
  elements.addWiModal.addEventListener("click", (event) => {
    if (event.target === elements.addWiModal) closeAddWi();
  });
  elements.linkForm.addEventListener("submit", saveLinkOverride);
  elements.linkCancel.addEventListener("click", () => closeLinkEditor());
  elements.linkClose.addEventListener("click", () => closeLinkEditor());
  elements.linkEditor.addEventListener("click", (event) => {
    if (event.target === elements.linkEditor) closeLinkEditor();
  });
  elements.pdfForm.addEventListener("submit", uploadWiPdf);
  elements.pdfFile.addEventListener("change", updatePdfFileName);
  elements.pdfCancel.addEventListener("click", () => closePdfUploader());
  elements.pdfClose.addEventListener("click", () => closePdfUploader());
  elements.pdfUploader.addEventListener("click", (event) => {
    if (event.target === elements.pdfUploader) closePdfUploader();
  });
  const aspSearchInputs = [
    elements.aspBlockageSearch,
    elements.aspTurnbackSearch,
    elements.aspShuttleSearch,
  ];
  aspSearchInputs.forEach((input) => input.addEventListener("input", renderAspPlans));
  elements.aspClose.addEventListener("click", closeAspAnimation);
  elements.aspModal.addEventListener("click", (event) => {
    if (event.target === elements.aspModal) closeAspAnimation();
  });

  elements.line.addEventListener("change", () => {
    elements.headerLine.value = elements.line.value;
    refreshResults();
  });

  elements.headerLine.addEventListener("change", () => {
    elements.line.value = elements.headerLine.value;
    refreshResults();
  });

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      state.sortDirection = state.sortKey === key ? state.sortDirection * -1 : 1;
      state.sortKey = key;

      document.querySelectorAll(".document-table th").forEach((header) => {
        header.removeAttribute("data-direction");
        header.removeAttribute("aria-sort");
      });

      const direction = state.sortDirection === 1 ? "ascending" : "descending";
      button.parentElement.dataset.direction = direction;
      button.parentElement.setAttribute("aria-sort", direction);
      refreshResults();
    });
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-nav]").forEach((item) => {
        item.classList.remove("is-active");
        item.removeAttribute("aria-current");
      });

      button.classList.add("is-active");
      button.setAttribute("aria-current", "page");

      const showAlternative = button.dataset.nav === "alternative";
      elements.toolbar.hidden = showAlternative;
      elements.register.hidden = showAlternative;
      elements.alternative.hidden = !showAlternative;
    });
  });

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
      elements.theme.setAttribute("aria-label", "Switch to light mode");
      elements.theme.title = "Switch to light mode";
    } else {
      delete document.documentElement.dataset.theme;
      elements.theme.setAttribute("aria-label", "Switch to dark mode");
      elements.theme.title = "Switch to dark mode";
    }
  }

  try {
    applyTheme(localStorage.getItem("occ-work-instructions-theme") || "light");
  } catch {
    applyTheme("light");
  }

  elements.theme.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem("occ-work-instructions-theme", nextTheme);
    } catch {
      // The selected theme still works when browser storage is unavailable.
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.editAuthModal.hidden) {
      closeEditAuth();
      return;
    }

    if (event.key === "Escape" && !elements.addWiModal.hidden) {
      closeAddWi();
      return;
    }

    if (event.key === "Escape" && !elements.pdfUploader.hidden) {
      closePdfUploader();
      return;
    }

    if (event.key === "Escape" && !elements.linkEditor.hidden) {
      closeLinkEditor();
      return;
    }

    if (event.key === "Escape" && !elements.aspModal.hidden) {
      closeAspAnimation();
      return;
    }

    const isTyping = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      (elements.alternative.hidden ? elements.search : elements.aspBlockageSearch).focus();
    }
    if (event.key === "Escape" && document.activeElement === elements.search) {
      elements.search.value = "";
      elements.search.blur();
      refreshResults();
    }

    if (event.key === "Escape" && aspSearchInputs.includes(document.activeElement)) {
      document.activeElement.value = "";
      document.activeElement.blur();
      renderAspPlans();
    }
  });

  render();
  renderAspPlans();
  loadDocumentChanges();
  loadLinkOverrides();
  loadWiPdfs();
  loadEditSession();
})();
