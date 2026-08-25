(() => {
  "use strict";

  const source = window.OCC_DATA;
  const linkOverridesApi = "/api/link-overrides";

  if (!source || !Array.isArray(source.documents)) {
    document.getElementById("document-rows").innerHTML =
      '<tr class="empty-row"><td colspan="6">Document data could not be loaded.</td></tr>';
    return;
  }

  const documents = source.documents;
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
  };

  const state = {
    sortKey: "",
    sortDirection: 1,
    activeLinkDocument: null,
    linkEditorReturnFocus: null,
  };
  const linkOverrides = new Map();

  const uniqueValues = (key) =>
    [...new Set(documents.map((document) => document[key]).filter(Boolean))];

  const documentKey = (entry) => {
    const referenceKey = entry.reference
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return referenceKey ? `reference-${referenceKey}` : `row-${entry.row}`;
  };

  function effectiveLink(entry) {
    const override = linkOverrides.get(documentKey(entry));
    return {
      title: override?.title ?? entry.reference,
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

  addOptions(elements.group, uniqueValues("group"));
  addOptions(elements.line, lines, (line) => `Line ${line}`);
  addOptions(elements.headerLine, lines, (line) => `Line ${line}`);
  addOptions(elements.condition, uniqueValues("condition"));
  addOptions(elements.folder, uniqueValues("folder").sort());

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
    labelCell.colSpan = 5;

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
    labelCell.colSpan = 5;

    row.append(codeCell, labelCell);
    return row;
  }

  function createDocumentRow(entry) {
    const row = document.createElement("tr");
    row.className = "document-row";
    row.dataset.sourceRow = String(entry.row);

    row.append(createCell(entry.serial, "serial-cell"));
    row.append(createCell(entry.title, "title-cell", entry.title));

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

    const editLink = document.createElement("button");
    editLink.type = "button";
    editLink.className = "link-edit-button";
    editLink.textContent = "Edit";
    editLink.setAttribute("aria-label", `Edit hyperlink for ${currentLink.title}`);
    editLink.addEventListener("click", () => openLinkEditor(entry, editLink));
    referenceEditor.append(referenceContent, editLink);
    reference.append(referenceEditor);

    row.append(reference);
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
        throw new Error(payload.error || "The shared link could not be saved.");
      }

      linkOverrides.set(documentKey(entry), payload.override);
      const sourceRow = entry.row;
      closeLinkEditor({ restoreFocus: false });
      render();
      document
        .querySelector(`.document-row[data-source-row="${sourceRow}"] .link-edit-button`)
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

  function render() {
    const matches = filteredDocuments();
    const fragment = document.createDocumentFragment();

    if (!matches.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const message = createCell("No documents match your current search or filters.", "");
      message.colSpan = 6;
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
  elements.linkForm.addEventListener("submit", saveLinkOverride);
  elements.linkCancel.addEventListener("click", () => closeLinkEditor());
  elements.linkClose.addEventListener("click", () => closeLinkEditor());
  elements.linkEditor.addEventListener("click", (event) => {
    if (event.target === elements.linkEditor) closeLinkEditor();
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
  loadLinkOverrides();
})();
