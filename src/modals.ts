import { App, Modal, Setting,ButtonComponent  } from "obsidian";
import type { NoteToFoundrySettings } from "./profiles/types";
import type { RelayWorld } from "./destinations/foundry/endpoints";

export class FooterHeaderModal extends Modal {
	private _header: string = "";
	private _footer: string = "";
	private onSubmit: (result: [string, string]) => void;

	constructor(app: App, header: string, footer: string, onSubmit: (result: [string, string]) => void) {
		super(app);
		this.onSubmit = onSubmit;
		this._header = header;
		this._footer = footer;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Enter your inputs which will be added to your export HTML" });
		// First text area
		new Setting(contentEl).setName("Header information ").addTextArea(textarea => {
			textarea.inputEl.rows = 12;
			textarea.inputEl.cols = 40;
			textarea.setValue(this._header);//(this._settings.footerAndHeader[0]);
			textarea.onChange(value => {
				this._header = value;
			});
		});

		// Second text area

		new Setting(contentEl).setName("Footer information").addTextArea(textarea => {
			textarea.inputEl.rows = 12;
			textarea.inputEl.cols = 40;
			textarea.setValue(this._footer)//(this._settings.footerAndHeader[1]);
			textarea.onChange(value => {
				this._footer = value;
			});
		});

		// Submit button
		new Setting(contentEl).addButton(btn =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit([this._header, this._footer]);
				})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class FoundrySelectIdModal extends Modal {
	private clients: RelayWorld[];
	private onSubmit: (selectedId: string | null) => void;
	private choosenClientId: string | null;

	constructor(app: App, clientList: RelayWorld[], onSubmit: (selectedId: string | null) => void) {
		super(app);
		this.clients = clientList;
		this.onSubmit = onSubmit;
		this.choosenClientId = clientList.length > 0 ? clientList[0]?.clientId : null;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty(); // clear the modal content
		contentEl.createEl("h2", { text: `${this.clients.length} Foundry instance${this.clients.length !== 1 ? 's' : ''} found - select an instance` });

		// Create a wrapper div to set css for flex layout
		const wrapper = contentEl.createDiv({ cls: "foundry-select-wrapper" });
		wrapper.setCssStyles({ display: 'flex', gap: '20px' });

		// Dropdown
		// LEFT: Dropdown in wrapper div
		const selectEl = wrapper.createEl("select", { cls: "foundry-select-dropdown" });
		this.clients.forEach(item => {
			const option = selectEl.createEl("option", { text: item.customName || item.worldTitle, value: item.clientId });
			if (item.clientId === this.choosenClientId) option.selected = true;
		});

		// RIGHT: Details pane in wrapper div
		const detailsPane = wrapper.createDiv({ cls: "foundry-details-pane" });
		detailsPane.setCssStyles({
			flex: '1',
			border: '1px solid var(--text-normal)',
			padding: '10px',
			overflowY: 'auto'
		});

		// Helper to update details pane
		const updateDetails = (clientId: string) => {
			detailsPane.empty(); // clear the pane after a selection
			const selectedClient = this.clients.find(c => c.clientId === clientId);
			if (!selectedClient) {
				detailsPane.createEl("p", { text: "No details available" });
				return;
			}
			// Show each property in the selected client object
			Object.entries(selectedClient).forEach(([key, value]) => {
				detailsPane.createEl("p", { text: `${key}: ${value}` });
			});
		};

		// Initial details display for initial selection
		if (this.choosenClientId) {
			const initialId = this.choosenClientId
			updateDetails(initialId);
		}


		selectEl.onchange = (e: Event) => {
			const returnFoundryID = (e.target as HTMLSelectElement).value // reads the selected options tag value
			updateDetails(returnFoundryID);
			this.choosenClientId = returnFoundryID ?? "";
		};

		// OK and Cancel buttons
		new Setting(contentEl)
			.addButton(btn =>
				btn
					.setButtonText("OK")
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.choosenClientId); //return the choosen clientID
					})
			)
			.addButton(btn =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
					this.onSubmit(null);
				})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class jsCodeModal extends Modal {
  private jsCode: string = "";
  private onSubmit: (result: string) => void;
  private _settings: NoteToFoundrySettings;


  constructor(app: App, settings: NoteToFoundrySettings, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this._settings = settings;
    this.jsCode = settings.jsCode;

  }
  onOpen() {
    const { contentEl } = this;
    contentEl.style.overflowY = "auto"; // Enable vertical scrolling
    contentEl.createEl("h2", { text: "Enter your javascript function. The HTML is available as 'html' variable. Return the HTML with a return statement. The 'api' object holds additional methods." });
    // First text area
    new Setting(contentEl).addTextArea(textarea => {
      textarea.inputEl.rows = 30;
      textarea.inputEl.cols = 60;
      textarea.inputEl.style.width = "100%";
      textarea.setValue(this._settings.jsCode);
      textarea.onChange(value => {
        this.jsCode = value;
      });
    });

    // Submit button
    new Setting(contentEl).addButton(btn =>
      btn
        .setButtonText("Submit")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(this.jsCode);
        })
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export type RowData = string[];
export type RowArray = RowData[];

export class MultiColumnListModal extends Modal {
  // =========================
  // Internal state
  // =========================

  private rows: RowArray;
  private columnCount: number;
  private columnHeaders: string[];
  private onSubmit: (result: RowArray | null) => void;
  private rowsContainer: HTMLElement | null = null;
  private heading: string;
  private headingText: string;

  // ----- Stable event handlers -----
  private resizeHandler = this.sizeModalToGrid.bind(this);
  private handleSubmit = this._handleSubmit.bind(this);
  private handleCancel = this._handleCancel.bind(this);
  private handleAddRowGlobal = this._addRow.bind(this);

  constructor(
    app: App,
    heading: string[] = ["", ""],
    initialRows: RowArray = [],
    onSubmit: (result: RowArray | null) => void,
    columnHeaders: string[] = []
  ) {
    super(app);

    this.heading = heading[0];
    this.headingText = heading[1];

    this.columnCount =
      columnHeaders.length || (initialRows[0]?.length ?? 2);

    this.columnHeaders =
      columnHeaders.length === this.columnCount
        ? columnHeaders
        : Array(this.columnCount)
            .fill(null)
            .map((_, i) => `Column ${i + 1}`);

    this.rows = initialRows.length
      ? initialRows.map(r => [
          ...r.slice(0, this.columnCount),
          ...Array(
            Math.max(0, this.columnCount - r.length)
          ).fill("")
        ])
      : [Array(this.columnCount).fill("")];

    this.onSubmit = onSubmit;
  }

  // =========================
  // Modal lifecycle
  // =========================

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("n2f-modal");

    const inputBoxSize = 25;
    const grid = [
      "2.5rem", "2.5rem", "20px",
      ...Array(this.columnCount).fill(`${inputBoxSize}rem`)
    ].join(" ");

    this.containerEl.style.setProperty("--n2f-grid-columns", grid);
    contentEl.addClass("n2f-modal-container");

    contentEl.createEl("h3", { text: this.heading });
    contentEl.createDiv({
      cls: "n2f-modal-explanation",
      text: this.headingText
    });

    this.rowsContainer = contentEl.createDiv({
      cls: "n2f-modal-two-column-rows-container"
    });

    this.renderRows();
    queueMicrotask(() => this.sizeModalToGrid());

    // ----- Attach stable resize handler -----
    window.addEventListener("resize", this.resizeHandler);

    // Footer buttons
    const footer = contentEl.createDiv({ cls: "n2f-modal-footer" });

    new Setting(footer)
      .addButton(btn => btn.setButtonText("OK").setCta().onClick(this.handleSubmit))
      .addButton(btn => btn.setButtonText("Cancel").onClick(this.handleCancel));
  }

  onClose() {
    window.removeEventListener("resize", this.resizeHandler);
    this.contentEl.empty();
  }

  // =========================
  // Footer handlers
  // =========================

  private _handleSubmit() {
    const cleaned = this.rows.filter(r => r.some(cell => cell !== ""));
    this.onSubmit(cleaned);
    this.close();
  }

  private _handleCancel() {
    this.onSubmit(null);
    this.close();
  }

  // =========================
  // Dynamic sizing
  // =========================

  private sizeModalToGrid() {
    if (!this.rowsContainer) return;
    const row = this.rowsContainer.querySelector<HTMLElement>(".n2f-modal-column-row");
    if (!row) return;

    const rowWidth = row.getBoundingClientRect().width;
    const styles = getComputedStyle(this.modalEl);

    const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const border = parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);

    this.modalEl.style.width = Math.min(rowWidth + padding + border, window.innerWidth * 0.8) + "px";
  }

  // =========================
  // Row operations (stable references)
  // =========================

  private _addRow() {
    this.rows.push(Array(this.columnCount).fill(""));
    this.renderRows();
  }

  private _deleteRow(index: number) {
    this.rows.length === 1 ? (this.rows[0] = Array(this.columnCount).fill("")) : this.rows.splice(index, 1);
    this.renderRows();
  }

  private _moveRow(index: number, offset: number) {
    const newIndex = index + offset;
    if (newIndex < 0 || newIndex >= this.rows.length) return;
    const [item] = this.rows.splice(index, 1);
    this.rows.splice(newIndex, 0, item);
    this.renderRows();
  }

  private _insertRowAfter(index: number) {
    this.rows.splice(index + 1, 0, Array(this.columnCount).fill(""));
    this.renderRows();
  }

  // =========================
  // Rendering rows
  // =========================

  private renderRows() {
    if (!this.rowsContainer) return;
    this.rowsContainer.empty();

    // Header
    const headerRow = this.rowsContainer.createDiv({ cls: "n2f-modal-column-row n2f-modal-header-row" });
    headerRow.createSpan({ text: "Delete" });
    headerRow.createSpan({ text: "Add" });
    headerRow.createSpan({ cls: "n2f-modal-row-drag-handle" });

    this.columnHeaders.forEach((header, colIndex) => {
      headerRow.createSpan({ cls: `n2f-modal-column-header n2f-column-${colIndex}`, text: header });
    });

    // Data rows
    this.rows.forEach((row, index) => {
      const rowEl = this.rowsContainer!.createDiv({ cls: "n2f-modal-column-row", attr: { "data-index": index.toString() } });
      new ButtonComponent(rowEl).setIcon("trash-2").setTooltip("Delete rule").onClick(() => this._deleteRow(index));
      new ButtonComponent(rowEl).setIcon("plus-circle").setTooltip("Add rule after this row").onClick(() => this._insertRowAfter(index));
      const handle = rowEl.createSpan({ cls: "n2f-modal-row-drag-handle", text: "\u22EE\u22EE", attr: {
        tabindex: "0", role: "button", "aria-label": "Move rule: drag, or Alt+Up and Alt+Down"
      } });
      handle.addEventListener("keydown", event => {
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          const offset = event.key === "ArrowUp" ? -1 : 1;
          this._moveRow(index, offset);
          this.rowsContainer?.querySelector<HTMLElement>(`[data-index="${Math.max(0, Math.min(this.rows.length - 1, index + offset))}"] .n2f-modal-row-drag-handle`)?.focus();
        }
      });

      for (let col = 0; col < this.columnCount; col++) {
        const input = rowEl.createEl("input", { type: "text", cls: `n2f-modal-column-input n2f-column-${col}` });
        input.value = row[col] ?? "";

        // Reusable input handler
        input.addEventListener("input", this._handleInput);
        input.dataset.rowIndex = index.toString();
        input.dataset.colIndex = col.toString();

        input.addEventListener("keydown", this._handleEnter);
      }

      this._attachDragHandlers(rowEl, handle);
    });

    // Global Add Row button
    this.rowsContainer.createEl("button", { text: "Add Row", cls: "n2f-modal-add-row-global" })
      .addEventListener("click", this.handleAddRowGlobal);

    queueMicrotask(() => this.sizeModalToGrid());
  }

  // =========================
  // Input handlers (reusable)
  // =========================

  private _handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const row = Number(input.dataset.rowIndex);
    const col = Number(input.dataset.colIndex);
    if (!isNaN(row) && !isNaN(col)) this.rows[row][col] = input.value;
  };

  private _handleEnter = (e: KeyboardEvent) => {
    const input = e.target as HTMLInputElement;
    const row = Number(input.dataset.rowIndex);
    if (e.key === "Enter" && row === this.rows.length - 1) {
      e.preventDefault();
      this._addRow();
    }
  };

  // =========================
  // Drag & drop (single stable handler)
  // =========================

  private _attachDragHandlers(rowEl: HTMLElement, handle: HTMLElement) {
    let dragStartIndex: number | null = null;

    handle.addEventListener("mousedown", () => (rowEl.draggable = true));
    handle.addEventListener("mouseup", () => (rowEl.draggable = false));
    rowEl.addEventListener("mousedown", event => {
      if (event.target !== handle) rowEl.draggable = false;
    });

    rowEl.addEventListener("dragstart", (e) => {
      if (!rowEl.draggable || !e.dataTransfer) { e.preventDefault(); return; }
      dragStartIndex = Number(rowEl.getAttr("data-index"));
      rowEl.addClass("dragging");
      e.dataTransfer?.setData("text/plain", dragStartIndex.toString());
      e.dataTransfer!.effectAllowed = "move";
    });

    rowEl.addEventListener("dragend", () => {
      rowEl.draggable = false;
      rowEl.removeClass("dragging");
      dragStartIndex = null;
    });

    rowEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      rowEl.addClass("drag-over");
    });

    rowEl.addEventListener("dragleave", () => rowEl.removeClass("drag-over"));

    rowEl.addEventListener("drop", (e) => {
      e.preventDefault();
      rowEl.removeClass("drag-over");

      const raw = e.dataTransfer?.getData("text/plain");
      if (dragStartIndex === null && !raw) return;
      const fromIndex = dragStartIndex ?? Number(raw);
      const toIndex = Number(rowEl.getAttr("data-index"));

      if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= this.rows.length || isNaN(toIndex) || fromIndex === toIndex) return;

      const [moved] = this.rows.splice(fromIndex, 1);
      this.rows.splice(toIndex, 0, moved);
      this.renderRows();
    });
  }
}

