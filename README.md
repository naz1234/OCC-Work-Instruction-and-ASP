# OCC-Work-Instruction-and-ASP

Line 3 OCC Work Instruction and ASP

## OCC Work Instructions

A public, login-free document register for Cloudflare Pages. The main site stays framework-free and requires no build command. Pages Functions use Cloudflare D1 for shared metadata and R2 for uploaded WI PDF files so saved content appears on every device.

## Deploy with GitHub and Cloudflare Pages

1. Extract the ZIP file.
2. Create a GitHub repository and upload the extracted files, keeping `index.html` at the repository root.
3. In Cloudflare, open **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
4. Select your GitHub repository.
5. Choose **Framework preset: None**.
6. Leave **Build command** empty and use `/` as the **Build output directory**.
7. Select **Save and Deploy**.

### Enable shared hyperlink editing

1. Create a Cloudflare D1 database named `occ-work-instructions`.
2. Apply `migrations/0001_create_link_overrides.sql` in the D1 SQL Console. Alternatively, run this command from a computer terminal in the repository directory:

   ```bash
   npx wrangler@latest d1 migrations apply occ-work-instructions --remote
   ```

3. Open the Pages project and add a **D1 database binding** with variable name `OCC_LINKS`, selecting the `occ-work-instructions` database.
4. Add the same binding to both Production and Preview when PR previews must support editing.
5. Redeploy the Pages project so the binding takes effect.

The editor intentionally has no PIN or login. Anyone who can open the site can update a reference title or URL. Use Cloudflare's site access controls when edit access must be restricted to a group.

### Enable shared WI PDF uploads

1. Apply `migrations/0002_create_wi_pdfs.sql` to the same `occ-work-instructions` D1 database.
2. Create a private Cloudflare R2 bucket named `occ-wi-pdfs`.
3. Open the Pages project and add an **R2 bucket binding** with variable name `WI_PDFS`, selecting the `occ-wi-pdfs` bucket.
4. Add the binding to Production. Repeat for Preview only when PR preview deployments must support PDF uploads.
5. Redeploy the Pages project so the new Function and binding take effect.

Each work instruction supports one PDF of up to 25 MB. Uploading another PDF for the same work instruction replaces the existing file. The uploader has no PIN or login, matching the hyperlink editor.

The register itself does not require a login. Original EDMS destinations may still ask for organization credentials because their access is controlled by EDMS, not this website.

## Included features

- Original Excel document titles, references, serial numbers, line values, EDMS folder codes, and working embedded hyperlinks.
- Original Generic / Line 3 groups and Normal / Degraded / Emergency sections.
- References without an Excel hyperlink remain visible as plain text.
- Search, group filter, line filters, condition filter, exact EDMS folder filter, and sorting.
- All documents appear together in one continuous, scrollable register with no pagination.
- PIN-free Edit button for adding or updating each reference hyperlink and its displayed title.
- Hyperlink edits are stored in Cloudflare D1 and loaded on every device.
- **WI PDF (Not live from EDMS)** column with Upload PDF, Open PDF, and Replace actions.
- WI PDFs are stored privately in Cloudflare R2 with shared metadata in D1.
- 22 Alternative Services Mainline plans with station-level blockage, turnback, and shuttle details.
- Separate targeted search fields for line blockage, turnback, and shuttle details.
- Clickable lightweight ASP thumbnails that open the complete original animated GIF without loading every animation upfront.
- Optional dark mode, saved in the visitor's browser.
- Framework-free HTML, CSS, and JavaScript. The register remains readable when `index.html` is opened directly, while shared editing requires the deployed Cloudflare Pages Function.

## Updating the register from another Excel workbook

Install the only updater dependency and run:

```bash
pip install -r requirements.txt
python scripts/update_documents.py "path/to/your-work-instruction.xlsx"
```

Commit the updated `data.js` file to GitHub. Cloudflare Pages will redeploy automatically when the repository changes.
