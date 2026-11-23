# Nohada Trading PLC - Customs Clearing & CPO ERP System

Enterprise Customs Clearing, Inland Freight Corridor Dispatch, Multi-Bank CPO Guarantee Management, and Single Window Assessment ERP for Nohada Trading PLC (Mercato Ras Sosa Building #304, Addis Ababa).

---

## 🌟 Core Modules

1. **Executive Operations Dashboard**:
   - 4 White Card KPIs (Active Job Files, Multi-Bank CPO Guarantees, Transit Containers, Total Disbursed)
   - Live Active Shipments Pulse (5 latest files with 1-click Cockpit navigation)
   - Multi-Bank CPO Exposure Breakdown (BOA, CBE, Awash, NIB, Abukii)
   - Dry Port Corridor Dispatch (Mojo, Kality, Dewele / Djibouti)

2. **Digital Blue Jacket Registry (`#jobs`)**:
   - Central audit trail for shipments replacing paper folders
   - Real-time search, port filters, status tabs, and CSV/Print export tools

3. **Open New Job File (`#newjob`)**:
   - Full dedicated 5-section enterprise intake form
   - Consignee & File Assignment, Cargo & Container Details, Initial CPO Guarantee/Deposit
   - Custom text support for unlisted Shipping Lines and Banks ("Other")

4. **Multi-Bank CPO Guarantee Registry (`#cpo`)**:
   - Digitized Excel twin tracking 3.45M ETB in cashier payment orders
   - Interactive CPO return & handover workflow with bank filters

5. **Master File Cockpit (`#cockpit`)**:
   - Financial ledger: deposits vs operational expenses with net balance calculation
   - Document vault: 10 regulatory clearance documents with toggle audit trail
   - Printable customs clearance settlement statements

6. **Customs Duty & Tax Estimator (`#tax`)**:
   - Complete Ethiopian customs single window formula matching `TAX.xlsx`
   - DPV, Customs Duty (35%), Excise, Surtax, VAT (15%), and Withholding Tax (3%)

---

## 🚀 Deployment on Railway

This repository is pre-configured for **Railway 1-click deployment**:
- `Procfile` and `railway.json` specify `node backend/src/server.js`
- Express serves both the REST API and the responsive frontend SPA
- Port binding uses `process.env.PORT || 5000`

### Steps to Deploy on Railway:
1. Log into [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select `vicecityshort172-del/nohada-ERP`.
4. Railway will automatically build and deploy!
5. In **Settings** → **Networking**, click **Generate Domain** to get your public live URL.

---

## 💻 Local Development

```bash
# 1. Clone repository
git clone https://github.com/vicecityshort172-del/nohada-ERP.git
cd nohada-ERP

# 2. Install dependencies
npm install

# 3. Start local server
npm start
```

Open `http://localhost:5000` in your web browser.
