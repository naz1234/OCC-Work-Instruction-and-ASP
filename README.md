# OCC-Work-Instruction-and-ASP

Line 3 OCC Work Instruction and ASP

## OCC Work Instructions

A public, login-free document register ready to deploy as a static website on Cloudflare Pages. It has no framework, build command, server, database, or account requirement.

## Deploy with GitHub and Cloudflare Pages

1. Extract the ZIP file.
2. Create a GitHub repository and upload the extracted files, keeping `index.html` at the repository root.
3. In Cloudflare, open **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
4. Select your GitHub repository.
5. Choose **Framework preset: None**.
6. Leave **Build command** empty and use `/` as the **Build output directory**.
7. Select **Save and Deploy**.

The register itself does not require a login. Original EDMS destinations may still ask for organization credentials because their access is controlled by EDMS, not this website.

## Included features

- Original Excel document titles, references, serial numbers, line values, EDMS folder codes, and working embedded hyperlinks.
- Original Generic / Line 3 groups and Normal / Degraded / Emergency sections.
- References without an Excel hyperlink remain visible as plain text.
- Search, group filter, line filters, condition filter, exact EDMS folder filter, sorting, and pagination.
- Optional dark mode, saved in the visitor's browser.
- Pure static HTML, CSS, and JavaScript that also work when `index.html` is opened directly on a computer.

## Updating the register from another Excel workbook

Install the only updater dependency and run:

```bash
pip install -r requirements.txt
python scripts/update_documents.py "path/to/your-work-instruction.xlsx"
```

Commit the updated `data.js` file to GitHub. Cloudflare Pages will redeploy automatically when the repository changes.