export class ConfirmModal extends Modal {
  private result: Promise<string> | null = null;
  private resolver: ((result: string) => void) | null = null;

  constructor(
    app: App,
    private text: string,   // erklärender Text des Dialogs
  ) {
    super(app);
  }

  // öffnet das Modal und gibt ein Promise<string> zurück
  openAsPromise(): Promise<string> {
    if (this.result) {
      return this.result; // bereits geöffnet? dann das bestehende Promise zurückgeben
    }

    this.result = new Promise<string>((resolve) => {
      this.resolver = resolve;
    });

    this.open();
    return this.result;
  }

  onOpen() {
    const { contentEl } = this;

    // Titel
    contentEl.createEl("h3", { text: "Confirmation!" });
    
    //contentEl.style.width="fit-content"
   
    
    // Text
    const MessageText = contentEl.createDiv();
    MessageText.innerHTML = this.text
    MessageText.style.setProperty("padding","1.5rem")
    
    // Zeile für Yes / No
    const row1 = contentEl.createDiv({ cls: "n2f-modal-button-row" });
    row1.style.display = "flex";
    //row1.style.alignSelf ="center"
    row1.style.justifyContent = "flex-end";
    row1.style.gap = "10px";
    row1.style.margin = "1rem"
    row1.style.grid
    new ButtonComponent(row1)
      .setButtonText("Yes")
      .setCta()
      .onClick(() => {
        this.resolver?.("yes");
        this.close();
      });
    new ButtonComponent(row1)
      .setButtonText("No")
      .onClick(() => {
        this.resolver?.("no");
        this.close();
      });

    // Cancel unten rechts; inkl. „X“
    const row2 = contentEl.createDiv({ cls: "n2f-modal-button-row" });
    row2.style.display = "flex";
    row2.style.justifyContent = "flex-start";
    new ButtonComponent(row2)
      .setButtonText("Cancel")
      .onClick(() => {
        this.resolver?.("cancel");
        this.close();
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // Schließen per X gilt ebenfalls als Cancel
    if (this.resolver && this.result) {
      this.resolver("cancel");
    }

    this.resolver = null;
    this.result= null;
  }
}



